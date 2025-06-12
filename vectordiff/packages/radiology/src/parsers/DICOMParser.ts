/**
 * Parser plików DICOM (Digital Imaging and Communications in Medicine)
 * 
 * DICOM to standard w obrazowaniu medycznym, który zawiera:
 * - Dane obrazowe (piksele)
 * - Metadane pacjenta i badania
 * - Parametry akwizycji
 * - Informacje o sprzęcie
 * 
 * Ten parser konwertuje dane DICOM na format VectorDiff,
 * umożliwiając śledzenie zmian między badaniami
 */

import * as dicomParser from 'dicom-parser';
import { 
  RadiologyAnimation,
  ImagingModality,
  AcquisitionParameters,
  AnatomicalSegmentation,
  SegmentationRepresentation,
  ContourRepresentation
} from '../types/radiology-format';
import { createEmptyAnimation } from '@vectordiff/core';

export interface DICOMSeries {
  seriesInstanceUID: string;
  seriesDescription: string;
  modality: string;
  images: DICOMImage[];
}

export interface DICOMImage {
  sopInstanceUID: string;
  instanceNumber: number;
  imagePosition: [number, number, number];
  imageOrientation: number[];
  pixelData: Uint16Array | Int16Array;
  rows: number;
  columns: number;
  pixelSpacing: [number, number];
  sliceThickness: number;
  windowCenter?: number;
  windowWidth?: number;
}

export class DICOMParser {
  private series: Map<string, DICOMSeries> = new Map();
  
  /**
   * Parsuje serię plików DICOM i konwertuje na animację VectorDiff
   * @param dicomFiles Tablica buforów z plikami DICOM
   * @param segmentationCallback Opcjonalna funkcja do automatycznej segmentacji
   * @returns Animacja radiologiczna
   */
  public async parseSeries(
    dicomFiles: ArrayBuffer[],
    segmentationCallback?: (images: DICOMImage[]) => Promise<AnatomicalSegmentation[]>
  ): Promise<RadiologyAnimation> {
    // Resetujemy stan
    this.series.clear();
    
    // Parsujemy każdy plik DICOM
    for (const fileBuffer of dicomFiles) {
      try {
        this.parseDICOMFile(fileBuffer);
      } catch (error) {
        console.error('Error parsing DICOM file:', error);
      }
    }
    
    // Wybieramy główną serię (zazwyczaj jest tylko jedna)
    const mainSeries = Array.from(this.series.values())[0];
    if (!mainSeries) {
      throw new Error('No valid DICOM series found');
    }
    
    // Sortujemy obrazy według pozycji
    mainSeries.images.sort((a, b) => {
      // Sortowanie według pozycji Z (wzdłuż osi pacjenta)
      return a.imagePosition[2] - b.imagePosition[2];
    });
    
    // Wykonujemy segmentację jeśli dostarczona funkcja
    let segmentations: AnatomicalSegmentation[] = [];
    if (segmentationCallback) {
      segmentations = await segmentationCallback(mainSeries.images);
    }
    
    // Konwertujemy na format VectorDiff
    return this.convertToVectorDiff(mainSeries, segmentations);
  }
  
  /**
   * Parsuje pojedynczy plik DICOM
   */
  private parseDICOMFile(arrayBuffer: ArrayBuffer): void {
    const byteArray = new Uint8Array(arrayBuffer);
    const dataSet = dicomParser.parseDicom(byteArray);
    
    // Ekstraktujemy podstawowe informacje
    const seriesUID = dataSet.string('x0020000e') || 'unknown';
    const sopInstanceUID = dataSet.string('x00080018') || '';
    const modality = dataSet.string('x00080060') || 'OT';
    
    // Tworzmy serię jeśli nie istnieje
    if (!this.series.has(seriesUID)) {
      this.series.set(seriesUID, {
        seriesInstanceUID: seriesUID,
        seriesDescription: dataSet.string('x0008103e') || '',
        modality: modality,
        images: []
      });
    }
    
    // Ekstraktujemy dane obrazu
    const image: DICOMImage = {
      sopInstanceUID: sopInstanceUID,
      instanceNumber: dataSet.intString('x00200013') || 0,
      imagePosition: this.parseImagePosition(dataSet),
      imageOrientation: this.parseImageOrientation(dataSet),
      pixelData: this.extractPixelData(dataSet),
      rows: dataSet.uint16('x00280010') || 0,
      columns: dataSet.uint16('x00280011') || 0,
      pixelSpacing: this.parsePixelSpacing(dataSet),
      sliceThickness: dataSet.floatString('x00180050') || 1.0,
      windowCenter: dataSet.floatString('x00281050'),
      windowWidth: dataSet.floatString('x00281051')
    };
    
    this.series.get(seriesUID)!.images.push(image);
  }
  
  /**
   * Parsuje pozycję obrazu w przestrzeni pacjenta
   */
  private parseImagePosition(dataSet: any): [number, number, number] {
    const position = dataSet.string('x00200032');
    if (!position) return [0, 0, 0];
    
    const values = position.split('\\').map(parseFloat);
    return [values[0] || 0, values[1] || 0, values[2] || 0];
  }
  
  /**
   * Parsuje orientację obrazu (cosinus kierunkowe)
   */
  private parseImageOrientation(dataSet: any): number[] {
    const orientation = dataSet.string('x00200037');
    if (!orientation) return [1, 0, 0, 0, 1, 0];
    
    return orientation.split('\\').map(parseFloat);
  }
  
  /**
   * Parsuje spacing pikseli
   */
  private parsePixelSpacing(dataSet: any): [number, number] {
    const spacing = dataSet.string('x00280030');
    if (!spacing) return [1, 1];
    
    const values = spacing.split('\\').map(parseFloat);
    return [values[0] || 1, values[1] || 1];
  }
  
  /**
   * Ekstraktuje dane pikselowe
   */
  private extractPixelData(dataSet: any): Uint16Array | Int16Array {
    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement) {
      throw new Error('No pixel data found in DICOM file');
    }
    
    const pixelData = dataSet.byteArray.slice(
      pixelDataElement.dataOffset,
      pixelDataElement.dataOffset + pixelDataElement.length
    );
    
    // Określamy czy dane są signed czy unsigned
    const pixelRepresentation = dataSet.uint16('x00280103') || 0;
    const bitsAllocated = dataSet.uint16('x00280100') || 16;
    
    if (bitsAllocated === 16) {
      if (pixelRepresentation === 0) {
        return new Uint16Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength / 2);
      } else {
        return new Int16Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength / 2);
      }
    }
    
    // Dla innych głębi bitowych wymagana byłaby dodatkowa konwersja
    throw new Error(`Unsupported bits allocated: ${bitsAllocated}`);
  }
  
  /**
   * Konwertuje serię DICOM na animację VectorDiff
   */
  private convertToVectorDiff(
    series: DICOMSeries,
    segmentations: AnatomicalSegmentation[]
  ): RadiologyAnimation {
    // Obliczamy wymiary objętości
    const firstImage = series.images[0];
    const lastImage = series.images[series.images.length - 1];
    
    const width = firstImage.columns * firstImage.pixelSpacing[0];
    const height = firstImage.rows * firstImage.pixelSpacing[1];
    const depth = Math.abs(lastImage.imagePosition[2] - firstImage.imagePosition[2]) + 
                  lastImage.sliceThickness;
    
    // Tworzymy animację bazową
    const animation = createEmptyAnimation(width, height, depth) as RadiologyAnimation;
    
    // Uzupełniamy metadane
    animation.metadata.author = 'DICOM Parser';
    animation.metadata.creationDate = new Date().toISOString();
    
    // Dane obrazowania
    animation.imagingData = {
      modality: series.modality as ImagingModality,
      studyDate: new Date().toISOString(), // W prawdziwej implementacji z DICOM
      studyDescription: series.seriesDescription,
      seriesDescription: series.seriesDescription,
      acquisitionParameters: this.extractAcquisitionParameters(series)
    };
    
    // Dodajemy segmentacje
    animation.segmentations = segmentations;
    
    // Tworzymy obiekt volume w scenie
    animation.baseScene.objects.push({
      id: 'medical_volume_main',
      type: 'medical-image',
      data: {
        imageType: 'volume',
        dicomUid: series.seriesInstanceUID,
        windowCenter: firstImage.windowCenter,
        windowWidth: firstImage.windowWidth
      },
      attributes: {
        visible: true,
        opacity: 1.0
      }
    });
    
    // Dodajemy obiekty segmentacji
    segmentations.forEach((seg, index) => {
      animation.baseScene.objects.push({
        id: `segmentation_${index}`,
        type: 'segmentation',
        data: seg,
        attributes: {
          visible: true,
          color: this.getSegmentationColor(seg.anatomicalStructure.category),
          opacity: 0.7
        }
      });
    });
    
    return animation;
  }
  
  /**
   * Ekstraktuje parametry akwizycji z serii
   */
  private extractAcquisitionParameters(series: DICOMSeries): AcquisitionParameters {
    const firstImage = series.images[0];
    
    const params: AcquisitionParameters = {
      pixelSpacing: firstImage.pixelSpacing,
      sliceThickness: firstImage.sliceThickness,
      imageOrientation: firstImage.imageOrientation,
      imagePosition: firstImage.imagePosition
    };
    
    // Dodatkowe parametry w zależności od modalności
    // (W prawdziwej implementacji ekstraktowalibyśmy z DICOM tags)
    
    return params;
  }
  
  /**
   * Przypisuje kolor do kategorii anatomicznej
   */
  private getSegmentationColor(category: string): string {
    const colorMap: { [key: string]: string } = {
      'organ': '#ff6b6b',
      'vessel': '#4ecdc4',
      'bone': '#f9f9f9',
      'muscle': '#ee5a6f',
      'lesion': '#ffe66d',
      'other': '#95e1d3'
    };
    
    return colorMap[category] || '#cccccc';
  }
}

/**
 * Klasa do automatycznej segmentacji używająca AI
 * To jest uproszczona implementacja - w praktyce używalibyśmy
 * modeli deep learning jak U-Net
 */
export class AutoSegmentation {
  /**
   * Wykonuje automatyczną segmentację narządów
   * @param images Obrazy DICOM
   * @returns Segmentacje anatomiczne
   */
  public static async performSegmentation(
    images: DICOMImage[]
  ): Promise<AnatomicalSegmentation[]> {
    const segmentations: AnatomicalSegmentation[] = [];
    
    // Przykład: segmentacja płuc na obrazach CT klatki piersiowej
    if (images.length > 0) {
      const lungSegmentation = await this.segmentLungs(images);
      if (lungSegmentation) {
        segmentations.push(lungSegmentation);
      }
    }
    
    return segmentations;
  }
  
  /**
   * Segmentacja płuc (uproszczona)
   * W prawdziwej implementacji używalibyśmy modelu AI
   */
  private static async segmentLungs(images: DICOMImage[]): Promise<AnatomicalSegmentation | null> {
    // Symulujemy segmentację przez progowanie
    const contours: Array<{ sliceNumber: number, contours: Array<[number, number][]> }> = [];
    
    images.forEach((image, index) => {
      // Progowanie dla powietrza w płucach (około -500 HU w CT)
      const threshold = -500;
      const binaryMask = this.thresholdImage(image.pixelData, threshold);
      
      // Znajdowanie konturów (uproszczone)
      const contour = this.findLargestContour(binaryMask, image.rows, image.columns);
      
      if (contour.length > 0) {
        contours.push({
          sliceNumber: index,
          contours: [contour]
        });
      }
    });
    
    if (contours.length === 0) return null;
    
    // Obliczamy bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    contours.forEach(({ sliceNumber, contours: sliceContours }) => {
      sliceContours[0].forEach(point => {
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      });
      minZ = Math.min(minZ, sliceNumber);
      maxZ = Math.max(maxZ, sliceNumber);
    });
    
    const representation: ContourRepresentation = {
      type: 'contour',
      slices: contours
    };
    
    return {
      segmentationId: 'lungs_auto',
      anatomicalStructure: {
        name: 'Lungs',
        snomedCode: '39607008',
        category: 'organ',
        laterality: 'bilateral'
      },
      segmentationType: 'automatic',
      confidence: 0.85,
      boundingBox: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ]
      },
      representation
    };
  }
  
  /**
   * Progowanie obrazu
   */
  private static thresholdImage(
    pixelData: Uint16Array | Int16Array,
    threshold: number
  ): Uint8Array {
    const binaryMask = new Uint8Array(pixelData.length);
    
    for (let i = 0; i < pixelData.length; i++) {
      binaryMask[i] = pixelData[i] > threshold ? 1 : 0;
    }
    
    return binaryMask;
  }
  
  /**
   * Znajduje największy kontur (bardzo uproszczone)
   */
  private static findLargestContour(
    binaryMask: Uint8Array,
    rows: number,
    columns: number
  ): Array<[number, number]> {
    // To jest placeholder - w rzeczywistości użylibyśmy
    // algorytmu jak marching squares
    const contour: Array<[number, number]> = [];
    
    // Znajdź granice obiektu
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const index = y * columns + x;
        
        if (binaryMask[index] === 1) {
          // Sprawdź czy to krawędź
          const isEdge = 
            x === 0 || x === columns - 1 ||
            y === 0 || y === rows - 1 ||
            binaryMask[index - 1] === 0 ||
            binaryMask[index + 1] === 0 ||
            binaryMask[index - columns] === 0 ||
            binaryMask[index + columns] === 0;
          
          if (isEdge) {
            contour.push([x, y]);
          }
        }
      }
    }
    
    return contour;
  }
}

/**
 * Funkcja pomocnicza do szybkiego parsowania serii DICOM
 */
export async function parseDICOMSeries(
  files: File[] | ArrayBuffer[],
  enableAutoSegmentation: boolean = false
): Promise<RadiologyAnimation> {
  const parser = new DICOMParser();
  
  // Konwertuj File[] na ArrayBuffer[] jeśli potrzeba
  let buffers: ArrayBuffer[];
  
  if (files[0] instanceof File) {
    buffers = await Promise.all(
      (files as File[]).map(file => file.arrayBuffer())
    );
  } else {
    buffers = files as ArrayBuffer[];
  }
  
  // Parsuj z opcjonalną segmentacją
  const segmentationCallback = enableAutoSegmentation 
    ? AutoSegmentation.performSegmentation 
    : undefined;
  
  return parser.parseSeries(buffers, segmentationCallback);
}

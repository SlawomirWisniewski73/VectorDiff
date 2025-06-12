/**
 * Definicje typów dla obrazowania medycznego w VectorDiff
 * 
 * Ten moduł rozszerza podstawowy format o struktury specyficzne
 * dla diagnostyki radiologicznej:
 * - Dane objętościowe z CT/MRI
 * - Segmentacje anatomiczne
 * - Śledzenie zmian patologicznych
 * - Pomiary i adnotacje
 * 
 * Kluczowa koncepcja: zamiast przechowywać pełne skany 3D,
 * śledzimy tylko zmiany w strukturach anatomicznych między badaniami
 */

import { VectorDiffAnimation, VectorObject, Transformation } from '@vectordiff/core';

/**
 * Rozszerzona animacja radiologiczna
 */
export interface RadiologyAnimation extends VectorDiffAnimation {
  // Dane obrazowania
  imagingData: {
    modality: ImagingModality;
    studyDate: string;
    studyDescription: string;
    seriesDescription?: string;
    institution?: string;
    manufacturer?: string;
    // Parametry akwizycji
    acquisitionParameters: AcquisitionParameters;
  };
  
  // Dane pacjenta (zanonimizowane)
  patientData?: {
    anonymizedId: string;
    age?: number;
    sex?: 'M' | 'F' | 'O';
    clinicalHistory?: string[];
  };
  
  // Segmentacje anatomiczne
  segmentations?: AnatomicalSegmentation[];
  
  // Pomiary i biomarkery
  measurements?: Measurement[];
  
  // Porównanie z poprzednimi badaniami
  comparisonStudies?: {
    studyId: string;
    studyDate: string;
    findings: FindingComparison[];
  }[];
}

/**
 * Modalności obrazowania
 */
export type ImagingModality = 
  | 'CT'      // Tomografia komputerowa
  | 'MR'      // Rezonans magnetyczny
  | 'PT'      // PET
  | 'US'      // Ultrasonografia
  | 'XR'      // Radiografia
  | 'NM'      // Medycyna nuklearna
  | 'MG'      // Mammografia
  | 'CR';     // Radiografia komputerowa

/**
 * Parametry akwizycji obrazu
 */
export interface AcquisitionParameters {
  // Wspólne dla wszystkich modalności
  pixelSpacing: [number, number];      // mm/pixel
  sliceThickness?: number;             // mm
  sliceSpacing?: number;               // mm
  imageOrientation?: number[];         // Cosinus kierunkowy
  imagePosition?: [number, number, number]; // Pozycja w przestrzeni pacjenta
  
  // Specyficzne dla CT
  kvp?: number;                        // Napięcie lampy
  exposureTime?: number;               // ms
  xRayTubeCurrent?: number;           // mA
  ctdiVol?: number;                   // Dawka promieniowania
  
  // Specyficzne dla MR
  magneticFieldStrength?: number;      // Tesla
  repetitionTime?: number;             // TR w ms
  echoTime?: number;                   // TE w ms
  flipAngle?: number;                  // Stopnie
  sequenceName?: string;               // Nazwa sekwencji
}

/**
 * Segmentacja anatomiczna
 * Reprezentuje wydzieloną strukturę anatomiczną
 */
export interface AnatomicalSegmentation {
  segmentationId: string;
  anatomicalStructure: AnatomicalStructure;
  segmentationType: 'manual' | 'semi-automatic' | 'automatic' | 'ai-generated';
  confidence?: number;                 // 0-1 dla segmentacji automatycznych
  volume?: number;                     // cm³
  surfaceArea?: number;               // cm²
  meanIntensity?: number;             // Średnia intensywność sygnału
  boundingBox: BoundingBox3D;
  // Dane konturu lub meshu
  representation: SegmentationRepresentation;
}

/**
 * Struktury anatomiczne
 */
export interface AnatomicalStructure {
  name: string;
  snomedCode?: string;               // SNOMED CT code
  category: 'organ' | 'vessel' | 'bone' | 'muscle' | 'lesion' | 'other';
  laterality?: 'left' | 'right' | 'bilateral';
  parent?: string;                    // Struktura nadrzędna
}

/**
 * Reprezentacja segmentacji
 */
export type SegmentationRepresentation = 
  | ContourRepresentation
  | MeshRepresentation
  | VoxelRepresentation;

export interface ContourRepresentation {
  type: 'contour';
  slices: Array<{
    sliceNumber: number;
    contours: Array<[number, number][]>; // Wielokąty na każdym przekroju
  }>;
}

export interface MeshRepresentation {
  type: 'mesh';
  vertices: Array<[number, number, number]>;
  faces: Array<[number, number, number]>; // Indeksy wierzchołków
  normals?: Array<[number, number, number]>;
}

export interface VoxelRepresentation {
  type: 'voxel';
  voxelData: Uint8Array;              // Maska binarna
  dimensions: [number, number, number];
  origin: [number, number, number];
  spacing: [number, number, number];
}

/**
 * Pomiary kliniczne
 */
export interface Measurement {
  measurementId: string;
  type: MeasurementType;
  value: number;
  unit: string;
  location?: [number, number, number];
  associatedSegmentation?: string;
  normalRange?: { min: number, max: number };
  interpretation?: 'normal' | 'abnormal' | 'borderline';
}

export type MeasurementType = 
  | 'diameter'          // Średnica (np. guza)
  | 'volume'            // Objętość
  | 'area'              // Powierzchnia
  | 'angle'             // Kąt
  | 'density'           // Gęstość (HU dla CT)
  | 'intensity'         // Intensywność sygnału
  | 'distance'          // Odległość między punktami
  | 'RECIST';           // Response Evaluation Criteria in Solid Tumors

/**
 * Bounding box 3D
 */
export interface BoundingBox3D {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Porównanie znalezisk między badaniami
 */
export interface FindingComparison {
  findingId: string;
  findingType: 'lesion' | 'anatomical-change' | 'post-treatment';
  previousMeasurement?: Measurement;
  currentMeasurement?: Measurement;
  changeType: 'new' | 'stable' | 'progressing' | 'regressing' | 'resolved';
  changePercentage?: number;          // Procentowa zmiana
  clinicalSignificance?: 'benign' | 'probably-benign' | 'suspicious' | 'malignant';
}

/**
 * Obiekt obrazu medycznego w VectorDiff
 */
export interface MedicalImageObject extends VectorObject {
  type: 'medical-image';
  data: {
    imageType: 'slice' | 'volume' | 'mpr';  // Multi-Planar Reconstruction
    orientation?: 'axial' | 'sagittal' | 'coronal' | 'oblique';
    windowCenter?: number;              // Dla CT/MR
    windowWidth?: number;
    // Referencja do danych obrazowych
    imageDataUrl?: string;              // URL lub data URL
    dicomUid?: string;                  // DICOM Series Instance UID
  };
}

/**
 * Transformacje specyficzne dla radiologii
 */

/**
 * Zmiana w segmentacji (wzrost/kurczenie struktury)
 */
export interface SegmentationChange extends Transformation {
  type: 'segmentation-change';
  segmentationId: string;
  volumeChange?: number;               // cm³
  morphologyChange?: MorphologyChange;
  newContours?: ContourRepresentation;
}

export interface MorphologyChange {
  type: 'growth' | 'shrinkage' | 'deformation' | 'displacement';
  vector?: [number, number, number];   // Kierunek zmiany
  magnitude?: number;                  // Wielkość zmiany
}

/**
 * Zmiana intensywności sygnału
 */
export interface IntensityChange extends Transformation {
  type: 'intensity-change';
  region: BoundingBox3D | string;      // Region lub ID segmentacji
  previousIntensity: number;
  currentIntensity: number;
  changeType: 'enhancement' | 'reduction' | 'heterogeneous';
}

/**
 * Funkcje pomocnicze
 */

/**
 * Oblicza objętość z segmentacji
 * @param segmentation Segmentacja
 * @returns Objętość w cm³
 */
export function calculateVolume(segmentation: SegmentationRepresentation): number {
  switch (segmentation.type) {
    case 'mesh':
      // Obliczanie objętości z meshu używając wzoru dla wielościanu
      return calculateMeshVolume(segmentation.vertices, segmentation.faces);
      
    case 'voxel':
      // Liczenie voxeli i mnożenie przez objętość pojedynczego voxela
      const voxelCount = segmentation.voxelData.reduce((sum, val) => sum + (val ? 1 : 0), 0);
      const voxelVolume = segmentation.spacing[0] * segmentation.spacing[1] * segmentation.spacing[2];
      return voxelCount * voxelVolume / 1000; // mm³ to cm³
      
    case 'contour':
      // Sumowanie objętości między przekrojami
      let totalVolume = 0;
      const slices = segmentation.slices.sort((a, b) => a.sliceNumber - b.sliceNumber);
      
      for (let i = 0; i < slices.length - 1; i++) {
        const area1 = calculateContourArea(slices[i].contours[0]);
        const area2 = calculateContourArea(slices[i + 1].contours[0]);
        const height = Math.abs(slices[i + 1].sliceNumber - slices[i].sliceNumber);
        
        // Wzór na objętość ściętego stożka
        totalVolume += height * (area1 + area2 + Math.sqrt(area1 * area2)) / 3;
      }
      
      return totalVolume / 1000; // mm³ to cm³
  }
}

/**
 * Oblicza objętość meshu
 */
function calculateMeshVolume(vertices: Array<[number, number, number]>, faces: Array<[number, number, number]>): number {
  let volume = 0;
  
  faces.forEach(face => {
    const v1 = vertices[face[0]];
    const v2 = vertices[face[1]];
    const v3 = vertices[face[2]];
    
    // Objętość czworościanu z początkiem układu współrzędnych
    volume += (
      v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) +
      v1[1] * (v2[2] * v3[0] - v2[0] * v3[2]) +
      v1[2] * (v2[0] * v3[1] - v2[1] * v3[0])
    ) / 6;
  });
  
  return Math.abs(volume);
}

/**
 * Oblicza pole powierzchni konturu
 */
function calculateContourArea(contour: [number, number][]): number {
  let area = 0;
  
  for (let i = 0; i < contour.length; i++) {
    const j = (i + 1) % contour.length;
    area += contour[i][0] * contour[j][1];
    area -= contour[j][0] * contour[i][1];
  }
  
  return Math.abs(area) / 2;
}

/**
 * Oblicza RECIST (Response Evaluation Criteria in Solid Tumors)
 * Standard oceny odpowiedzi na leczenie w onkologii
 * 
 * @param baseline Pomiar bazowy
 * @param current Pomiar aktualny
 * @returns Kategoria odpowiedzi
 */
export function calculateRECIST(
  baseline: number, 
  current: number
): 'CR' | 'PR' | 'SD' | 'PD' {
  if (current === 0) {
    return 'CR'; // Complete Response - całkowita odpowiedź
  }
  
  const change = (current - baseline) / baseline * 100;
  
  if (change <= -30) {
    return 'PR'; // Partial Response - częściowa odpowiedź
  } else if (change >= 20) {
    return 'PD'; // Progressive Disease - progresja choroby
  } else {
    return 'SD'; // Stable Disease - choroba stabilna
  }
}

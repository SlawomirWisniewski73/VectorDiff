/**
 * Wyspecjalizowany renderer dla obrazów medycznych
 * 
 * Ten renderer rozszerza podstawowy ThreeRenderer o funkcje:
 * - Multi-planar reconstruction (MPR)
 * - Windowing dla obrazów CT/MR
 * - Renderowanie objętościowe (volume rendering)
 * - Wyświetlanie segmentacji
 * - Narzędzia pomiarowe
 * 
 * Kluczowe wyzwanie: obrazy medyczne mają ogromne rozmiary
 * i wymagają specjalnych technik wizualizacji
 */

import * as THREE from 'three';
import { ThreeRenderer, ThreeRendererOptions } from '@vectordiff/visualization';
import {
  RadiologyAnimation,
  AnatomicalSegmentation,
  MedicalImageObject,
  ContourRepresentation,
  MeshRepresentation
} from '../types/radiology-format';

export interface MedicalImageRendererOptions extends ThreeRendererOptions {
  defaultView?: 'axial' | 'sagittal' | 'coronal' | '3d';
  windowPresets?: WindowPreset[];
  enableMeasurementTools?: boolean;
  enableSegmentationOverlay?: boolean;
  volumeRenderingQuality?: 'low' | 'medium' | 'high';
}

export interface WindowPreset {
  name: string;
  center: number;
  width: number;
  modality: string;
}

export class MedicalImageRenderer extends ThreeRenderer {
  private medicalOptions: MedicalImageRendererOptions;
  private volumeData: VolumeData | null = null;
  private slicePlanes: {
    axial: THREE.Mesh,
    sagittal: THREE.Mesh,
    coronal: THREE.Mesh
  } | null = null;
  private segmentationMeshes: Map<string, THREE.Mesh> = new Map();
  private currentWindow: { center: number, width: number } = { center: 0, width: 2000 };
  
  // Materiały specjalne dla obrazowania
  private materials: {
    slice: THREE.ShaderMaterial,
    segmentation: THREE.MeshPhongMaterial,
    volume: THREE.ShaderMaterial
  };
  
  // Predefiniowane okna dla różnych tkanek
  private readonly WINDOW_PRESETS: WindowPreset[] = [
    { name: 'Bone', center: 300, width: 1500, modality: 'CT' },
    { name: 'Lung', center: -600, width: 1500, modality: 'CT' },
    { name: 'Soft Tissue', center: 40, width: 400, modality: 'CT' },
    { name: 'Brain', center: 40, width: 80, modality: 'CT' },
    { name: 'Liver', center: 60, width: 150, modality: 'CT' },
    { name: 'T1-weighted', center: 500, width: 1000, modality: 'MR' },
    { name: 'T2-weighted', center: 500, width: 1000, modality: 'MR' }
  ];
  
  constructor(options: MedicalImageRendererOptions) {
    super({ ...options, medicalMode: 'radiology' });
    
    this.medicalOptions = {
      defaultView: options.defaultView || 'axial',
      windowPresets: options.windowPresets || this.WINDOW_PRESETS,
      enableMeasurementTools: options.enableMeasurementTools !== false,
      enableSegmentationOverlay: options.enableSegmentationOverlay !== false,
      volumeRenderingQuality: options.volumeRenderingQuality || 'medium'
    };
    
    // Inicjalizacja materiałów
    this.materials = this.initializeMedicalMaterials();
    
    // Ustawienie kamery dla domyślnego widoku
    this.setupViewport(this.medicalOptions.defaultView!);
  }
  
  /**
   * Inicjalizuje materiały dla obrazów medycznych
   */
  private initializeMedicalMaterials(): any {
    // Shader material dla wyświetlania przekrojów z windowing
    const sliceVertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
    const sliceFragmentShader = `
      uniform sampler2D slice;
      uniform float windowCenter;
      uniform float windowWidth;
      varying vec2 vUv;
      
      void main() {
        float value = texture2D(slice, vUv).r;
        
        // Aplikacja windowing (mapowanie HU na jasność)
        float minValue = windowCenter - windowWidth / 2.0;
        float maxValue = windowCenter + windowWidth / 2.0;
        float normalized = (value - minValue) / (maxValue - minValue);
        normalized = clamp(normalized, 0.0, 1.0);
        
        gl_FragColor = vec4(normalized, normalized, normalized, 1.0);
      }
    `;
    
    const sliceMaterial = new THREE.ShaderMaterial({
      uniforms: {
        slice: { value: null },
        windowCenter: { value: this.currentWindow.center },
        windowWidth: { value: this.currentWindow.width }
      },
      vertexShader: sliceVertexShader,
      fragmentShader: sliceFragmentShader,
      side: THREE.DoubleSide
    });
    
    // Material dla segmentacji
    const segmentationMaterial = new THREE.MeshPhongMaterial({
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    
    // Material dla volume rendering (uproszczony)
    const volumeMaterial = new THREE.ShaderMaterial({
      // Tu byłby bardziej złożony shader dla ray marching
      transparent: true,
      side: THREE.BackSide
    });
    
    return {
      slice: sliceMaterial,
      segmentation: segmentationMaterial,
      volume: volumeMaterial
    };
  }
  
  /**
   * Ustawia viewport dla określonego widoku
   */
  private setupViewport(view: 'axial' | 'sagittal' | 'coronal' | '3d'): void {
    switch (view) {
      case 'axial':
        // Widok z góry (oś Z)
        this.camera.position.set(0, 0, 500);
        this.camera.up.set(0, 1, 0);
        break;
        
      case 'sagittal':
        // Widok z boku (oś X)
        this.camera.position.set(500, 0, 0);
        this.camera.up.set(0, 0, 1);
        break;
        
      case 'coronal':
        // Widok z przodu (oś Y)
        this.camera.position.set(0, -500, 0);
        this.camera.up.set(0, 0, 1);
        break;
        
      case '3d':
        // Widok 3D
        this.camera.position.set(300, 300, 300);
        this.camera.up.set(0, 0, 1);
        break;
    }
    
    this.camera.lookAt(0, 0, 0);
  }
  
  /**
   * Ładuje animację radiologiczną
   */
  public async loadAnimation(animation: VectorDiffAnimation): Promise<void> {
    const radiologyAnimation = animation as RadiologyAnimation;
    
    // Czyścimy poprzednią scenę
    this.clearMedicalScene();
    
    // Zapisujemy animację
    this.animation = animation;
    
    // Ładujemy dane objętościowe
    if (radiologyAnimation.baseScene.objects.length > 0) {
      const volumeObject = radiologyAnimation.baseScene.objects.find(
        obj => obj.type === 'medical-image'
      ) as MedicalImageObject;
      
      if (volumeObject) {
        await this.loadVolumeData(volumeObject);
      }
    }
    
    // Tworzmy płaszczyzny przekrojów
    this.createSlicePlanes();
    
    // Renderujemy segmentacje
    if (radiologyAnimation.segmentations) {
      radiologyAnimation.segmentations.forEach(seg => {
        this.renderSegmentation(seg);
      });
    }
    
    // Ustawiamy windowing na podstawie modalności
    this.setWindowingForModality(radiologyAnimation.imagingData.modality);
    
    // Pierwszy render
    this.render();
  }
  
  /**
   * Ładuje dane objętościowe
   * W prawdziwej implementacji ładowałoby to z serwera DICOM
   */
  private async loadVolumeData(volumeObject: MedicalImageObject): Promise<void> {
    // Symulacja ładowania danych
    // W rzeczywistości używalibyśmy cornerstone lub podobnej biblioteki
    
    this.volumeData = {
      dimensions: [512, 512, 200], // Typowe wymiary CT
      spacing: [0.7, 0.7, 3.0],    // mm
      origin: [0, 0, 0],
      data: new Float32Array(512 * 512 * 200), // Placeholder
      windowCenter: volumeObject.data.windowCenter || 40,
      windowWidth: volumeObject.data.windowWidth || 400
    };
    
    // Aktualizujemy okno
    this.currentWindow = {
      center: this.volumeData.windowCenter,
      width: this.volumeData.windowWidth
    };
  }
  
  /**
   * Tworzy płaszczyzny dla przekrojów MPR
   */
  private createSlicePlanes(): void {
    if (!this.volumeData) return;
    
    const [dimX, dimY, dimZ] = this.volumeData.dimensions;
    const [spacingX, spacingY, spacingZ] = this.volumeData.spacing;
    
    // Wymiary w jednostkach świata
    const sizeX = dimX * spacingX;
    const sizeY = dimY * spacingY;
    const sizeZ = dimZ * spacingZ;
    
    // Płaszczyzna aksjalna (XY)
    const axialGeometry = new THREE.PlaneGeometry(sizeX, sizeY);
    const axialMesh = new THREE.Mesh(axialGeometry, this.materials.slice.clone());
    axialMesh.position.z = 0;
    
    // Płaszczyzna strzałkowa (XZ)
    const sagittalGeometry = new THREE.PlaneGeometry(sizeY, sizeZ);
    const sagittalMesh = new THREE.Mesh(sagittalGeometry, this.materials.slice.clone());
    sagittalMesh.rotation.y = Math.PI / 2;
    sagittalMesh.position.x = 0;
    
    // Płaszczyzna czołowa (YZ)
    const coronalGeometry = new THREE.PlaneGeometry(sizeX, sizeZ);
    const coronalMesh = new THREE.Mesh(coronalGeometry, this.materials.slice.clone());
    coronalMesh.rotation.x = Math.PI / 2;
    coronalMesh.position.y = 0;
    
    this.slicePlanes = {
      axial: axialMesh,
      sagittal: sagittalMesh,
      coronal: coronalMesh
    };
    
    // Dodajemy do sceny w zależności od widoku
    const view = this.medicalOptions.defaultView;
    if (view === 'axial' || view === '3d') {
      this.scene.add(axialMesh);
    }
    if (view === 'sagittal' || view === '3d') {
      this.scene.add(sagittalMesh);
    }
    if (view === 'coronal' || view === '3d') {
      this.scene.add(coronalMesh);
    }
    
    // Aktualizujemy tekstury przekrojów
    this.updateSliceTextures();
  }
  
  /**
   * Aktualizuje tekstury dla przekrojów
   */
  private updateSliceTextures(): void {
    if (!this.volumeData || !this.slicePlanes) return;
    
    // Tu byłaby implementacja generowania tekstur z danych objętościowych
    // Używając algorytmów interpolacji dla MPR
    
    // Dla demonstracji tworzymy sztuczne tekstury
    const createSliceTexture = (width: number, height: number): THREE.DataTexture => {
      const size = width * height;
      const data = new Float32Array(size);
      
      // Generujemy przykładowy wzór
      for (let i = 0; i < size; i++) {
        data[i] = Math.random() * 1000 - 500; // Symulacja wartości HU
      }
      
      const texture = new THREE.DataTexture(
        data,
        width,
        height,
        THREE.RedFormat,
        THREE.FloatType
      );
      texture.needsUpdate = true;
      
      return texture;
    };
    
    // Aktualizujemy tekstury
    const axialMaterial = this.slicePlanes.axial.material as THREE.ShaderMaterial;
    axialMaterial.uniforms.slice.value = createSliceTexture(
      this.volumeData.dimensions[0],
      this.volumeData.dimensions[1]
    );
    
    const sagittalMaterial = this.slicePlanes.sagittal.material as THREE.ShaderMaterial;
    sagittalMaterial.uniforms.slice.value = createSliceTexture(
      this.volumeData.dimensions[1],
      this.volumeData.dimensions[2]
    );
    
    const coronalMaterial = this.slicePlanes.coronal.material as THREE.ShaderMaterial;
    coronalMaterial.uniforms.slice.value = createSliceTexture(
      this.volumeData.dimensions[0],
      this.volumeData.dimensions[2]
    );
  }
  
  /**
   * Renderuje segmentację anatomiczną
   */
  private renderSegmentation(segmentation: AnatomicalSegmentation): void {
    let mesh: THREE.Mesh;
    
    switch (segmentation.representation.type) {
      case 'mesh':
        mesh = this.createMeshFromSegmentation(
          segmentation.representation as MeshRepresentation
        );
        break;
        
      case 'contour':
        mesh = this.createMeshFromContours(
          segmentation.representation as ContourRepresentation
        );
        break;
        
      default:
        console.warn('Unsupported segmentation type');
        return;
    }
    
    // Ustawiamy kolor na podstawie kategorii
    const material = mesh.material as THREE.MeshPhongMaterial;
    material.color = new THREE.Color(this.getColorForCategory(
      segmentation.anatomicalStructure.category
    ));
    
    // Dodajemy metadane
    mesh.userData = {
      segmentationId: segmentation.segmentationId,
      anatomicalStructure: segmentation.anatomicalStructure,
      volume: segmentation.volume
    };
    
    this.scene.add(mesh);
    this.segmentationMeshes.set(segmentation.segmentationId, mesh);
  }
  
  /**
   * Tworzy mesh z reprezentacji mesh
   */
  private createMeshFromSegmentation(meshRep: MeshRepresentation): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    
    // Konwertujemy wierzchołki
    const vertices = new Float32Array(meshRep.vertices.flat());
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    
    // Konwertujemy face
    const indices = new Uint32Array(meshRep.faces.flat());
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    
    // Obliczamy normalne jeśli nie ma
    if (!meshRep.normals) {
      geometry.computeVertexNormals();
    } else {
      const normals = new Float32Array(meshRep.normals.flat());
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    }
    
    const material = this.materials.segmentation.clone();
    return new THREE.Mesh(geometry, material);
  }
  
  /**
   * Tworzy mesh z konturów (marching cubes)
   */
  private createMeshFromContours(contourRep: ContourRepresentation): THREE.Mesh {
    // To jest uproszczona implementacja
    // W rzeczywistości używalibyśmy algorytmu marching cubes
    
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Dla każdej pary sąsiednich przekrojów
    for (let i = 0; i < contourRep.slices.length - 1; i++) {
      const slice1 = contourRep.slices[i];
      const slice2 = contourRep.slices[i + 1];
      
      // Zakładamy jeden kontur na przekrój dla uproszczenia
      const contour1 = slice1.contours[0];
      const contour2 = slice2.contours[0];
      
      // Łączymy kontury trójkątami
      const baseIndex = vertices.length / 3;
      
      // Dodajemy wierzchołki
      contour1.forEach(point => {
        vertices.push(point[0], point[1], slice1.sliceNumber);
      });
      
      contour2.forEach(point => {
        vertices.push(point[0], point[1], slice2.sliceNumber);
      });
      
      // Tworzymy trójkąty między konturami
      const n = contour1.length;
      for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n;
        
        // Dwa trójkąty na segment
        indices.push(
          baseIndex + j,
          baseIndex + n + j,
          baseIndex + n + j1
        );
        
        indices.push(
          baseIndex + j,
          baseIndex + n + j1,
          baseIndex + j1
        );
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    const material = this.materials.segmentation.clone();
    return new THREE.Mesh(geometry, material);
  }
  
  /**
   * Ustawia windowing dla modalności
   */
  private setWindowingForModality(modality: string): void {
    const preset = this.medicalOptions.windowPresets!.find(
      p => p.modality === modality
    );
    
    if (preset) {
      this.setWindowing(preset.center, preset.width);
    }
  }
  
  /**
   * Ustawia parametry windowing
   * @param center Centrum okna (HU dla CT)
   * @param width Szerokość okna
   */
  public setWindowing(center: number, width: number): void {
    this.currentWindow = { center, width };
    
    // Aktualizujemy shadera
    if (this.slicePlanes) {
      Object.values(this.slicePlanes).forEach(plane => {
        const material = plane.material as THREE.ShaderMaterial;
        material.uniforms.windowCenter.value = center;
        material.uniforms.windowWidth.value = width;
      });
    }
    
    this.render();
  }
  
  /**
   * Zmienia widok
   */
  public setView(view: 'axial' | 'sagittal' | 'coronal' | '3d'): void {
    // Ukrywamy wszystkie płaszczyzny
    if (this.slicePlanes) {
      Object.values(this.slicePlanes).forEach(plane => {
        plane.visible = false;
      });
    }
    
    // Pokazujemy odpowiednie płaszczyzny
    switch (view) {
      case 'axial':
        if (this.slicePlanes) this.slicePlanes.axial.visible = true;
        break;
        
      case 'sagittal':
        if (this.slicePlanes) this.slicePlanes.sagittal.visible = true;
        break;
        
      case 'coronal':
        if (this.slicePlanes) this.slicePlanes.coronal.visible = true;
        break;
        
      case '3d':
        // Pokazujemy wszystko
        if (this.slicePlanes) {
          Object.values(this.slicePlanes).forEach(plane => {
            plane.visible = true;
          });
        }
        break;
    }
    
    // Ustawiamy kamerę
    this.setupViewport(view);
    this.render();
  }
  
  /**
   * Przewija przez przekroje
   * @param axis Oś przewijania
   * @param position Pozycja w zakresie 0-1
   */
  public scrollSlice(axis: 'axial' | 'sagittal' | 'coronal', position: number): void {
    if (!this.slicePlanes || !this.volumeData) return;
    
    const clampedPosition = Math.max(0, Math.min(1, position));
    const plane = this.slicePlanes[axis];
    
    switch (axis) {
      case 'axial':
        const zPos = (clampedPosition - 0.5) * this.volumeData.dimensions[2] * 
                    this.volumeData.spacing[2];
        plane.position.z = zPos;
        break;
        
      case 'sagittal':
        const xPos = (clampedPosition - 0.5) * this.volumeData.dimensions[0] * 
                    this.volumeData.spacing[0];
        plane.position.x = xPos;
        break;
        
      case 'coronal':
        const yPos = (clampedPosition - 0.5) * this.volumeData.dimensions[1] * 
                    this.volumeData.spacing[1];
        plane.position.y = yPos;
        break;
    }
    
    // Aktualizujemy teksturę dla nowej pozycji
    // (W prawdziwej implementacji)
    
    this.render();
  }
  
  /**
   * Przełącza widoczność segmentacji
   */
  public toggleSegmentation(segmentationId: string, visible: boolean): void {
    const mesh = this.segmentationMeshes.get(segmentationId);
    if (mesh) {
      mesh.visible = visible;
      this.render();
    }
  }
  
  /**
   * Przypisuje kolor do kategorii anatomicznej
   */
  private getColorForCategory(category: string): number {
    const colors: { [key: string]: number } = {
      'organ': 0xff6b6b,
      'vessel': 0x4ecdc4,
      'bone': 0xf9f9f9,
      'muscle': 0xee5a6f,
      'lesion': 0xffe66d,
      'other': 0x95e1d3
    };
    
    return colors[category] || 0xcccccc;
  }
  
  /**
   * Czyści scenę medyczną
   */
  private clearMedicalScene(): void {
    // Usuwamy płaszczyzny przekrojów
    if (this.slicePlanes) {
      Object.values(this.slicePlanes).forEach(plane => {
        plane.geometry.dispose();
        if (plane.material instanceof THREE.Material) {
          plane.material.dispose();
        }
        this.scene.remove(plane);
      });
      this.slicePlanes = null;
    }
    
    // Usuwamy segmentacje
    this.segmentationMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      this.scene.remove(mesh);
    });
    this.segmentationMeshes.clear();
    
    // Czyścimy dane objętościowe
    this.volumeData = null;
    
    // Wywołujemy metodę bazową
    super.clearScene();
  }
}

/**
 * Interfejs dla danych objętościowych
 */
interface VolumeData {
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  data: Float32Array;
  windowCenter: number;
  windowWidth: number;
}

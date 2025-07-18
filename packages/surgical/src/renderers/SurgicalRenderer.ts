/**
 * Wyspecjalizowany renderer dla wizualizacji chirurgicznej
 * 
 * Ten renderer musi spełniać unikalne wymagania:
 * - Stereoskopowe 3D (dla systemu da Vinci)
 * - Ultra-wysoka częstotliwość odświeżania (120+ FPS)
 * - Minimalne opóźnienie renderowania (<5ms)
 * - Precyzyjne odwzorowanie kolorów tkanek
 * - Wskaźniki bezpieczeństwa w czasie rzeczywistym
 */

import * as THREE from 'three';
import { ThreeRenderer, ThreeRendererOptions } from '@vectordiff/visualization';
import {
  SurgicalAnimation,
  InstrumentState,
  CriticalStructure,
  DaVinciInstrument,
  calculateDistanceToStructure
} from '../types/surgical-format';

export interface SurgicalRendererOptions extends ThreeRendererOptions {
  stereoscopic?: boolean;
  eyeSeparation?: number;  // mm
  convergenceDistance?: number;  // mm
  instrumentModels?: Map<string, THREE.Object3D>;
  showSafetyZones?: boolean;
  showForceVectors?: boolean;
  tissueDeformation?: boolean;
}

export class SurgicalRenderer extends ThreeRenderer {
  private surgicalOptions: SurgicalRendererOptions;
  
  // Renderery dla stereoskopii
  private leftRenderer?: THREE.WebGLRenderer;
  private rightRenderer?: THREE.WebGLRenderer;
  private leftCamera?: THREE.PerspectiveCamera;
  private rightCamera?: THREE.PerspectiveCamera;
  
  // Obiekty sceny
  private instrumentMeshes: Map<string, THREE.Object3D> = new Map();
  private criticalZones: Map<string, THREE.Mesh> = new Map();
  private forceVisualizers: Map<string, THREE.ArrowHelper> = new Map();
  private tissueModel: TissueDeformationModel | null = null;
  
  // Materiały specjalistyczne
  private materials: {
    instrument: THREE.MeshPhysicalMaterial;
    tissue: THREE.ShaderMaterial;
    criticalZone: THREE.MeshBasicMaterial;
    vessel: THREE.MeshPhongMaterial;
  };
  
  constructor(options: SurgicalRendererOptions) {
    super({ ...options, medicalMode: 'surgical' });
    
    this.surgicalOptions = {
      stereoscopic: options.stereoscopic || false,
      eyeSeparation: options.eyeSeparation || 6.5, // Średnia rozstaw oczu
      convergenceDistance: options.convergenceDistance || 200,
      instrumentModels: options.instrumentModels || new Map(),
      showSafetyZones: options.showSafetyZones !== false,
      showForceVectors: options.showForceVectors || false,
      tissueDeformation: options.tissueDeformation || false
    };
    
    // Inicjalizacja materiałów
    this.materials = this.initializeSurgicalMaterials();
    
    // Setup stereoskopii jeśli włączona
    if (this.surgicalOptions.stereoscopic) {
      this.setupStereoscopic();
    }
    
    // Optymalizacje dla wysokiej częstotliwości
    this.optimizeForHighFrameRate();
  }
  
  /**
   * Inicjalizuje materiały chirurgiczne
   */
  private initializeSurgicalMaterials(): any {
    // Materiał dla narzędzi - metaliczny, odbijający światło
    const instrumentMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc0c0c0,
      metalness: 0.9,
      roughness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      reflectivity: 0.9
    });
    
    // Shader dla tkanki z subsurface scattering
    const tissueVertexShader = `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    
    const tissueFragmentShader = `
      uniform vec3 diffuseColor;
      uniform vec3 subsurfaceColor;
      uniform float thickness;
      uniform float subsurfacePower;
      
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      
      // Simplified subsurface scattering
      vec3 subsurfaceScattering(vec3 lightDir, vec3 viewDir, vec3 normal) {
        float dotLN = dot(lightDir, normal);
        float dotVN = dot(viewDir, normal);
        
        vec3 translucency = subsurfaceColor * max(0.0, dotLN);
        translucency *= pow(max(0.0, dot(viewDir, -lightDir)), subsurfacePower);
        translucency *= thickness;
        
        return translucency;
      }
      
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        // Podstawowe oświetlenie
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        float NdotL = max(dot(normal, lightDir), 0.0);
        
        vec3 diffuse = diffuseColor * NdotL;
        vec3 subsurface = subsurfaceScattering(lightDir, viewDir, normal);
        
        vec3 finalColor = diffuse + subsurface;
        
        // Gamma correction
        finalColor = pow(finalColor, vec3(1.0 / 2.2));
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;
    
    const tissueMaterial = new THREE.ShaderMaterial({
      uniforms: {
        diffuseColor: { value: new THREE.Color(0xffcccc) },
        subsurfaceColor: { value: new THREE.Color(0xff6666) },
        thickness: { value: 0.5 },
        subsurfacePower: { value: 2.0 }
      },
      vertexShader: tissueVertexShader,
      fragmentShader: tissueFragmentShader
    });
    
    // Materiał dla stref krytycznych
    const criticalZoneMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    // Materiał dla naczyń krwionośnych
    const vesselMaterial = new THREE.MeshPhongMaterial({
      color: 0xcc0000,
      specular: 0x222222,
      shininess: 100,
      transparent: true,
      opacity: 0.8
    });
    
    return {
      instrument: instrumentMaterial,
      tissue: tissueMaterial,
      criticalZone: criticalZoneMaterial,
      vessel: vesselMaterial
    };
  }
  
  /**
   * Konfiguracja renderowania stereoskopowego
   */
  private setupStereoscopic(): void {
    const width = this.container.clientWidth / 2;
    const height = this.container.clientHeight;
    
    // Lewy renderer
    this.leftRenderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: false
    });
    this.leftRenderer.setSize(width, height);
    this.leftRenderer.setPixelRatio(window.devicePixelRatio);
    this.leftRenderer.shadowMap.enabled = true;
    this.leftRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Prawy renderer
    this.rightRenderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: false
    });
    this.rightRenderer.setSize(width, height);
    this.rightRenderer.setPixelRatio(window.devicePixelRatio);
    this.rightRenderer.shadowMap.enabled = true;
    this.rightRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Kontener dla obu widoków
    const stereoContainer = document.createElement('div');
    stereoContainer.style.display = 'flex';
    stereoContainer.appendChild(this.leftRenderer.domElement);
    stereoContainer.appendChild(this.rightRenderer.domElement);
    
    // Zastąp główny renderer
    this.container.innerHTML = '';
    this.container.appendChild(stereoContainer);
    
    // Kamery stereoskopowe
    const aspect = width / height;
    const fov = 60;
    const near = 1;
    const far = 1000;
    
    this.leftCamera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.rightCamera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    
    // Pozycjonowanie kamer
    this.updateStereoCameras();
  }
  
  /**
   * Aktualizuje pozycje kamer stereoskopowych
   */
  private updateStereoCameras(): void {
    if (!this.leftCamera || !this.rightCamera) return;
    
    const eyeSep = this.surgicalOptions.eyeSeparation! / 1000; // Konwersja na metry
    const convergence = this.surgicalOptions.convergenceDistance!;
    
    // Pozycja bazowa z głównej kamery
    const basePosition = this.camera.position.clone();
    const lookAt = new THREE.Vector3(0, 0, -convergence);
    
    // Lewa kamera
    this.leftCamera.position.copy(basePosition);
    this.leftCamera.position.x -= eyeSep / 2;
    this.leftCamera.lookAt(lookAt);
    
    // Prawa kamera
    this.rightCamera.position.copy(basePosition);
    this.rightCamera.position.x += eyeSep / 2;
    this.rightCamera.lookAt(lookAt);
    
    // Synchronizacja innych parametrów
    this.leftCamera.fov = this.camera.fov;
    this.leftCamera.near = this.camera.near;
    this.leftCamera.far = this.camera.far;
    this.leftCamera.updateProjectionMatrix();
    
    this.rightCamera.fov = this.camera.fov;
    this.rightCamera.near = this.camera.near;
    this.rightCamera.far = this.camera.far;
    this.rightCamera.updateProjectionMatrix();
  }
  
  /**
   * Optymalizacje dla wysokiej częstotliwości klatek
   */
  private optimizeForHighFrameRate(): void {
    // Wyłącz niepotrzebne efekty
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.sortObjects = false;
    
    // Użyj instancingu dla powtarzających się obiektów
    // Precompile shaders
    this.renderer.compile(this.scene, this.camera);
    
    // Optymalizacja geometrii
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.computeBoundingSphere();
        object.frustumCulled = true;
      }
    });
  }
  
  /**
   * Ładuje animację chirurgiczną
   */
  public async loadAnimation(animation: VectorDiffAnimation): Promise<void> {
    const surgicalAnimation = animation as SurgicalAnimation;
    
    // Czyść poprzednią scenę
    this.clearSurgicalScene();
    
    // Zapisz animację
    this.animation = animation;
    
    // Ładuj modele narzędzi
    await this.loadInstrumentModels(surgicalAnimation.surgicalData.daVinciConfiguration.instruments);
    
    // Twórz strefy krytyczne
    if (surgicalAnimation.criticalStructures && this.surgicalOptions.showSafetyZones) {
      surgicalAnimation.criticalStructures.forEach(structure => {
        this.createCriticalZone(structure);
      });
    }
    
    // Inicjalizuj model tkanki jeśli włączony
    if (this.surgicalOptions.tissueDeformation) {
      this.tissueModel = new TissueDeformationModel(this.scene);
      await this.tissueModel.initialize();
    }
    
    // Ustaw oświetlenie chirurgiczne
    this.setupSurgicalLighting();
    
    // Pierwszy render
    this.render();
  }
  
  /**
   * Ładuje modele 3D narzędzi
   */
  private async loadInstrumentModels(instruments: DaVinciInstrument[]): Promise<void> {
    for (const instrument of instruments) {
      let model = this.surgicalOptions.instrumentModels!.get(instrument.type);
      
      if (!model) {
        // Twórz procedularny model jeśli brak
        model = this.createProceduralInstrument(instrument);
      }
      
      // Klonuj dla każdego narzędzia
      const instancedModel = model.clone();
      instancedModel.name = instrument.instrumentId;
      
      // Zastosuj materiał
      instancedModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = this.materials.instrument.clone();
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      this.scene.add(instancedModel);
      this.instrumentMeshes.set(instrument.instrumentId, instancedModel);
    }
  }
  
  /**
   * Tworzy proceduralny model narzędzia
   */
  private createProceduralInstrument(instrument: DaVinciInstrument): THREE.Object3D {
    const group = new THREE.Group();
    
    // Trzon narzędzia
    const shaftGeometry = new THREE.CylinderGeometry(2, 2, 300, 16);
    const shaft = new THREE.Mesh(shaftGeometry, this.materials.instrument);
    shaft.position.z = -150;
    shaft.rotation.x = Math.PI / 2;
    group.add(shaft);
    
    // Końcówka w zależności od typu
    switch (instrument.type) {
      case 'needle-driver':
        // Igłotrzymacz - dwie szczęki
        const jaw1 = new THREE.BoxGeometry(3, 1, 20);
        const jaw2 = new THREE.BoxGeometry(3, 1, 20);
        
        const jawMesh1 = new THREE.Mesh(jaw1, this.materials.instrument);
        const jawMesh2 = new THREE.Mesh(jaw2, this.materials.instrument);
        
        jawMesh1.position.set(1.5, 0, 10);
        jawMesh2.position.set(-1.5, 0, 10);
        
        group.add(jawMesh1);
        group.add(jawMesh2);
        break;
        
      case 'scissors':
        // Nożyczki - ostrza
        const blade1 = new THREE.BoxGeometry(1, 0.5, 25);
        const blade2 = new THREE.BoxGeometry(1, 0.5, 25);
        
        const bladeMesh1 = new THREE.Mesh(blade1, this.materials.instrument);
        const bladeMesh2 = new THREE.Mesh(blade2, this.materials.instrument);
        
        bladeMesh1.position.set(0.5, 0, 12.5);
        bladeMesh1.rotation.z = 0.1;
        
        bladeMesh2.position.set(-0.5, 0, 12.5);
        bladeMesh2.rotation.z = -0.1;
        
        group.add(bladeMesh1);
        group.add(bladeMesh2);
        break;
        
      case 'grasper':
        // Chwytacz - zaokrąglone szczęki
        const grasperGeometry = new THREE.SphereGeometry(3, 8, 4, 0, Math.PI);
        const grasperMesh1 = new THREE.Mesh(grasperGeometry, this.materials.instrument);
        const grasperMesh2 = new THREE.Mesh(grasperGeometry, this.materials.instrument);
        
        grasperMesh1.position.set(0, 1.5, 5);
        grasperMesh2.position.set(0, -1.5, 5);
        grasperMesh2.rotation.z = Math.PI;
        
        group.add(grasperMesh1);
        group.add(grasperMesh2);
        break;
    }
    
    return group;
  }
  
  /**
   * Tworzy wizualizację strefy krytycznej
   */
  private createCriticalZone(structure: CriticalStructure): void {
    if (!structure.boundingBox) return;
    
    const { min, max } = structure.boundingBox;
    const size = [
      max[0] - min[0] + structure.safetyMargin * 2,
      max[1] - min[1] + structure.safetyMargin * 2,
      max[2] - min[2] + structure.safetyMargin * 2
    ];
    
    const geometry = new THREE.BoxGeometry(...size);
    const material = this.materials.criticalZone.clone();
    
    // Kolor w zależności od krytyczności
    switch (structure.damageConsequence) {
      case 'life-threatening':
        material.color.setHex(0xff0000); // Czerwony
        material.opacity = 0.5;
        break;
      case 'severe':
        material.color.setHex(0xff6600); // Pomarańczowy
        material.opacity = 0.4;
        break;
      case 'moderate':
        material.color.setHex(0xffff00); // Żółty
        material.opacity = 0.3;
        break;
      default:
        material.color.setHex(0x00ff00); // Zielony
        material.opacity = 0.2;
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    );
    
    mesh.name = `critical_${structure.structureId}`;
    this.scene.add(mesh);
    this.criticalZones.set(structure.structureId, mesh);
  }
  
  /**
   * Ustawia oświetlenie chirurgiczne
   */
  private setupSurgicalLighting(): void {
    // Usuń domyślne światła
    this.scene.traverse((child) => {
      if (child instanceof THREE.Light && child.type !== 'AmbientLight') {
        this.scene.remove(child);
      }
    });
    
    // Światło ambiente - minimalne
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambient);
    
    // Główne światło operacyjne - bardzo jasne, skupione
    const surgicalLight1 = new THREE.SpotLight(0xffffff, 2.0);
    surgicalLight1.position.set(0, 300, 0);
    surgicalLight1.angle = Math.PI / 8;
    surgicalLight1.penumbra = 0.1;
    surgicalLight1.decay = 2;
    surgicalLight1.distance = 1000;
    surgicalLight1.castShadow = true;
    surgicalLight1.shadow.mapSize.width = 2048;
    surgicalLight1.shadow.mapSize.height = 2048;
    surgicalLight1.shadow.camera.near = 100;
    surgicalLight1.shadow.camera.far = 500;
    this.scene.add(surgicalLight1);
    
    // Drugie światło dla eliminacji cieni
    const surgicalLight2 = new THREE.SpotLight(0xffffff, 1.5);
    surgicalLight2.position.set(100, 250, 100);
    surgicalLight2.angle = Math.PI / 6;
    surgicalLight2.penumbra = 0.2;
    surgicalLight2.castShadow = true;
    this.scene.add(surgicalLight2);
    
    // Światło wypełniające
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-50, 100, -50);
    this.scene.add(fillLight);
    
    // Target wszystkich świateł na środek pola operacyjnego
    const target = new THREE.Object3D();
    target.position.set(0, 0, 0);
    this.scene.add(target);
    
    surgicalLight1.target = target;
    surgicalLight2.target = target;
  }
  
  /**
   * Aktualizuje pozycję narzędzia
   */
  public updateInstrumentState(state: InstrumentState): void {
    const mesh = this.instrumentMeshes.get(state.instrumentId);
    if (!mesh) return;
    
    // Aktualizuj pozycję
    mesh.position.set(...state.tipPosition);
    
    // Aktualizuj orientację
    mesh.quaternion.set(...state.orientation);
    
    // Aktualizuj szczęki jeśli to narzędzie z szczękami
    this.updateJawAngle(mesh, state.jawAngle || 0);
    
    // Wizualizacja siły jeśli włączona
    if (this.surgicalOptions.showForceVectors && state.graspForce) {
      this.updateForceVisualization(state);
    }
    
    // Sprawdź strefy bezpieczeństwa
    this.checkSafetyZones(state);
    
    // Deformacja tkanki jeśli włączona
    if (this.tissueModel && state.graspForce && state.graspForce > 0.1) {
      this.tissueModel.applyForce(
        state.tipPosition,
        state.graspForce,
        state.instrumentId
      );
    }
    
    // Renderuj
    this.render();
  }
  
  /**
   * Aktualizuje kąt szczęk narzędzia
   */
  private updateJawAngle(instrument: THREE.Object3D, angle: number): void {
    // Znajdź szczęki w modelu (zakładamy, że są nazwane)
    instrument.traverse((child) => {
      if (child.name.includes('jaw1')) {
        child.rotation.z = angle * Math.PI / 180 / 2;
      } else if (child.name.includes('jaw2')) {
        child.rotation.z = -angle * Math.PI / 180 / 2;
      }
    });
  }
  
  /**
   * Aktualizuje wizualizację sił
   */
  private updateForceVisualization(state: InstrumentState): void {
    let arrow = this.forceVisualizers.get(state.instrumentId);
    
    if (!arrow) {
      // Twórz nową strzałkę
      const origin = new THREE.Vector3();
      const direction = new THREE.Vector3(0, 0, 1);
      const length = 10;
      const color = 0x00ff00;
      
      arrow = new THREE.ArrowHelper(direction, origin, length, color);
      this.scene.add(arrow);
      this.forceVisualizers.set(state.instrumentId, arrow);
    }
    
    // Aktualizuj pozycję i kierunek
    arrow.position.set(...state.tipPosition);
    
    // Kierunek siły (zakładamy wzdłuż osi narzędzia)
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(new THREE.Quaternion(...state.orientation));
    arrow.setDirection(direction);
    
    // Długość proporcjonalna do siły
    const length = (state.graspForce || 0) * 5; // 5mm/N
    arrow.setLength(length);
    
    // Kolor w zależności od siły
    const force = state.graspForce || 0;
    if (force < 5) {
      arrow.setColor(0x00ff00); // Zielony - bezpieczne
    } else if (force < 10) {
      arrow.setColor(0xffff00); // Żółty - uwaga
    } else {
      arrow.setColor(0xff0000); // Czerwony - niebezpieczne
    }
  }
  
  /**
   * Sprawdza zbliżenie do stref krytycznych
   */
  private checkSafetyZones(state: InstrumentState): void {
    const animation = this.animation as SurgicalAnimation;
    if (!animation.criticalStructures) return;
    
    animation.criticalStructures.forEach(structure => {
      const distance = calculateDistanceToStructure(
        state.tipPosition,
        structure
      );
      
      const zone = this.criticalZones.get(structure.structureId);
      if (!zone) return;
      
      // Animuj strefę w zależności od odległości
      if (distance < structure.safetyMargin) {
        // Pulsowanie alarmu
        const scale = 1 + 0.1 * Math.sin(Date.now() * 0.01);
        zone.scale.set(scale, scale, scale);
        
        // Zwiększ opacity
        const material = zone.material as THREE.MeshBasicMaterial;
        material.opacity = Math.min(0.8, 0.3 + (structure.safetyMargin - distance) / structure.safetyMargin * 0.5);
      } else {
        // Reset
        zone.scale.set(1, 1, 1);
        const material = zone.material as THREE.MeshBasicMaterial;
        material.opacity = 0.2;
      }
    });
  }
  
  /**
   * Override render dla stereoskopii
   */
  protected render(): void {
    if (this.surgicalOptions.stereoscopic && this.leftRenderer && this.rightRenderer) {
      // Aktualizuj pozycje kamer
      this.updateStereoCameras();
      
      // Renderuj lewe oko
      this.leftRenderer.render(this.scene, this.leftCamera!);
      
      // Renderuj prawe oko
      this.rightRenderer.render(this.scene, this.rightCamera!);
    } else {
      // Standardowy render
      super.render();
    }
  }
  
  /**
   * Czyści scenę chirurgiczną
   */
  private clearSurgicalScene(): void {
    // Usuń narzędzia
    this.instrumentMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      this.disposeMesh(mesh);
    });
    this.instrumentMeshes.clear();
    
    // Usuń strefy krytyczne
    this.criticalZones.forEach(zone => {
      this.scene.remove(zone);
      zone.geometry.dispose();
      (zone.material as THREE.Material).dispose();
    });
    this.criticalZones.clear();
    
    // Usuń wizualizacje sił
    this.forceVisualizers.forEach(arrow => {
      this.scene.remove(arrow);
    });
    this.forceVisualizers.clear();
    
    // Usuń model tkanki
    if (this.tissueModel) {
      this.tissueModel.dispose();
      this.tissueModel = null;
    }
    
    // Wywołaj metodę bazową
    super.clearScene();
  }
  
  /**
   * Pomocnicza metoda do czyszczenia mesh
   */
  private disposeMesh(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        } else if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        }
      }
    });
  }
  
  /**
   * Eksportuje nagranie operacji
   */
  public exportRecording(): Blob {
    // Tu byłaby implementacja nagrywania
    // Zwracamy placeholder
    return new Blob([''], { type: 'video/webm' });
  }
}

/**
 * Model deformacji tkanki
 * Symuluje fizyczne odkształcenia podczas kontaktu
 */
class TissueDeformationModel {
  private scene: THREE.Scene;
  private tissueMesh: THREE.Mesh | null = null;
  private deformationField: DeformationField;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.deformationField = new DeformationField(50, 50, 20);
  }
  
  public async initialize(): Promise<void> {
    // Twórz siatkę tkanki
    const geometry = new THREE.PlaneGeometry(200, 200, 50, 50);
    const material = new THREE.MeshPhongMaterial({
      color: 0xffcccc,
      specular: 0x222222,
      shininess: 10,
      side: THREE.DoubleSide
    });
    
    this.tissueMesh = new THREE.Mesh(geometry, material);
    this.tissueMesh.rotation.x = -Math.PI / 2;
    this.tissueMesh.position.y = -50;
    this.tissueMesh.receiveShadow = true;
    
    this.scene.add(this.tissueMesh);
  }
  
  public applyForce(
    position: [number, number, number],
    magnitude: number,
    toolId: string
  ): void {
    if (!this.tissueMesh) return;
    
    // Konwertuj pozycję na współrzędne lokalne
    const localPos = this.tissueMesh.worldToLocal(
      new THREE.Vector3(...position)
    );
    
    // Aplikuj deformację
    this.deformationField.addForce(
      localPos.x,
      localPos.z, // PlaneGeometry jest w płaszczyźnie XZ
      magnitude,
      10 // Promień wpływu
    );
    
    // Aktualizuj geometrię
    this.updateGeometry();
  }
  
  private updateGeometry(): void {
    if (!this.tissueMesh) return;
    
    const geometry = this.tissueMesh.geometry as THREE.PlaneGeometry;
    const positions = geometry.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      
      // Pobierz deformację dla tej pozycji
      const deformation = this.deformationField.getDeformation(x, z);
      
      // Aplikuj deformację w osi Y
      positions.setY(i, -deformation * 5); // Skalowanie
    }
    
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  
  public dispose(): void {
    if (this.tissueMesh) {
      this.scene.remove(this.tissueMesh);
      this.tissueMesh.geometry.dispose();
      (this.tissueMesh.material as THREE.Material).dispose();
    }
  }
}

/**
 * Pole deformacji
 * Przechowuje i oblicza deformacje tkanki
 */
class DeformationField {
  private field: Float32Array;
  private width: number;
  private height: number;
  private depth: number;
  
  constructor(width: number, height: number, depth: number) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.field = new Float32Array(width * height);
  }
  
  public addForce(x: number, y: number, magnitude: number, radius: number): void {
    // Normalizuj współrzędne
    const nx = (x + 100) / 200 * this.width;
    const ny = (y + 100) / 200 * this.height;
    
    // Aplikuj siłę w promieniu
    for (let i = 0; i < this.width; i++) {
      for (let j = 0; j < this.height; j++) {
        const distance = Math.sqrt(
          Math.pow(i - nx, 2) + Math.pow(j - ny, 2)
        );
        
        if (distance < radius) {
          const falloff = 1 - distance / radius;
          const index = j * this.width + i;
          
          // Model sprężystości
          this.field[index] += magnitude * falloff * 0.1;
          
          // Ograniczenie maksymalnej deformacji
          this.field[index] = Math.min(this.field[index], this.depth);
        }
      }
    }
    
    // Relaksacja - tkanka powraca do formy
    this.relax();
  }
  
  private relax(): void {
    const relaxation = 0.95;
    for (let i = 0; i < this.field.length; i++) {
      this.field[i] *= relaxation;
    }
  }
  
  public getDeformation(x: number, y: number): number {
    const nx = Math.floor((x + 100) / 200 * this.width);
    const ny = Math.floor((y + 100) / 200 * this.height);
    
    if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) {
      return 0;
    }
    
    return this.field[ny * this.width + nx];
  }
}

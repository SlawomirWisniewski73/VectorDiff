/**
 * Three.js Renderer dla animacji VectorDiff 3D
 * 
 * Ten renderer wykorzystuje WebGL do renderowania złożonych scen 3D.
 * Jest idealny dla:
 * - Wizualizacji molekularnych
 * - Obrazowania medycznego 3D
 * - Symulacji chirurgicznych
 * - Każdej aplikacji wymagającej prawdziwego 3D
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { 
  VectorDiffAnimation, 
  VectorObject,
  Transformation 
} from '@vectordiff/core';

export interface ThreeRendererOptions {
  container: HTMLElement;
  width?: number;
  height?: number;
  backgroundColor?: number;
  enableControls?: boolean;
  enableShadows?: boolean;
  antialias?: boolean;
  // Opcje specyficzne dla zastosowań medycznych
  medicalMode?: 'molecular' | 'radiology' | 'surgical';
}

export class ThreeRenderer {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private animation: VectorDiffAnimation | null = null;
  private objects: Map<string, THREE.Object3D> = new Map();
  private animationMixer?: THREE.AnimationMixer;
  private clock: THREE.Clock = new THREE.Clock();
  
  // Stan animacji
  private currentTime: number = 0;
  private isPlaying: boolean = false;
  private animationFrame: number | null = null;
  
  constructor(options: ThreeRendererOptions) {
    this.container = options.container;
    
    // Inicjalizacja sceny
    this.scene = new THREE.Scene();
    if (options.backgroundColor !== undefined) {
      this.scene.background = new THREE.Color(options.backgroundColor);
    }
    
    // Inicjalizacja kamery
    const width = options.width || this.container.clientWidth;
    const height = options.height || this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(
      75, // FOV
      width / height, // Aspect ratio
      0.1, // Near plane
      10000 // Far plane - duży zakres dla różnych skal (molekuły vs anatomia)
    );
    
    // Ustawienie początkowej pozycji kamery
    this.setupCameraForMode(options.medicalMode);
    
    // Inicjalizacja renderera
    this.renderer = new THREE.WebGLRenderer({
      antialias: options.antialias !== false,
      alpha: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    
    // Włączenie cieni jeśli wymagane
    if (options.enableShadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    // Dodanie renderera do kontenera
    this.container.appendChild(this.renderer.domElement);
    
    // Dodanie kontrolek jeśli włączone
    if (options.enableControls !== false) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      
      // Dostosowanie kontrolek do trybu medycznego
      this.setupControlsForMode(options.medicalMode);
    }
    
    // Dodanie oświetlenia
    this.setupLighting(options.medicalMode);
    
    // Obsługa zmiany rozmiaru okna
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }
  
  /**
   * Ustawia kamerę w zależności od trybu medycznego
   * @param mode Tryb medyczny
   */
  private setupCameraForMode(mode?: string): void {
    switch (mode) {
      case 'molecular':
        // Dla molekuł - bliższa kamera, mniejsza skala
        this.camera.position.set(0, 0, 50);
        this.camera.near = 0.1;
        this.camera.far = 1000;
        break;
        
      case 'radiology':
        // Dla obrazowania - średnia odległość
        this.camera.position.set(0, 0, 300);
        this.camera.near = 1;
        this.camera.far = 2000;
        break;
        
      case 'surgical':
        // Dla chirurgii - dynamiczna kamera
        this.camera.position.set(100, 100, 200);
        this.camera.near = 0.1;
        this.camera.far = 5000;
        break;
        
      default:
        // Domyślne ustawienie
        this.camera.position.set(0, 0, 500);
    }
    
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }
  
  /**
   * Konfiguruje kontrolki dla różnych trybów
   * @param mode Tryb medyczny
   */
  private setupControlsForMode(mode?: string): void {
    if (!this.controls) return;
    
    switch (mode) {
      case 'molecular':
        // Dla molekuł - pełna swoboda rotacji
        this.controls.enablePan = true;
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 200;
        break;
        
      case 'radiology':
        // Dla obrazowania - ograniczona rotacja
        this.controls.enablePan = true;
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        this.controls.minDistance = 50;
        this.controls.maxDistance = 1000;
        // Ograniczenie rotacji dla zachowania orientacji medycznej
        this.controls.minPolarAngle = Math.PI / 4;
        this.controls.maxPolarAngle = 3 * Math.PI / 4;
        break;
        
      case 'surgical':
        // Dla chirurgii - precyzyjne kontrolki
        this.controls.enablePan = true;
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 500;
        this.controls.rotateSpeed = 0.5; // Wolniejsza rotacja dla precyzji
        this.controls.panSpeed = 0.8;
        break;
    }
  }
  
  /**
   * Ustawia oświetlenie sceny
   * @param mode Tryb medyczny wpływa na typ oświetlenia
   */
  private setupLighting(mode?: string): void {
    // Podstawowe światło ambiente
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    switch (mode) {
      case 'molecular':
        // Dla molekuł - równomierne oświetlenie ze wszystkich stron
        const molecularLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        molecularLight1.position.set(10, 10, 10);
        this.scene.add(molecularLight1);
        
        const molecularLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        molecularLight2.position.set(-10, -10, -10);
        this.scene.add(molecularLight2);
        break;
        
      case 'radiology':
        // Dla obrazowania - kontrastowe oświetlenie
        const radiologyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        radiologyLight.position.set(0, 0, 100);
        radiologyLight.castShadow = true;
        radiologyLight.shadow.mapSize.width = 2048;
        radiologyLight.shadow.mapSize.height = 2048;
        this.scene.add(radiologyLight);
        break;
        
      case 'surgical':
        // Dla chirurgii - symulacja lamp operacyjnych
        const surgicalLight1 = new THREE.SpotLight(0xffffff, 1.5);
        surgicalLight1.position.set(50, 200, 50);
        surgicalLight1.angle = Math.PI / 6;
        surgicalLight1.penumbra = 0.2;
        surgicalLight1.castShadow = true;
        this.scene.add(surgicalLight1);
        
        const surgicalLight2 = new THREE.SpotLight(0xffffff, 1.2);
        surgicalLight2.position.set(-50, 200, -50);
        surgicalLight2.angle = Math.PI / 6;
        surgicalLight2.penumbra = 0.2;
        surgicalLight2.castShadow = true;
        this.scene.add(surgicalLight2);
        break;
        
      default:
        // Standardowe oświetlenie
        const defaultLight = new THREE.DirectionalLight(0xffffff, 1.0);
        defaultLight.position.set(5, 5, 5);
        this.scene.add(defaultLight);
    }
  }
  
  /**
   * Ładuje animację VectorDiff do sceny 3D
   * @param animation Animacja do załadowania
   */
  public loadAnimation(animation: VectorDiffAnimation): void {
    // Zatrzymujemy bieżącą animację
    if (this.isPlaying) {
      this.stop();
    }
    
    // Czyścimy scenę
    this.clearScene();
    
    // Zapisujemy animację
    this.animation = animation;
    
    // Tworzymy obiekty 3D dla każdego elementu sceny bazowej
    animation.baseScene.objects.forEach(obj => {
      const object3D = this.createThreeObject(obj);
      if (object3D) {
        this.scene.add(object3D);
        this.objects.set(obj.id, object3D);
      }
    });
    
    // Przygotowujemy animacje Three.js
    this.prepareAnimations();
    
    // Resetujemy do początku
    this.currentTime = 0;
    this.updateToTime(0);
    
    // Pierwszy render
    this.render();
  }
  
  /**
   * Tworzy obiekt Three.js na podstawie VectorObject
   * @param obj Obiekt VectorDiff
   * @returns Obiekt Three.js
   */
  private createThreeObject(obj: VectorObject): THREE.Object3D | null {
    // Ta metoda będzie rozbudowana w zależności od typu obiektu
    // Na razie implementujemy podstawowe typy
    
    let object3D: THREE.Object3D | null = null;
    
    switch (obj.type) {
      case 'sphere': {
        // Przykład obiektu 3D - kula
        const geometry = new THREE.SphereGeometry(
          obj.data.radius || 1, 
          32, 
          32
        );
        const material = new THREE.MeshPhongMaterial({
          color: obj.attributes.fill || 0xffffff,
          opacity: obj.attributes.opacity || 1,
          transparent: obj.attributes.opacity < 1
        });
        object3D = new THREE.Mesh(geometry, material);
        
        // Ustawienie pozycji jeśli określona
        if (obj.data.position) {
          object3D.position.set(
            obj.data.position[0],
            obj.data.position[1],
            obj.data.position[2] || 0
          );
        }
        break;
      }
      
      case 'box': {
        // Prostopadłościan
        const geometry = new THREE.BoxGeometry(
          obj.data.width || 1,
          obj.data.height || 1,
          obj.data.depth || 1
        );
        const material = new THREE.MeshPhongMaterial({
          color: obj.attributes.fill || 0xffffff,
          opacity: obj.attributes.opacity || 1,
          transparent: obj.attributes.opacity < 1
        });
        object3D = new THREE.Mesh(geometry, material);
        
        if (obj.data.position) {
          object3D.position.set(
            obj.data.position[0],
            obj.data.position[1],
            obj.data.position[2] || 0
          );
        }
        break;
      }
      
      // Specjalne typy dla zastosowań medycznych
      case 'molecule': {
        // Tworzenie grupy dla molekuły
        object3D = new THREE.Group();
        object3D.name = `molecule_${obj.id}`;
        
        // Tu będzie bardziej złożona logika tworzenia molekuł
        // z atomami i wiązaniami
        break;
      }
      
      case 'medical-volume': {
        // Placeholder dla danych objętościowych (MRI/CT)
        // Wymaga bardziej zaawansowanej implementacji
        object3D = new THREE.Group();
        object3D.name = `volume_${obj.id}`;
        break;
      }
      
      default:
        console.warn(`Nieobsługiwany typ obiektu 3D: ${obj.type}`);
    }
    
    // Ustawienie ID dla identyfikacji
    if (object3D) {
      object3D.userData.vectorDiffId = obj.id;
      object3D.userData.vectorDiffType = obj.type;
    }
    
    return object3D;
  }
  
  /**
   * Przygotowuje animacje Three.js na podstawie timeline
   */
  private prepareAnimations(): void {
    if (!this.animation) return;
    
    // Tworzymy AnimationMixer
    this.animationMixer = new THREE.AnimationMixer(this.scene);
    
    // Dla każdego obiektu tworzymy track animacji
    const tracks: THREE.KeyframeTrack[] = [];
    
    // Grupujemy transformacje po obiektach
    const objectTransforms = new Map<string, Array<{time: number, transform: Transformation}>>();
    
    this.animation.timeline.forEach(keyframe => {
      keyframe.changes.forEach(change => {
        if (!objectTransforms.has(change.objectId)) {
          objectTransforms.set(change.objectId, []);
        }
        objectTransforms.get(change.objectId)!.push({
          time: keyframe.timestamp / 1000, // Three.js używa sekund
          transform: change.transformation
        });
      });
    });
    
    // Tworzymy tracki dla każdego obiektu
    objectTransforms.forEach((transforms, objectId) => {
      const object3D = this.objects.get(objectId);
      if (!object3D) return;
      
      // Przygotowujemy tablice dla różnych typów transformacji
      const positionTimes: number[] = [];
      const positionValues: number[] = [];
      const rotationTimes: number[] = [];
      const rotationValues: number[] = [];
      const scaleTimes: number[] = [];
      const scaleValues: number[] = [];
      
      // Przetwarzamy transformacje
      transforms.forEach(({time, transform}) => {
        switch (transform.type) {
          case 'translate':
            positionTimes.push(time);
            positionValues.push(
              object3D.position.x + transform.x,
              object3D.position.y + transform.y,
              object3D.position.z + (transform.z || 0)
            );
            break;
            
          case 'rotate':
            rotationTimes.push(time);
            // Konwersja stopni na radiany
            const radians = transform.angle * Math.PI / 180;
            if (transform.axis) {
              // Rotacja wokół określonej osi
              const quaternion = new THREE.Quaternion();
              quaternion.setFromAxisAngle(
                new THREE.Vector3(...transform.axis).normalize(),
                radians
              );
              rotationValues.push(
                quaternion.x,
                quaternion.y,
                quaternion.z,
                quaternion.w
              );
            } else {
              // Domyślna rotacja wokół Z
              rotationValues.push(0, 0, Math.sin(radians/2), Math.cos(radians/2));
            }
            break;
            
          case 'scale':
            scaleTimes.push(time);
            scaleValues.push(
              transform.scaleX,
              transform.scaleY,
              transform.scaleZ || 1
            );
            break;
        }
      });
      
      // Tworzymy tracki jeśli są dane
      if (positionTimes.length > 0) {
        tracks.push(new THREE.VectorKeyframeTrack(
          `${object3D.uuid}.position`,
          positionTimes,
          positionValues
        ));
      }
      
      if (rotationTimes.length > 0) {
        tracks.push(new THREE.QuaternionKeyframeTrack(
          `${object3D.uuid}.quaternion`,
          rotationTimes,
          rotationValues
        ));
      }
      
      if (scaleTimes.length > 0) {
        tracks.push(new THREE.VectorKeyframeTrack(
          `${object3D.uuid}.scale`,
          scaleTimes,
          scaleValues
        ));
      }
    });
    
    // Tworzymy AnimationClip jeśli są jakieś tracki
    if (tracks.length > 0) {
      const clip = new THREE.AnimationClip(
        'VectorDiffAnimation',
        this.animation.metadata.duration / 1000,
        tracks
      );
      const action = this.animationMixer.clipAction(clip);
      action.play();
    }
  }
  
  /**
   * Aktualizuje scenę do określonego czasu
   * @param time Czas w milisekundach
   */
  private updateToTime(time: number): void {
    if (!this.animationMixer) return;
    
    // Aktualizujemy mixer do odpowiedniego czasu
    this.animationMixer.setTime(time / 1000);
  }
  
  /**
   * Renderuje pojedynczą klatkę
   */
  private render(): void {
    if (this.controls) {
      this.controls.update();
    }
    
    this.renderer.render(this.scene, this.camera);
  }
  
  /**
   * Główna pętla animacji
   */
  private animate = (): void => {
    if (!this.isPlaying) return;
    
    this.animationFrame = requestAnimationFrame(this.animate);
    
    // Aktualizacja czasu
    const delta = this.clock.getDelta();
    if (this.animationMixer) {
      this.animationMixer.update(delta);
      this.currentTime = this.animationMixer.time * 1000;
      
      // Sprawdzenie czy dotarliśmy do końca
      if (this.currentTime >= this.animation!.metadata.duration) {
        this.currentTime = 0;
        this.animationMixer.setTime(0);
      }
    }
    
    this.render();
  }
  
  /**
   * Rozpoczyna odtwarzanie animacji
   */
  public play(): void {
    if (this.isPlaying || !this.animation) return;
    
    this.isPlaying = true;
    this.clock.start();
    this.animate();
  }
  
  /**
   * Zatrzymuje odtwarzanie
   */
  public pause(): void {
    this.isPlaying = false;
    this.clock.stop();
    
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
  
  /**
   * Zatrzymuje i resetuje do początku
   */
  public stop(): void {
    this.pause();
    this.currentTime = 0;
    if (this.animationMixer) {
      this.animationMixer.setTime(0);
    }
    this.render();
  }
  
  /**
   * Przewija do określonego czasu
   * @param time Czas w milisekundach
   */
  public seek(time: number): void {
    if (!this.animation || !this.animationMixer) return;
    
    this.currentTime = Math.max(0, Math.min(time, this.animation.metadata.duration));
    this.animationMixer.setTime(this.currentTime / 1000);
    this.render();
  }
  
  /**
   * Czyści scenę
   */
  private clearScene(): void {
    // Usuwamy wszystkie obiekty oprócz świateł i kamery
    const toRemove: THREE.Object3D[] = [];
    
    this.scene.traverse((child) => {
      if (child.userData.vectorDiffId) {
        toRemove.push(child);
      }
    });
    
    toRemove.forEach(obj => {
      this.scene.remove(obj);
      // Czyszczenie geometrii i materiałów
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) {
          obj.material.dispose();
        }
      }
    });
    
    this.objects.clear();
    
    // Czyszczenie animation mixera
    if (this.animationMixer) {
      this.animationMixer.stopAllAction();
      this.animationMixer = undefined;
    }
  }
  
  /**
   * Obsługa zmiany rozmiaru okna
   */
  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
    this.render();
  }
  
  /**
   * Eksportuje scenę do formatu GLTF
   * @returns Promise z buforem GLTF
   */
  public async exportGLTF(): Promise<ArrayBuffer> {
    // Ta funkcja wymaga dodatkowej biblioteki GLTFExporter
    // Implementacja zostanie dodana później
    throw new Error('GLTF export not implemented yet');
  }
  
  /**
   * Czyści renderer i zwalnia zasoby
   */
  public dispose(): void {
    this.stop();
    this.clearScene();
    
    if (this.controls) {
      this.controls.dispose();
    }
    
    this.renderer.dispose();
    
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    
    window.removeEventListener('resize', this.handleResize);
  }
  
  // Gettery
  public get playing(): boolean { return this.isPlaying; }
  public get time(): number { return this.currentTime; }
  public get duration(): number {
    return this.animation ? this.animation.metadata.duration : 0;
  }
}

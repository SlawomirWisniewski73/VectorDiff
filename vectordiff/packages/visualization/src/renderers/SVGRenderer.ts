/**
 * SVG Renderer dla animacji VectorDiff
 * 
 * Ten renderer jest idealny dla prostych animacji 2D i oferuje:
 * - Natywne wsparcie przeglądarek dla SVG
 * - Łatwe stylowanie przez CSS
 * - Małe zużycie zasobów
 * - Idealny dla animacji UI i infografik
 */

import { 
  VectorDiffAnimation, 
  VectorObject, 
  TimelineKeyframe,
  Transformation 
} from '@vectordiff/core';
import { applyTransformation } from '@vectordiff/core';

export interface SVGRendererOptions {
  container: HTMLElement;
  width?: number;
  height?: number;
  backgroundColor?: string;
  preserveAspectRatio?: string;
  enableInteraction?: boolean;
}

export class SVGRenderer {
  private container: HTMLElement;
  private svg: SVGSVGElement;
  private animation: VectorDiffAnimation | null = null;
  private elements: Map<string, SVGElement> = new Map();
  private currentTime: number = 0;
  private isPlaying: boolean = false;
  private lastFrameTime: number = 0;
  private animationFrame: number | null = null;
  
  constructor(options: SVGRendererOptions) {
    this.container = options.container;
    
    // Tworzenie głównego elementu SVG
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', String(options.width || 800));
    this.svg.setAttribute('height', String(options.height || 600));
    
    if (options.preserveAspectRatio) {
      this.svg.setAttribute('preserveAspectRatio', options.preserveAspectRatio);
    }
    
    // Ustawienie tła jeśli określone
    if (options.backgroundColor) {
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', '100%');
      bg.setAttribute('height', '100%');
      bg.setAttribute('fill', options.backgroundColor);
      this.svg.appendChild(bg);
    }
    
    // Dodanie SVG do kontenera
    this.container.appendChild(this.svg);
    
    // Włączenie interakcji jeśli wymagane
    if (options.enableInteraction) {
      this.enableInteractions();
    }
  }
  
  /**
   * Ładuje animację VectorDiff do renderera
   * @param animation Animacja do załadowania
   */
  public loadAnimation(animation: VectorDiffAnimation): void {
    // Zatrzymujemy bieżącą animację jeśli jest odtwarzana
    if (this.isPlaying) {
      this.stop();
    }
    
    // Czyścimy poprzednie elementy
    this.clearScene();
    
    // Zapisujemy nową animację
    this.animation = animation;
    
    // Ustawiamy wymiary SVG na podstawie animacji
    this.svg.setAttribute('width', String(animation.baseScene.canvas.width));
    this.svg.setAttribute('height', String(animation.baseScene.canvas.height));
    
    // Tworzymy elementy SVG dla każdego obiektu w scenie bazowej
    animation.baseScene.objects.forEach(obj => {
      const element = this.createSVGElement(obj);
      if (element) {
        this.svg.appendChild(element);
        this.elements.set(obj.id, element);
      }
    });
    
    // Resetujemy do początku animacji
    this.currentTime = 0;
    this.updateToTime(0);
  }
  
  /**
   * Tworzy element SVG na podstawie obiektu VectorDiff
   * @param obj Obiekt VectorDiff
   * @returns Element SVG lub null jeśli typ nie jest obsługiwany
   */
  private createSVGElement(obj: VectorObject): SVGElement | null {
    let element: SVGElement | null = null;
    
    switch (obj.type) {
      case 'rect': {
        element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        // Parsujemy dane prostokąta
        const match = (obj.data as string).match(/x=([\d.-]+)\s+y=([\d.-]+)\s+width=([\d.-]+)\s+height=([\d.-]+)/);
        if (match) {
          element.setAttribute('x', match[1]);
          element.setAttribute('y', match[2]);
          element.setAttribute('width', match[3]);
          element.setAttribute('height', match[4]);
        }
        break;
      }
      
      case 'ellipse': {
        element = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        // Parsujemy dane elipsy
        const match = (obj.data as string).match(/cx=([\d.-]+)\s+cy=([\d.-]+)\s+rx=([\d.-]+)\s+ry=([\d.-]+)/);
        if (match) {
          element.setAttribute('cx', match[1]);
          element.setAttribute('cy', match[2]);
          element.setAttribute('rx', match[3]);
          element.setAttribute('ry', match[4]);
        }
        break;
      }
      
      case 'path': {
        element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        element.setAttribute('d', obj.data as string);
        break;
      }
      
      case 'text': {
        element = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        element.textContent = obj.data as string;
        // Ustawiamy pozycję z atrybutów
        if (obj.attributes.x) element.setAttribute('x', String(obj.attributes.x));
        if (obj.attributes.y) element.setAttribute('y', String(obj.attributes.y));
        break;
      }
      
      case 'group': {
        element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        // Grupy będą zawierać odniesienia do innych obiektów
        // To wymaga bardziej złożonej logiki
        break;
      }
      
      default:
        console.warn(`Nieobsługiwany typ obiektu: ${obj.type}`);
        return null;
    }
    
    // Aplikujemy atrybuty do elementu
    if (element && obj.attributes) {
      Object.entries(obj.attributes).forEach(([key, value]) => {
        // Pomijamy specjalne atrybuty już obsłużone
        if (key !== 'x' && key !== 'y') {
          element!.setAttribute(key, String(value));
        }
      });
    }
    
    // Ustawiamy ID dla łatwej identyfikacji
    if (element) {
      element.setAttribute('data-vectordiff-id', obj.id);
    }
    
    return element;
  }
  
  /**
   * Aktualizuje scenę do określonego punktu czasowego
   * @param time Czas w milisekundach
   */
  private updateToTime(time: number): void {
    if (!this.animation) return;
    
    // Najpierw resetujemy wszystkie elementy do stanu bazowego
    this.resetToBaseState();
    
    // Znajdujemy wszystkie klatki kluczowe do tego momentu
    const relevantKeyframes = this.animation.timeline
      .filter(kf => kf.timestamp <= time)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Aplikujemy transformacje kumulatywnie
    const cumulativeTransforms = new Map<string, Transformation[]>();
    
    relevantKeyframes.forEach(keyframe => {
      keyframe.changes.forEach(change => {
        if (!cumulativeTransforms.has(change.objectId)) {
          cumulativeTransforms.set(change.objectId, []);
        }
        cumulativeTransforms.get(change.objectId)!.push(change.transformation);
      });
    });
    
    // Aplikujemy skumulowane transformacje do elementów
    cumulativeTransforms.forEach((transforms, objectId) => {
      const element = this.elements.get(objectId);
      if (element) {
        // Tworzymy łańcuch transformacji
        const transformString = transforms
          .map(t => this.transformationToSVGTransform(t))
          .join(' ');
        
        element.setAttribute('transform', transformString);
      }
    });
  }
  
  /**
   * Konwertuje transformację VectorDiff na string SVG transform
   * @param transformation Transformacja do konwersji
   * @returns String transformacji SVG
   */
  private transformationToSVGTransform(transformation: Transformation): string {
    switch (transformation.type) {
      case 'translate':
        return `translate(${transformation.x}, ${transformation.y})`;
        
      case 'rotate': {
        let str = `rotate(${transformation.angle}`;
        if (transformation.centerX !== undefined && transformation.centerY !== undefined) {
          str += ` ${transformation.centerX} ${transformation.centerY}`;
        }
        str += ')';
        return str;
      }
      
      case 'scale': {
        if (transformation.centerX !== undefined && transformation.centerY !== undefined) {
          // Skalowanie z punktem centralnym wymaga translacji
          return `translate(${transformation.centerX}, ${transformation.centerY}) ` +
                 `scale(${transformation.scaleX}, ${transformation.scaleY}) ` +
                 `translate(${-transformation.centerX}, ${-transformation.centerY})`;
        }
        return `scale(${transformation.scaleX}, ${transformation.scaleY})`;
      }
      
      case 'affine':
        // SVG używa matrix(a, b, c, d, e, f)
        return `matrix(${transformation.matrix.slice(0, 6).join(' ')})`;
        
      default:
        console.warn(`Nieobsługiwany typ transformacji: ${(transformation as any).type}`);
        return '';
    }
  }
  
  /**
   * Resetuje wszystkie elementy do stanu bazowego
   */
  private resetToBaseState(): void {
    this.elements.forEach(element => {
      element.removeAttribute('transform');
    });
  }
  
  /**
   * Rozpoczyna odtwarzanie animacji
   */
  public play(): void {
    if (!this.animation || this.isPlaying) return;
    
    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    
    const animate = (timestamp: number) => {
      if (!this.isPlaying) return;
      
      // Obliczamy deltę czasu
      const deltaTime = timestamp - this.lastFrameTime;
      this.lastFrameTime = timestamp;
      
      // Aktualizujemy bieżący czas
      this.currentTime += deltaTime;
      
      // Sprawdzamy czy dotarliśmy do końca
      if (this.currentTime > this.animation!.metadata.duration) {
        this.currentTime = 0; // Zapętlamy animację
      }
      
      // Aktualizujemy scenę
      this.updateToTime(this.currentTime);
      
      // Kontynuujemy animację
      this.animationFrame = requestAnimationFrame(animate);
    };
    
    this.animationFrame = requestAnimationFrame(animate);
  }
  
  /**
   * Zatrzymuje odtwarzanie animacji
   */
  public pause(): void {
    this.isPlaying = false;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
  
  /**
   * Zatrzymuje animację i wraca do początku
   */
  public stop(): void {
    this.pause();
    this.currentTime = 0;
    this.updateToTime(0);
  }
  
  /**
   * Ustawia animację na konkretny punkt czasowy
   * @param time Czas w milisekundach
   */
  public seek(time: number): void {
    if (!this.animation) return;
    
    // Ograniczamy czas do długości animacji
    this.currentTime = Math.max(0, Math.min(time, this.animation.metadata.duration));
    this.updateToTime(this.currentTime);
  }
  
  /**
   * Czyści scenę usuwając wszystkie elementy
   */
  private clearScene(): void {
    // Usuwamy wszystkie elementy SVG oprócz tła
    while (this.svg.lastChild) {
      if (this.svg.lastChild.nodeName === 'rect' && 
          this.svg.lastChild === this.svg.firstChild) {
        break; // Zachowujemy tło
      }
      this.svg.removeChild(this.svg.lastChild);
    }
    
    this.elements.clear();
  }
  
  /**
   * Włącza podstawowe interakcje z elementami
   */
  private enableInteractions(): void {
    // Dodajemy nasłuchiwanie na kliknięcia elementów
    this.svg.addEventListener('click', (event) => {
      const target = event.target as SVGElement;
      const vectorDiffId = target.getAttribute('data-vectordiff-id');
      
      if (vectorDiffId) {
        // Emitujemy własne zdarzenie z ID obiektu
        const customEvent = new CustomEvent('vectordiff:objectClick', {
          detail: { objectId: vectorDiffId, element: target }
        });
        this.container.dispatchEvent(customEvent);
      }
    });
    
    // Podświetlenie przy najechaniu
    this.svg.addEventListener('mouseover', (event) => {
      const target = event.target as SVGElement;
      if (target.getAttribute('data-vectordiff-id')) {
        target.style.cursor = 'pointer';
        target.style.opacity = '0.8';
      }
    });
    
    this.svg.addEventListener('mouseout', (event) => {
      const target = event.target as SVGElement;
      if (target.getAttribute('data-vectordiff-id')) {
        target.style.cursor = '';
        target.style.opacity = '';
      }
    });
  }
  
  /**
   * Eksportuje bieżący stan jako SVG string
   * @returns String SVG
   */
  public exportSVG(): string {
    return new XMLSerializer().serializeToString(this.svg);
  }
  
  /**
   * Czyści renderer i usuwa go z DOM
   */
  public dispose(): void {
    this.stop();
    this.clearScene();
    if (this.svg.parentNode) {
      this.svg.parentNode.removeChild(this.svg);
    }
  }
  
  // Gettery dla stanu renderera
  public get playing(): boolean { return this.isPlaying; }
  public get time(): number { return this.currentTime; }
  public get duration(): number { 
    return this.animation ? this.animation.metadata.duration : 0; 
  }
}

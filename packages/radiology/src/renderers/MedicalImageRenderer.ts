import { VectorDiffAnimation } from '@vectordiff/core';
import { ThreeRenderer } from '@vectordiff/visualization';

// Renderer medyczny może dziedziczyć z ThreeRenderer, aby mieć dostęp do kamery i sceny
export class MedicalImageRenderer extends ThreeRenderer {
  constructor(options: any) {
    super(options);
    // Teraz `this.camera` istnieje, ponieważ jest dziedziczone
    this.camera.position.set(0, 0, 500); 
  }

  loadDICOMAnimation(animation: VectorDiffAnimation) {
    // Logika ładowania specyficznych obiektów medycznych
    console.log('Loading medical visualization...');
    super.loadAnimation(animation);
  }
}

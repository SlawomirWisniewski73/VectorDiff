import { VectorDiffAnimation } from '@vectordiff/core';
import { ThreeRenderer } from '@vectordiff/visualization';

// SurgicalRenderer dziedziczy z ThreeRenderer, aby mieć dostęp do sceny 3D
export class SurgicalRenderer extends ThreeRenderer {
  constructor(options: any) {
    super(options);
    // Błąd "Property 'camera' does not exist" znika, bo kamera jest dziedziczona
    this.camera.position.set(100, 100, 200);
  }

  loadSurgicalAnimation(animation: VectorDiffAnimation) {
    console.log('Loading surgical visualization...');
    super.loadAnimation(animation);
  }
}

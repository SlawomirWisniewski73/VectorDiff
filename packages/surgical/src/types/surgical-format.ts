import { VectorObject } from '@vectordiff/core';

// Prosta definicja typu, aby naprawić błędy
export interface SurgicalInstrument extends VectorObject {
  instrumentType: 'scalpel' | 'grasper';
}

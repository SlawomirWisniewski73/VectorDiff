// Krok 1: Importujemy wszystko, co chcemy wyeksportować
import {
  parseVectorDiff,
  serializeVectorDiff,
  validateVectorDiff,
  vectorDiffToAnimation,
  animationToVectorDiff
} from './parser';

import {
  applyTransformation,
  detectTransformation
} from './transformer';

import {
  createAnimation,
  addRectangle,
  addCircle,
  addPath,
  addTransformation
} from './exporter';

// Krok 2: Eksportujemy typy i interfejsy
export * from './format';

// Krok 3: Eksportujemy zaimportowane funkcje
export {
  parseVectorDiff,
  serializeVectorDiff,
  validateVectorDiff,
  vectorDiffToAnimation,
  animationToVectorDiff,
  applyTransformation,
  detectTransformation,
  createAnimation,
  addRectangle,
  addCircle,
  addPath,
  addTransformation
};

// Krok 4: Tworzymy i eksportujemy obiekt domyślny
const VectorDiff = {
  createAnimation,
  addRectangle,
  addCircle,
  addPath,
  addTransformation,
  // Dodajemy brakujące funkcje do default export
  parseVectorDiff,
  serializeVectorDiff
};

export default VectorDiff;

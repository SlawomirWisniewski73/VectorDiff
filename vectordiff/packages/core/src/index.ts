/**
 * Publiczne API biblioteki VectorDiff Core
 * Ten plik eksportuje wszystkie publiczne elementy biblioteki
 */

// Eksport typów i interfejsów
export type {
  // Podstawowe typy
  VectorDiffAnimation,
  Animation,
  VectorObject,
  Attributes,
  Metadata,
  BaseScene,
  Canvas,
  TimelineKeyframe,
  ObjectChange,
  
  // Typy transformacji
  Transformation,
  TranslateTransformation,
  RotateTransformation,
  ScaleTransformation,
  AffineTransformation
} from './format';

// Eksport funkcji z format.ts
export { createEmptyAnimation } from './format';

// Eksport funkcji z parser.ts
export {
  validateVectorDiff,
  parseVectorDiff,
  serializeVectorDiff,
  vectorDiffToAnimation,
  animationToVectorDiff
} from './parser';

// Eksport funkcji z transformer.ts
export {
  applyTransformation,
  detectTransformation
} from './transformer';

// Eksport funkcji z exporter.ts
export {
  // Tworzenie i zarządzanie animacją
  createAnimation,
  cloneAnimation,
  createSampleAnimation,
  
  // Dodawanie obiektów
  addPath,
  addRectangle,
  addEllipse,
  addCircle,
  addText,
  addGroup,
  
  // Transformacje
  addTransformation,
  
  // Import/Export
  exportVectorDiff,
  loadAnimation,
  loadAnimationFromJson,
  exportAnimationToJson
} from './exporter';

// Eksport wersji biblioteki
export const VERSION = '0.2.0';

// Eksport domyślny - podstawowe funkcje
export default {
  createAnimation,
  addRectangle,
  addCircle,
  addPath,
  addTransformation,
  exportVectorDiff,
  loadAnimation,
  VERSION
}

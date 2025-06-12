/**
 * Główny punkt wejścia dla pakietu wizualizacji VectorDiff
 * 
 * Ten moduł eksportuje wszystkie komponenty wizualizacyjne,
 * umożliwiając łatwe użycie w różnych kontekstach
 */

// Eksport rendererów
export { SVGRenderer } from './renderers/SVGRenderer';
export type { SVGRendererOptions } from './renderers/SVGRenderer';

export { ThreeRenderer } from './renderers/ThreeRenderer';
export type { ThreeRendererOptions } from './renderers/ThreeRenderer';

// Eksport komponentów React
export { VectorDiffPlayer, vectorDiffPlayerStyles } from './components/VectorDiffPlayer';
export type { VectorDiffPlayerProps } from './components/VectorDiffPlayer';

// Re-eksport podstawowych typów z core dla wygody
export type { 
  VectorDiffAnimation,
  VectorObject,
  Transformation 
} from '@vectordiff/core';

// Funkcje pomocnicze
export { createRenderer } from './utils/createRenderer';
export { detectBestRenderer } from './utils/detectBestRenderer';

// Wersja pakietu
export const VERSION = '0.1.0';

/**
 * Domyślny eksport - najczęściej używane elementy
 */
export default {
  SVGRenderer,
  ThreeRenderer,
  VectorDiffPlayer,
  VERSION
}

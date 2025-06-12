/**
 * Główny punkt wejścia dla pakietu molekularnego VectorDiff
 * 
 * Ten moduł eksportuje wszystkie komponenty potrzebne do:
 * - Parsowania struktur molekularnych
 * - Analizy zmian konformacyjnych
 * - Wizualizacji białek i ligandów
 * - Integracji z bazami danych i AI
 */

// Eksport typów
export * from './types/molecular-format';

// Eksport parserów
export { PDBParser, parsePDB, fetchPDBStructure } from './parsers/PDBParser';

// Eksport analizy
export { 
  ConformationalAnalyzer,
  analyzeConformationalChanges 
} from './analysis/ConformationalAnalysis';

// Eksport rendererów
export { MolecularRenderer } from './renderers/MolecularRenderer';
export type { MolecularRendererOptions } from './renderers/MolecularRenderer';

// Eksport integracji
export { 
  AlphaFoldIntegration,
  fetchAlphaFoldStructure,
  useAlphaFoldStructure 
} from './integrations/AlphaFoldIntegration';

// Re-eksport podstawowych typów z core dla wygody
export type { VectorDiffAnimation } from '@vectordiff/core';

// Wersja pakietu
export const VERSION = '0.1.0';

/**
 * Domyślny eksport - najczęściej używane elementy
 */
export default {
  parsePDB,
  MolecularRenderer,
  fetchAlphaFoldStructure,
  ConformationalAnalyzer,
  VERSION
}

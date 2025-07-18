/**
 * Główny punkt wejścia dla pakietu radiologicznego VectorDiff
 * 
 * Ten moduł eksportuje wszystkie komponenty dla:
 * - Parsowania obrazów medycznych (DICOM)
 * - Analizy progresji chorób
 * - Wizualizacji danych radiologicznych
 * - Integracji z systemami szpitalnymi
 */

// Eksport typów
export * from './types/radiology-format';

// Eksport parserów
export { 
  DICOMParser, 
  DICOMSeries,
  DICOMImage,
  parseDICOMSeries,
  AutoSegmentation 
} from './parsers/DICOMParser';

// Eksport analizy
export { 
  DiseaseProgressionAnalyzer,
  analyzeProgression,
  ProgressionAnalysisOptions,
  ProgressionAnalysisResult,
  VolumeChangeAnalysis,
  GlobalAnalysis,
  ProgressionSummary
} from './analysis/DiseaseProgressionAnalysis';

// Eksport rendererów
export { 
  MedicalImageRenderer,
  MedicalImageRendererOptions,
  WindowPreset
} from './renderers/MedicalImageRenderer';

// Re-eksport podstawowych typów z core
export type { VectorDiffAnimation } from '@vectordiff/core';

// Wersja pakietu
export const VERSION = '0.1.0';

/**
 * Domyślny eksport - najczęściej używane elementy
 */
export default {
  DICOMParser,
  DiseaseProgressionAnalyzer,
  MedicalImageRenderer,
  parseDICOMSeries,
  analyzeProgression,
  VERSION
}

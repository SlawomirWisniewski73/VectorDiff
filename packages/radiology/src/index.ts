// Importujemy wszystko, co chcemy udostępnić na zewnątrz
import { DICOMParser, parseDICOMSeries } from './parsers/DICOMParser.js';
import { MedicalImageRenderer } from './renderers/MedicalImageRenderer.js';
import { DiseaseProgressionAnalyzer, analyzeProgression } from './analysis/DiseaseProgressionAnalysis.js';

// Eksportujemy typy
export * from './types/radiology-format.js';

// Eksportujemy zaimportowane klasy i funkcje
export {
  DICOMParser,
  parseDICOMSeries,
  MedicalImageRenderer,
  DiseaseProgressionAnalyzer,
  analyzeProgression
};

// Tworzymy i eksportujemy obiekt domyślny
const Radiology = {
  DICOMParser,
  parseDICOMSeries,
  MedicalImageRenderer,
  DiseaseProgressionAnalyzer,
  analyzeProgression
};

export default Radiology;

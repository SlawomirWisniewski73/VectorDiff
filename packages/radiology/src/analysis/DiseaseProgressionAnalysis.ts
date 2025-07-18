/**
 * System analizy progresji chorób w obrazowaniu medycznym
 * 
 * Ten moduł zawiera algorytmy do:
 * - Porównywania badań w czasie
 * - Kwantyfikacji zmian w strukturach anatomicznych
 * - Automatycznej detekcji nowych zmian
 * - Generowania raportów progresji
 * 
 * Kluczowa wartość: zamiast manualnego porównywania obrazów,
 * system automatycznie identyfikuje i kwantyfikuje zmiany
 */

import {
  RadiologyAnimation,
  AnatomicalSegmentation,
  Measurement,
  FindingComparison,
  SegmentationChange,
  calculateVolume,
  calculateRECIST,
  MorphologyChange
} from '../types/radiology-format';
import { addTransformation } from '@vectordiff/core';

/**
 * Główna klasa do analizy progresji
 */
export class DiseaseProgressionAnalyzer {
  
  /**
   * Porównuje dwa badania i generuje raport zmian
   * @param baseline Badanie bazowe (wcześniejsze)
   * @param followup Badanie kontrolne (późniejsze)
   * @param options Opcje analizy
   * @returns Animacja pokazująca progresję
   */
  public analyzeProgression(
    baseline: RadiologyAnimation,
    followup: RadiologyAnimation,
    options: ProgressionAnalysisOptions = {}
  ): ProgressionAnalysisResult {
    // Weryfikacja kompatybilności badań
    this.validateStudyCompatibility(baseline, followup);
    
    // Dopasowanie segmentacji między badaniami
    const segmentationPairs = this.matchSegmentations(
      baseline.segmentations || [],
      followup.segmentations || []
    );
    
    // Analiza zmian dla każdej pary segmentacji
    const findings: FindingComparison[] = [];
    const volumeChanges: VolumeChangeAnalysis[] = [];
    
    segmentationPairs.forEach(pair => {
      const finding = this.analyzeSegmentationPair(pair.baseline, pair.followup);
      findings.push(finding);
      
      if (pair.baseline && pair.followup) {
        const volumeChange = this.analyzeVolumeChange(pair.baseline, pair.followup);
        volumeChanges.push(volumeChange);
      }
    });
    
    // Detekcja nowych zmian
    const newFindings = this.detectNewFindings(baseline, followup);
    findings.push(...newFindings);
    
    // Analiza globalnych zmian
    const globalAnalysis = this.performGlobalAnalysis(baseline, followup);
    
    // Generowanie animacji progresji
    const progressionAnimation = this.generateProgressionAnimation(
      baseline,
      followup,
      findings,
      options.animationDuration || 3000
    );
    
    return {
      findings,
      volumeChanges,
      newFindings,
      globalAnalysis,
      progressionAnimation,
      summary: this.generateSummary(findings, volumeChanges)
    };
  }
  
  /**
   * Waliduje kompatybilność badań
   */
  private validateStudyCompatibility(
    baseline: RadiologyAnimation,
    followup: RadiologyAnimation
  ): void {
    // Sprawdzenie modalności
    if (baseline.imagingData.modality !== followup.imagingData.modality) {
      throw new Error('Studies must have the same imaging modality');
    }
    
    // Sprawdzenie parametrów akwizycji
    const baselineParams = baseline.imagingData.acquisitionParameters;
    const followupParams = followup.imagingData.acquisitionParameters;
    
    // Tolerancja 10% dla różnic w spacing
    const spacingTolerance = 0.1;
    
    if (Math.abs(baselineParams.pixelSpacing[0] - followupParams.pixelSpacing[0]) / 
        baselineParams.pixelSpacing[0] > spacingTolerance) {
      console.warn('Pixel spacing differs significantly between studies');
    }
  }
  
  /**
   * Dopasowuje segmentacje między badaniami
   * Używa różnych kryteriów: nazwa, lokalizacja, objętość
   */
  private matchSegmentations(
    baselineSegs: AnatomicalSegmentation[],
    followupSegs: AnatomicalSegmentation[]
  ): Array<{
    baseline: AnatomicalSegmentation | null,
    followup: AnatomicalSegmentation | null
  }> {
    const pairs: any[] = [];
    const matchedFollowup = new Set<string>();
    
    // Najpierw dopasowujemy po nazwie i lokalizacji
    baselineSegs.forEach(baseSeg => {
      let bestMatch: AnatomicalSegmentation | null = null;
      let bestScore = 0;
      
      followupSegs.forEach(followSeg => {
        if (matchedFollowup.has(followSeg.segmentationId)) return;
        
        const score = this.calculateMatchScore(baseSeg, followSeg);
        if (score > bestScore && score > 0.5) { // Próg dopasowania
          bestScore = score;
          bestMatch = followSeg;
        }
      });
      
      if (bestMatch) {
        matchedFollowup.add(bestMatch.segmentationId);
        pairs.push({ baseline: baseSeg, followup: bestMatch });
      } else {
        // Zniknięcie struktury
        pairs.push({ baseline: baseSeg, followup: null });
      }
    });
    
    // Dodajemy nowe struktury (nie dopasowane)
    followupSegs.forEach(followSeg => {
      if (!matchedFollowup.has(followSeg.segmentationId)) {
        pairs.push({ baseline: null, followup: followSeg });
      }
    });
    
    return pairs;
  }
  
  /**
   * Oblicza score dopasowania między segmentacjami
   */
  private calculateMatchScore(
    seg1: AnatomicalSegmentation,
    seg2: AnatomicalSegmentation
  ): number {
    let score = 0;
    
    // Dopasowanie nazwy struktury
    if (seg1.anatomicalStructure.name === seg2.anatomicalStructure.name) {
      score += 0.4;
    }
    
    // Dopasowanie kodu SNOMED
    if (seg1.anatomicalStructure.snomedCode && 
        seg1.anatomicalStructure.snomedCode === seg2.anatomicalStructure.snomedCode) {
      score += 0.3;
    }
    
    // Podobieństwo lokalizacji (centrum bounding box)
    const center1 = this.getBoundingBoxCenter(seg1.boundingBox);
    const center2 = this.getBoundingBoxCenter(seg2.boundingBox);
    const distance = this.calculateDistance(center1, center2);
    
    // Normalizujemy odległość (zakładamy max 100mm różnicy)
    const locationScore = Math.max(0, 1 - distance / 100) * 0.3;
    score += locationScore;
    
    return score;
  }
  
  /**
   * Oblicza centrum bounding box
   */
  private getBoundingBoxCenter(box: any): [number, number, number] {
    return [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2
    ];
  }
  
  /**
   * Oblicza odległość euklidesową
   */
  private calculateDistance(p1: [number, number, number], p2: [number, number, number]): number {
    return Math.sqrt(
      Math.pow(p1[0] - p2[0], 2) +
      Math.pow(p1[1] - p2[1], 2) +
      Math.pow(p1[2] - p2[2], 2)
    );
  }
  
  /**
   * Analizuje parę segmentacji
   */
  private analyzeSegmentationPair(
    baseline: AnatomicalSegmentation | null,
    followup: AnatomicalSegmentation | null
  ): FindingComparison {
    // Nowe znalezisko
    if (!baseline && followup) {
      return {
        findingId: `new_${followup.segmentationId}`,
        findingType: 'lesion',
        currentMeasurement: this.createMeasurement(followup),
        changeType: 'new',
        clinicalSignificance: this.assessClinicalSignificance(null, followup)
      };
    }
    
    // Zniknięcie znaleziska
    if (baseline && !followup) {
      return {
        findingId: `resolved_${baseline.segmentationId}`,
        findingType: 'lesion',
        previousMeasurement: this.createMeasurement(baseline),
        changeType: 'resolved',
        clinicalSignificance: 'benign'
      };
    }
    
    // Porównanie istniejącego znaleziska
    const baselineMeasurement = this.createMeasurement(baseline!);
    const followupMeasurement = this.createMeasurement(followup!);
    
    const volumeChange = ((followupMeasurement.value - baselineMeasurement.value) / 
                         baselineMeasurement.value) * 100;
    
    let changeType: 'stable' | 'progressing' | 'regressing';
    
    // Kryteria RECIST dla zmian
    if (Math.abs(volumeChange) < 20) {
      changeType = 'stable';
    } else if (volumeChange > 0) {
      changeType = 'progressing';
    } else {
      changeType = 'regressing';
    }
    
    return {
      findingId: baseline!.segmentationId,
      findingType: 'lesion',
      previousMeasurement: baselineMeasurement,
      currentMeasurement: followupMeasurement,
      changeType,
      changePercentage: volumeChange,
      clinicalSignificance: this.assessClinicalSignificance(baseline, followup)
    };
  }
  
  /**
   * Tworzy pomiar z segmentacji
   */
  private createMeasurement(segmentation: AnatomicalSegmentation): Measurement {
    const volume = segmentation.volume || calculateVolume(segmentation.representation);
    
    return {
      measurementId: `vol_${segmentation.segmentationId}`,
      type: 'volume',
      value: volume,
      unit: 'cm³',
      associatedSegmentation: segmentation.segmentationId
    };
  }
  
  /**
   * Ocenia znaczenie kliniczne zmiany
   */
  private assessClinicalSignificance(
    baseline: AnatomicalSegmentation | null,
    followup: AnatomicalSegmentation | null
  ): 'benign' | 'probably-benign' | 'suspicious' | 'malignant' {
    // To jest uproszczona heurystyka
    // W praktyce wymagałoby to złożonych reguł klinicznych
    
    if (!baseline && followup) {
      // Nowa zmiana
      const volume = followup.volume || calculateVolume(followup.representation);
      
      if (volume < 0.5) return 'probably-benign';
      if (volume < 2.0) return 'suspicious';
      return 'malignant';
    }
    
    if (baseline && followup) {
      const volumeChange = ((followup.volume || 0) - (baseline.volume || 0)) / 
                          (baseline.volume || 1) * 100;
      
      if (volumeChange > 50) return 'malignant';
      if (volumeChange > 20) return 'suspicious';
      if (volumeChange < -30) return 'probably-benign';
    }
    
    return 'benign';
  }
  
  /**
   * Analizuje zmianę objętości
   */
  private analyzeVolumeChange(
    baseline: AnatomicalSegmentation,
    followup: AnatomicalSegmentation
  ): VolumeChangeAnalysis {
    const baselineVolume = baseline.volume || calculateVolume(baseline.representation);
    const followupVolume = followup.volume || calculateVolume(followup.representation);
    
    const absoluteChange = followupVolume - baselineVolume;
    const percentageChange = (absoluteChange / baselineVolume) * 100;
    
    // Analiza morfologii
    const morphologyChange = this.analyzeMorphologyChange(baseline, followup);
    
    // Obliczanie tempa wzrostu (doubling time)
    const daysBetweenStudies = 90; // Założenie - w praktyce z metadanych
    const doublingTime = this.calculateDoublingTime(
      baselineVolume,
      followupVolume,
      daysBetweenStudies
    );
    
    return {
      segmentationId: baseline.segmentationId,
      structureName: baseline.anatomicalStructure.name,
      baselineVolume,
      followupVolume,
      absoluteChange,
      percentageChange,
      morphologyChange,
      doublingTime,
      growthRate: absoluteChange / daysBetweenStudies // cm³/dzień
    };
  }
  
  /**
   * Analizuje zmiany morfologiczne
   */
  private analyzeMorphologyChange(
    baseline: AnatomicalSegmentation,
    followup: AnatomicalSegmentation
  ): MorphologyChange {
    // Porównanie centrów mas
    const baselineCenter = this.getBoundingBoxCenter(baseline.boundingBox);
    const followupCenter = this.getBoundingBoxCenter(followup.boundingBox);
    
    const displacement: [number, number, number] = [
      followupCenter[0] - baselineCenter[0],
      followupCenter[1] - baselineCenter[1],
      followupCenter[2] - baselineCenter[2]
    ];
    
    const magnitude = Math.sqrt(
      displacement[0] ** 2 + 
      displacement[1] ** 2 + 
      displacement[2] ** 2
    );
    
    // Analiza typu zmiany na podstawie objętości i przemieszczenia
    let type: 'growth' | 'shrinkage' | 'deformation' | 'displacement';
    
    const volumeRatio = (followup.volume || 1) / (baseline.volume || 1);
    
    if (magnitude > 10) { // Przemieszczenie > 10mm
      type = 'displacement';
    } else if (volumeRatio > 1.2) {
      type = 'growth';
    } else if (volumeRatio < 0.8) {
      type = 'shrinkage';
    } else {
      type = 'deformation';
    }
    
    return {
      type,
      vector: displacement,
      magnitude
    };
  }
  
  /**
   * Oblicza czas podwojenia objętości guza
   * Ważny parametr w onkologii
   */
  private calculateDoublingTime(
    initialVolume: number,
    finalVolume: number,
    daysBetween: number
  ): number | null {
    if (finalVolume <= initialVolume) return null;
    
    // Wzór: DT = (t * log(2)) / log(Vf/Vi)
    const doublingTime = (daysBetween * Math.log(2)) / 
                        Math.log(finalVolume / initialVolume);
    
    return doublingTime;
  }
  
  /**
   * Wykrywa nowe znaleziska
   */
  private detectNewFindings(
    baseline: RadiologyAnimation,
    followup: RadiologyAnimation
  ): FindingComparison[] {
    const newFindings: FindingComparison[] = [];
    
    // Tu byłaby implementacja algorytmów detekcji
    // np. detekcja nowych guzków płucnych używając AI
    
    return newFindings;
  }
  
  /**
   * Wykonuje analizę globalną
   */
  private performGlobalAnalysis(
    baseline: RadiologyAnimation,
    followup: RadiologyAnimation
  ): GlobalAnalysis {
    // Analiza ogólnych zmian w obrazie
    // np. zmiany w pneumatyzacji płuc, powiększenie węzłów chłonnych
    
    return {
      overallAssessment: 'stable', // lub 'progression', 'regression', 'mixed'
      keyFindings: [],
      recommendations: []
    };
  }
  
  /**
   * Generuje animację pokazującą progresję
   */
  private generateProgressionAnimation(
    baseline: RadiologyAnimation,
    followup: RadiologyAnimation,
    findings: FindingComparison[],
    duration: number
  ): RadiologyAnimation {
    // Klonujemy badanie bazowe
    const progressionAnimation = JSON.parse(JSON.stringify(baseline));
    progressionAnimation.metadata.animationType = 'disease-progression';
    progressionAnimation.metadata.duration = duration;
    
    // Dla każdego znaleziska generujemy animację zmiany
    findings.forEach(finding => {
      if (finding.changeType === 'stable') return;
      
      // Znajdujemy odpowiednie segmentacje
      const baselineSegmentation = baseline.segmentations?.find(
        s => s.segmentationId === finding.previousMeasurement?.associatedSegmentation
      );
      
      const followupSegmentation = followup.segmentations?.find(
        s => s.segmentationId === finding.currentMeasurement?.associatedSegmentation
      );
      
      if (baselineSegmentation && followupSegmentation) {
        // Generujemy klatki animacji
        const steps = 30;
        
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          const timestamp = (duration * step) / steps;
          
          const segmentationChange: SegmentationChange = {
            type: 'segmentation-change',
            segmentationId: baselineSegmentation.segmentationId,
            volumeChange: (finding.currentMeasurement!.value - 
                          finding.previousMeasurement!.value) * t,
            morphologyChange: {
              type: finding.changeType === 'progressing' ? 'growth' : 'shrinkage',
              magnitude: Math.abs(finding.changePercentage || 0) * t / 100
            }
          };
          
          progressionAnimation.timeline.push({
            timestamp,
            changes: [{
              objectId: `segmentation_${baselineSegmentation.segmentationId}`,
              transformation: segmentationChange
            }]
          });
        }
      }
    });
    
    return progressionAnimation;
  }
  
  /**
   * Generuje podsumowanie analizy
   */
  private generateSummary(
    findings: FindingComparison[],
    volumeChanges: VolumeChangeAnalysis[]
  ): ProgressionSummary {
    const summary: ProgressionSummary = {
      totalFindings: findings.length,
      newFindings: findings.filter(f => f.changeType === 'new').length,
      progressingFindings: findings.filter(f => f.changeType === 'progressing').length,
      regressingFindings: findings.filter(f => f.changeType === 'regressing').length,
      stableFindings: findings.filter(f => f.changeType === 'stable').length,
      resolvedFindings: findings.filter(f => f.changeType === 'resolved').length,
      
      // Najważniejsze znaleziska
      criticalFindings: findings.filter(f => 
        f.clinicalSignificance === 'malignant' || 
        f.clinicalSignificance === 'suspicious'
      ),
      
      // Statystyki objętości
      averageVolumeChange: volumeChanges.length > 0
        ? volumeChanges.reduce((sum, vc) => sum + vc.percentageChange, 0) / volumeChanges.length
        : 0,
      
      // Rekomendacje
      recommendations: this.generateRecommendations(findings, volumeChanges)
    };
    
    return summary;
  }
  
  /**
   * Generuje rekomendacje kliniczne
   */
  private generateRecommendations(
    findings: FindingComparison[],
    volumeChanges: VolumeChangeAnalysis[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Sprawdzamy krytyczne znaleziska
    const criticalFindings = findings.filter(f => 
      f.clinicalSignificance === 'malignant' ||
      (f.changeType === 'progressing' && f.changePercentage && f.changePercentage > 20)
    );
    
    if (criticalFindings.length > 0) {
      recommendations.push('Zalecana pilna konsultacja onkologiczna');
      recommendations.push('Rozważyć wykonanie PET-CT dla oceny rozsiewu');
    }
    
    // Sprawdzamy tempo wzrostu
    const rapidGrowth = volumeChanges.filter(vc => 
      vc.doublingTime && vc.doublingTime < 100 // dni
    );
    
    if (rapidGrowth.length > 0) {
      recommendations.push('Szybkie tempo wzrostu - zalecana biopsja');
    }
    
    // Nowe znaleziska
    const newSuspiciousFindings = findings.filter(f => 
      f.changeType === 'new' && 
      (f.clinicalSignificance === 'suspicious' || f.clinicalSignificance === 'malignant')
    );
    
    if (newSuspiciousFindings.length > 0) {
      recommendations.push('Nowe podejrzane zmiany - wymagają dalszej diagnostyki');
    }
    
    // Standardowe zalecenia follow-up
    if (recommendations.length === 0) {
      if (findings.some(f => f.changeType === 'stable')) {
        recommendations.push('Zalecana kontrola za 3-6 miesięcy');
      } else {
        recommendations.push('Brak istotnych zmian - kontynuować obserwację');
      }
    }
    
    return recommendations;
  }
}

/**
 * Opcje analizy progresji
 */
export interface ProgressionAnalysisOptions {
  animationDuration?: number;
  includeMinorChanges?: boolean;
  aiAssisted?: boolean;
  generateReport?: boolean;
}

/**
 * Wynik analizy progresji
 */
export interface ProgressionAnalysisResult {
  findings: FindingComparison[];
  volumeChanges: VolumeChangeAnalysis[];
  newFindings: FindingComparison[];
  globalAnalysis: GlobalAnalysis;
  progressionAnimation: RadiologyAnimation;
  summary: ProgressionSummary;
}

/**
 * Analiza zmiany objętości
 */
export interface VolumeChangeAnalysis {
  segmentationId: string;
  structureName: string;
  baselineVolume: number;
  followupVolume: number;
  absoluteChange: number;
  percentageChange: number;
  morphologyChange: MorphologyChange;
  doublingTime: number | null;
  growthRate: number;
}

/**
 * Analiza globalna
 */
export interface GlobalAnalysis {
  overallAssessment: 'stable' | 'progression' | 'regression' | 'mixed';
  keyFindings: string[];
  recommendations: string[];
}

/**
 * Podsumowanie progresji
 */
export interface ProgressionSummary {
  totalFindings: number;
  newFindings: number;
  progressingFindings: number;
  regressingFindings: number;
  stableFindings: number;
  resolvedFindings: number;
  criticalFindings: FindingComparison[];
  averageVolumeChange: number;
  recommendations: string[];
}

/**
 * Funkcja pomocnicza do szybkiej analizy
 */
export function analyzeProgression(
  baseline: RadiologyAnimation,
  followup: RadiologyAnimation,
  options?: ProgressionAnalysisOptions
): ProgressionAnalysisResult {
  const analyzer = new DiseaseProgressionAnalyzer();
  return analyzer.analyzeProgression(baseline, followup, options);
}

/**
 * Definicje typów dla chirurgii robotycznej w VectorDiff
 * 
 * Ten moduł definiuje struktury danych dla:
 * - Pozycji i ruchów narzędzi chirurgicznych
 * - Danych haptycznych (dotykowych)
 * - Telemetrii systemu da Vinci
 * - Predykcji ruchów
 * 
 * Kluczowe wyzwanie: dane muszą być kompaktowe dla transmisji
 * w czasie rzeczywistym (cel: <10ms opóźnienia)
 */

import { VectorDiffAnimation, VectorObject, Transformation } from '@vectordiff/core';

/**
 * Rozszerzona animacja chirurgiczna
 * Zawiera dane specyficzne dla operacji robotycznych
 */
export interface SurgicalAnimation extends VectorDiffAnimation {
  // Dane operacji
  surgicalData: {
    procedureType: ProcedureType;
    surgeonId: string;
    patientId: string; // Zanonimizowane
    operatingRoomId: string;
    startTime: string;
    estimatedDuration: number; // minuty
    
    // Konfiguracja systemu da Vinci
    daVinciConfiguration: DaVinciConfiguration;
    
    // Parametry transmisji
    streamingParameters: StreamingParameters;
  };
  
  // Stan narzędzi w czasie rzeczywistym
  instrumentStates?: InstrumentState[];
  
  // Dane haptyczne
  hapticFeedback?: HapticData[];
  
  // Krytyczne punkty anatomiczne
  criticalStructures?: CriticalStructure[];
  
  // Metryki jakości
  qualityMetrics?: SurgicalQualityMetrics;
}

/**
 * Typy procedur chirurgicznych
 */
export type ProcedureType = 
  | 'prostatectomy'          // Usunięcie prostaty
  | 'nephrectomy'            // Usunięcie nerki
  | 'cardiac-surgery'        // Chirurgia serca
  | 'gynecologic'            // Ginekologia
  | 'general-surgery'        // Chirurgia ogólna
  | 'thoracic'              // Klatka piersiowa
  | 'pediatric';            // Pediatryczna

/**
 * Konfiguracja systemu da Vinci
 */
export interface DaVinciConfiguration {
  modelVersion: 'Si' | 'X' | 'Xi' | 'SP';  // Wersje systemu
  numberOfArms: number;                     // Zazwyczaj 3-4
  instruments: DaVinciInstrument[];
  cameraConfiguration: {
    stereoscopic: boolean;
    resolution: [number, number];
    fieldOfView: number;  // stopnie
    zoomLevel: number;    // 1-10
  };
}

/**
 * Narzędzie chirurgiczne da Vinci
 */
export interface DaVinciInstrument {
  instrumentId: string;
  type: InstrumentType;
  armNumber: number;  // 1-4
  articulation: {
    wrist: boolean;      // Czy ma przegub nadgarstka
    jaw: boolean;        // Czy ma szczęki
    degreesOfFreedom: number;  // Stopnie swobody (zazwyczaj 7)
  };
  calibrationData?: CalibrationData;
}

export type InstrumentType = 
  | 'needle-driver'      // Igłotrzymacz
  | 'grasper'           // Chwytacz
  | 'scissors'          // Nożyczki
  | 'monopolar-cautery' // Koagulator monopolarny
  | 'bipolar-forceps'   // Pęseta bipolarna
  | 'clip-applier'      // Aplikator klipsów
  | 'camera';           // Kamera

/**
 * Stan narzędzia w czasie rzeczywistym
 * To jest najważniejsza struktura dla transmisji
 */
export interface InstrumentState {
  instrumentId: string;
  timestamp: number;  // Mikrosekund precision
  
  // Pozycja końcówki narzędzia (tip)
  tipPosition: [number, number, number];  // mm
  
  // Orientacja (kwaternion dla efektywności)
  orientation: [number, number, number, number];  // x, y, z, w
  
  // Stan szczęk/chwytaka
  jawAngle?: number;  // stopnie (0 = zamknięte)
  
  // Siła nacisku
  graspForce?: number;  // Newtony
  
  // Prędkości (dla predykcji)
  linearVelocity?: [number, number, number];   // mm/s
  angularVelocity?: [number, number, number];  // rad/s
  
  // Status bezpieczeństwa
  safetyStatus: SafetyStatus;
}

/**
 * Status bezpieczeństwa narzędzia
 */
export interface SafetyStatus {
  inWorkspace: boolean;      // Czy w dozwolonym obszarze
  collisionRisk: number;     // 0-1 (0 = bezpieczne)
  proximityAlerts: ProximityAlert[];
  forceLimit: boolean;       // Czy przekroczono limit siły
}

/**
 * Alert zbliżenia do krytycznej struktury
 */
export interface ProximityAlert {
  structureId: string;
  distance: number;  // mm
  severity: 'info' | 'warning' | 'critical';
}

/**
 * Dane haptyczne (dotykowe)
 * Przekazywane do konsoli chirurga
 */
export interface HapticData {
  timestamp: number;
  instrumentId: string;
  
  // Siły odczuwane przez narzędzie
  forces: {
    x: number;  // Newtony
    y: number;
    z: number;
  };
  
  // Momenty obrotowe
  torques?: {
    x: number;  // Newton-metry
    y: number;
    z: number;
  };
  
  // Typ tkanki (dla różnych odczuć)
  tissueType?: TissueType;
  
  // Wibracje (np. przy cięciu)
  vibration?: {
    frequency: number;  // Hz
    amplitude: number;  // 0-1
  };
}

export type TissueType = 
  | 'soft-tissue'    // Tkanka miękka
  | 'vessel'         // Naczynie krwionośne
  | 'organ'          // Narząd
  | 'tumor'          // Guz
  | 'bone'           // Kość
  | 'cartilage'      // Chrząstka
  | 'suture';        // Szew

/**
 * Krytyczna struktura anatomiczna
 * Obszary wymagające szczególnej ostrożności
 */
export interface CriticalStructure {
  structureId: string;
  name: string;
  type: 'nerve' | 'vessel' | 'organ' | 'ureter' | 'custom';
  
  // Geometria struktury (uproszczona)
  boundingBox?: BoundingBox3D;
  
  // Strefa bezpieczeństwa
  safetyMargin: number;  // mm
  
  // Konsekwencje uszkodzenia
  damageConsequence: 'minor' | 'moderate' | 'severe' | 'life-threatening';
}

/**
 * Parametry transmisji strumieniowej
 */
export interface StreamingParameters {
  protocol: 'websocket' | 'webrtc' | 'custom';
  targetLatency: number;        // ms
  maxLatency: number;          // ms (próg alarmowy)
  compressionLevel: number;    // 0-9
  priorityMode: 'latency' | 'quality' | 'balanced';
  
  // Adaptive bitrate
  adaptiveBitrate: {
    enabled: boolean;
    minBitrate: number;  // kbps
    maxBitrate: number;  // kbps
  };
  
  // Predykcja ruchu
  motionPrediction: {
    enabled: boolean;
    algorithm: 'kalman' | 'neural' | 'polynomial';
    lookAheadTime: number;  // ms
  };
}

/**
 * Transformacja specyficzna dla narzędzi chirurgicznych
 */
export interface SurgicalInstrumentTransform extends Transformation {
  type: 'surgical-instrument';
  instrumentId: string;
  
  // Zmiana pozycji i orientacji
  deltaPosition: [number, number, number];
  deltaOrientation: [number, number, number, number];  // Kwaternion
  
  // Zmiana stanu szczęk
  deltaJawAngle?: number;
  
  // Predykowana pozycja (dla kompensacji opóźnień)
  predictedPosition?: [number, number, number];
  predictedOrientation?: [number, number, number, number];
  
  // Znacznik czasu dla synchronizacji
  serverTimestamp: number;
  clientTimestamp?: number;
}

/**
 * Dane kalibracyjne narzędzia
 */
export interface CalibrationData {
  toolCenterPoint: [number, number, number];  // Offset od osi
  kinematicParameters: number[];               // Parametry DH
  lastCalibrationDate: string;
  calibrationAccuracy: number;  // mm
}

/**
 * Metryki jakości operacji
 * Używane do oceny i szkolenia
 */
export interface SurgicalQualityMetrics {
  // Ekonomia ruchu
  pathLength: number;           // Całkowita droga narzędzi (m)
  numberOfMovements: number;    // Liczba ruchów
  smoothness: number;          // 0-1 (1 = bardzo płynne)
  
  // Czas
  totalOperationTime: number;   // minuty
  idleTime: number;            // minuty bez ruchu
  
  // Precyzja
  averageError: number;        // mm od optymalnej ścieżki
  tremor: number;             // Amplituda drżenia (mm)
  
  // Bezpieczeństwo
  criticalIncidents: number;   // Liczba alarmów
  tissueHandling: number;     // 0-1 (1 = bardzo delikatne)
  
  // Ergonomia
  ergonomicScore: number;     // 0-100
  fatigueIndex: number;       // 0-1 (1 = bardzo zmęczony)
}

/**
 * Bounding box 3D (z poprzednich modułów)
 */
export interface BoundingBox3D {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Funkcje pomocnicze dla obliczeń chirurgicznych
 */

/**
 * Oblicza odległość między końcówką narzędzia a strukturą
 * @param tipPosition Pozycja końcówki
 * @param structure Struktura krytyczna
 * @returns Odległość w mm
 */
export function calculateDistanceToStructure(
  tipPosition: [number, number, number],
  structure: CriticalStructure
): number {
  if (!structure.boundingBox) return Infinity;
  
  // Znajdź najbliższy punkt na bounding box
  const closestPoint: [number, number, number] = [
    Math.max(structure.boundingBox.min[0], 
             Math.min(tipPosition[0], structure.boundingBox.max[0])),
    Math.max(structure.boundingBox.min[1], 
             Math.min(tipPosition[1], structure.boundingBox.max[1])),
    Math.max(structure.boundingBox.min[2], 
             Math.min(tipPosition[2], structure.boundingBox.max[2]))
  ];
  
  // Oblicz odległość euklidesową
  const dx = tipPosition[0] - closestPoint[0];
  const dy = tipPosition[1] - closestPoint[1];
  const dz = tipPosition[2] - closestPoint[2];
  
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Konwertuje kwaternion na kąty Eulera
 * Przydatne dla intuicyjnej prezentacji orientacji
 * @param quaternion [x, y, z, w]
 * @returns [roll, pitch, yaw] w radianach
 */
export function quaternionToEuler(
  quaternion: [number, number, number, number]
): [number, number, number] {
  const [x, y, z, w] = quaternion;
  
  // Roll (obrót wokół X)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);
  
  // Pitch (obrót wokół Y)
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 
    ? Math.sign(sinp) * Math.PI / 2 
    : Math.asin(sinp);
  
  // Yaw (obrót wokół Z)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);
  
  return [roll, pitch, yaw];
}

/**
 * Oblicza siłę haptyczną na podstawie penetracji
 * Model sprężystości tkanki
 * @param penetration Głębokość penetracji (mm)
 * @param tissueType Typ tkanki
 * @returns Siła w Newtonach
 */
export function calculateHapticForce(
  penetration: number,
  tissueType: TissueType
): number {
  // Stałe sprężystości dla różnych tkanek (N/mm)
  const stiffness: { [key in TissueType]: number } = {
    'soft-tissue': 0.5,
    'vessel': 0.3,
    'organ': 0.7,
    'tumor': 1.2,
    'bone': 5.0,
    'cartilage': 2.0,
    'suture': 0.2
  };
  
  const k = stiffness[tissueType];
  
  // Model nieliniowy - tkanka staje się sztywniejsza przy większej deformacji
  const force = k * penetration * (1 + 0.1 * penetration);
  
  // Ograniczenie maksymalnej siły dla bezpieczeństwa
  return Math.min(force, 10); // Max 10N
}

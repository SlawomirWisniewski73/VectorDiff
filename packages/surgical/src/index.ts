/**
 * Główny punkt wejścia dla pakietu chirurgicznego VectorDiff
 * 
 * Ten moduł eksportuje wszystkie komponenty dla:
 * - Zdalnej chirurgii robotycznej
 * - Transmisji w czasie rzeczywistym
 * - Integracji z systemem da Vinci
 * - Predykcji ruchu i kompensacji opóźnień
 * - Haptycznego sprzężenia zwrotnego
 */

// Eksport typów
export * from './types/surgical-format';

// Eksport transmisji
export {
  RealTimeStreamingManager
} from './streaming/RealTimeStreaming';

// Eksport integracji da Vinci
export {
  DaVinciIntegration
} from './davinci/DaVinciIntegration';

// Eksport predykcji
export {
  MotionPredictor
} from './prediction/MotionPrediction';

// Eksport rendererów
export {
  SurgicalRenderer,
  SurgicalRendererOptions
} from './renderers/SurgicalRenderer';

// Re-eksport podstawowych typów z core
export type { VectorDiffAnimation } from '@vectordiff/core';

// Wersja pakietu
export const VERSION = '0.1.0';

/**
 * Funkcja pomocnicza do szybkiego uruchomienia systemu chirurgicznego
 */
export async function initializeSurgicalSystem(config: {
  serverUrl: string;
  authToken: string;
  daVinciPort: string;
  stereoscopic?: boolean;
}): Promise<{
  streaming: RealTimeStreamingManager;
  davinci: DaVinciIntegration;
  predictor: MotionPredictor;
  renderer: SurgicalRenderer;
}> {
  console.log('Inicjalizacja systemu chirurgicznego VectorDiff...');
  
  // Inicjalizacja streamingu
  const streaming = new RealTimeStreamingManager({
    protocol: 'webrtc',
    targetLatency: 5,
    maxLatency: 20,
    compressionLevel: 0, // Bez kompresji dla minimalnego opóźnienia
    priorityMode: 'latency',
    adaptiveBitrate: {
      enabled: true,
      minBitrate: 10000,
      maxBitrate: 50000
    },
    motionPrediction: {
      enabled: true,
      algorithm: 'kalman',
      lookAheadTime: 50
    }
  });
  
  // Połączenie z serwerem
  await streaming.connect(config.serverUrl, config.authToken);
  
  // Inicjalizacja da Vinci
  const davinci = new DaVinciIntegration({
    modelVersion: 'Xi',
    numberOfArms: 4,
    instruments: [],
    cameraConfiguration: {
      stereoscopic: true,
      resolution: [1920, 1080],
      fieldOfView: 70,
      zoomLevel: 1
    }
  });
  
  // Połączenie z robotem
  await davinci.connect(config.daVinciPort);
  
  // Inicjalizacja predyktora
  const predictor = new MotionPredictor('kalman', 50);
  
  // Inicjalizacja renderera
  const renderer = new SurgicalRenderer({
    container: document.getElementById('surgical-view')!,
    width: 1920,
    height: 1080,
    stereoscopic: config.stereoscopic,
    showSafetyZones: true,
    showForceVectors: true,
    tissueDeformation: true
  });
  
  // Połączenie komponentów
  setupSystemIntegration(streaming, davinci, predictor, renderer);
  
  console.log('System chirurgiczny gotowy do pracy');
  
  return {
    streaming,
    davinci,
    predictor,
    renderer
  };
}

/**
 * Łączy komponenty systemu
 */
function setupSystemIntegration(
  streaming: RealTimeStreamingManager,
  davinci: DaVinciIntegration,
  predictor: MotionPredictor,
  renderer: SurgicalRenderer
): void {
  // Da Vinci -> Streaming
  davinci.onStateUpdate = (state) => {
    // Predykcja przed wysłaniem
    const predicted = predictor.predict(state);
    streaming.sendSurgeonCommand({
      commandId: Date.now(),
      instrumentId: predicted.instrumentId,
      targetPosition: predicted.tipPosition,
      targetOrientation: predicted.orientation,
      targetJawAngle: predicted.jawAngle,
      timestamp: predicted.timestamp
    });
  };
  
  // Streaming -> Renderer
  streaming.setOnInstrumentUpdate((state) => {
    renderer.updateInstrumentState(state);
  });
  
  // Streaming -> Da Vinci (haptic feedback)
  streaming.setOnHapticFeedback((data) => {
    // Przekaż feedback do da Vinci
    // (implementacja zależy od API da Vinci)
  });
  
  // Obsługa alarmów
  streaming.setOnLatencyWarning((latency) => {
    console.warn(`Wysokie opóźnienie: ${latency}ms`);
    // Tu można dodać wizualny alarm w UI
  });
  
  // Emergency stop
  davinci.onEmergencyStop = () => {
    console.error('Awaryjne zatrzymanie!');
    streaming.emergencyStop();
    // Dodatkowe akcje bezpieczeństwa
  };
}

/**
 * Domyślny eksport - najczęściej używane elementy
 */
export default {
  RealTimeStreamingManager,
  DaVinciIntegration,
  MotionPredictor,
  SurgicalRenderer,
  initializeSurgicalSystem,
  VERSION
}

/**
 * Przykład użycia:
 * 
 * ```typescript
 * import { initializeSurgicalSystem } from '@vectordiff/surgical';
 * 
 * const system = await initializeSurgicalSystem({
 *   serverUrl: 'wss://surgical-server.hospital.com',
 *   authToken: 'surgeon-auth-token',
 *   daVinciPort: '/dev/ttyUSB0',
 *   stereoscopic: true
 * });
 * 
 * // System jest gotowy do przeprowadzenia operacji
 * ```
 */

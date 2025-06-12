/**
 * System transmisji danych chirurgicznych w czasie rzeczywistym
 * 
 * Ten moduł jest sercem systemu telepresence. Musi zapewnić:
 * - Ultra-niskie opóźnienia (<10ms dla bezpieczeństwa)
 * - Niezawodność (zero utraty krytycznych danych)
 * - Adaptację do warunków sieci
 * - Synchronizację wielu strumieni (wideo, haptyka, telemetria)
 * 
 * Używamy WebRTC dla najniższych opóźnień i WebSocket jako zapasowy
 */

import { io, Socket } from 'socket.io-client';
import { 
  SurgicalAnimation, 
  InstrumentState, 
  HapticData,
  StreamingParameters,
  SurgicalInstrumentTransform 
} from '../types/surgical-format';

/**
 * Główna klasa zarządzająca transmisją
 */
export class RealTimeStreamingManager {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  
  // Bufory dla różnych typów danych
  private instrumentStateBuffer: RingBuffer<InstrumentState>;
  private hapticDataBuffer: RingBuffer<HapticData>;
  
  // Metryki wydajności
  private latencyMonitor: LatencyMonitor;
  private packetLossMonitor: PacketLossMonitor;
  
  // Parametry strumienia
  private streamingParams: StreamingParameters;
  
  // Callbacki
  private onInstrumentUpdate?: (state: InstrumentState) => void;
  private onHapticFeedback?: (data: HapticData) => void;
  private onLatencyWarning?: (latency: number) => void;
  
  constructor(params: StreamingParameters) {
    this.streamingParams = params;
    
    // Inicjalizacja buforów (rozmiar zależny od oczekiwanego opóźnienia)
    const bufferSize = Math.ceil(params.maxLatency / 10); // 10ms per frame
    this.instrumentStateBuffer = new RingBuffer<InstrumentState>(bufferSize);
    this.hapticDataBuffer = new RingBuffer<HapticData>(bufferSize);
    
    // Monitory wydajności
    this.latencyMonitor = new LatencyMonitor(params.targetLatency);
    this.packetLossMonitor = new PacketLossMonitor();
  }
  
  /**
   * Łączy się z serwerem chirurgicznym
   * @param serverUrl URL serwera
   * @param authToken Token autoryzacji
   */
  public async connect(serverUrl: string, authToken: string): Promise<void> {
    console.log('Łączenie z serwerem chirurgicznym...', serverUrl);
    
    try {
      // Wybór protokołu na podstawie konfiguracji
      if (this.streamingParams.protocol === 'webrtc') {
        await this.connectWebRTC(serverUrl, authToken);
      } else if (this.streamingParams.protocol === 'websocket') {
        await this.connectWebSocket(serverUrl, authToken);
      } else {
        throw new Error(`Nieobsługiwany protokół: ${this.streamingParams.protocol}`);
      }
      
      // Rozpocznij monitorowanie
      this.startPerformanceMonitoring();
      
    } catch (error) {
      console.error('Błąd połączenia:', error);
      throw error;
    }
  }
  
  /**
   * Połączenie WebRTC dla najniższych opóźnień
   */
  private async connectWebRTC(serverUrl: string, authToken: string): Promise<void> {
    // Najpierw łączymy się przez WebSocket dla sygnalizacji
    this.socket = io(serverUrl, {
      auth: { token: authToken },
      transports: ['websocket']
    });
    
    // Czekamy na połączenie
    await new Promise<void>((resolve, reject) => {
      this.socket!.once('connect', resolve);
      this.socket!.once('connect_error', reject);
    });
    
    // Konfiguracja WebRTC
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Dodaj TURN serwery dla niezawodności
        {
          urls: 'turn:turn.example.com:3478',
          username: 'surgical',
          credential: authToken
        }
      ],
      // Optymalizacje dla niskich opóźnień
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };
    
    this.peerConnection = new RTCPeerConnection(configuration);
    
    // Tworzenie kanału danych dla telemetrii
    this.dataChannel = this.peerConnection.createDataChannel('surgical-data', {
      ordered: false,  // Nie czekamy na retransmisje
      maxRetransmits: 0,  // Bez retransmisji dla najniższego opóźnienia
      protocol: 'surgical-protocol'
    });
    
    // Konfiguracja kanału
    this.dataChannel.binaryType = 'arraybuffer';
    this.dataChannel.onopen = () => {
      console.log('Kanał danych WebRTC otwarty');
      this.optimizeDataChannel();
    };
    
    this.dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data);
    };
    
    // Negocjacja połączenia
    await this.negotiateWebRTCConnection();
  }
  
  /**
   * Optymalizuje kanał danych dla minimalnych opóźnień
   */
  private optimizeDataChannel(): void {
    if (!this.dataChannel) return;
    
    // Sprawdzamy wsparcie dla niestandardowych opcji
    const dc = this.dataChannel as any;
    
    // Próbujemy ustawić priorytet
    if ('priority' in dc) {
      dc.priority = 'high';
    }
    
    // Bufor wysyłania - mały dla niskich opóźnień
    if ('bufferedAmountLowThreshold' in dc) {
      dc.bufferedAmountLowThreshold = 1024; // 1KB
    }
  }
  
  /**
   * Negocjacja połączenia WebRTC
   */
  private async negotiateWebRTCConnection(): Promise<void> {
    if (!this.peerConnection || !this.socket) return;
    
    // Obsługa ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket!.emit('ice-candidate', event.candidate);
      }
    };
    
    // Odbieranie ICE candidates
    this.socket.on('ice-candidate', (candidate: RTCIceCandidate) => {
      this.peerConnection!.addIceCandidate(candidate);
    });
    
    // Tworzenie oferty
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    // Wysyłanie oferty
    this.socket.emit('webrtc-offer', offer);
    
    // Odbieranie odpowiedzi
    this.socket.once('webrtc-answer', async (answer: RTCSessionDescriptionInit) => {
      await this.peerConnection!.setRemoteDescription(answer);
    });
  }
  
  /**
   * Połączenie WebSocket jako fallback
   */
  private async connectWebSocket(serverUrl: string, authToken: string): Promise<void> {
    this.socket = io(serverUrl, {
      auth: { token: authToken },
      transports: ['websocket'],
      // Optymalizacje
      upgrade: false,  // Nie próbuj upgradować do polling
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 100,  // Szybka rekoneksja
    });
    
    // Czekamy na połączenie
    await new Promise<void>((resolve, reject) => {
      this.socket!.once('connect', () => {
        console.log('Połączono przez WebSocket');
        resolve();
      });
      this.socket!.once('connect_error', reject);
    });
    
    // Nasłuchiwanie na dane
    this.setupWebSocketListeners();
  }
  
  /**
   * Konfiguracja nasłuchiwania WebSocket
   */
  private setupWebSocketListeners(): void {
    if (!this.socket) return;
    
    // Dane o pozycji narzędzi
    this.socket.on('instrument-state', (data: InstrumentState) => {
      this.handleInstrumentState(data);
    });
    
    // Dane haptyczne
    this.socket.on('haptic-feedback', (data: HapticData) => {
      this.handleHapticFeedback(data);
    });
    
    // Alarmy bezpieczeństwa
    this.socket.on('safety-alert', (alert: any) => {
      this.handleSafetyAlert(alert);
    });
    
    // Synchronizacja czasu
    this.socket.on('time-sync', (serverTime: number) => {
      this.syncTime(serverTime);
    });
  }
  
  /**
   * Obsługa wiadomości z kanału danych WebRTC
   */
  private handleDataChannelMessage(data: ArrayBuffer): void {
    // Dekodujemy binarny format dla efektywności
    const view = new DataView(data);
    const messageType = view.getUint8(0);
    
    switch (messageType) {
      case MessageType.INSTRUMENT_STATE:
        this.handleBinaryInstrumentState(view, 1);
        break;
      case MessageType.HAPTIC_FEEDBACK:
        this.handleBinaryHapticFeedback(view, 1);
        break;
      case MessageType.BATCH_UPDATE:
        this.handleBatchUpdate(view, 1);
        break;
      default:
        console.warn('Nieznany typ wiadomości:', messageType);
    }
  }
  
  /**
   * Obsługa binarnego stanu narzędzia (format kompaktowy)
   */
  private handleBinaryInstrumentState(view: DataView, offset: number): void {
    // Struktura binarna dla minimalnego rozmiaru:
    // [1B type][8B timestamp][4B instrumentId][12B position][16B quaternion][4B jawAngle][4B force]
    
    const state: InstrumentState = {
      instrumentId: this.readInstrumentId(view, offset + 8),
      timestamp: Number(view.getBigUint64(offset, true)), // Little-endian
      tipPosition: [
        view.getFloat32(offset + 12, true),
        view.getFloat32(offset + 16, true),
        view.getFloat32(offset + 20, true)
      ],
      orientation: [
        view.getFloat32(offset + 24, true),
        view.getFloat32(offset + 28, true),
        view.getFloat32(offset + 32, true),
        view.getFloat32(offset + 36, true)
      ],
      jawAngle: view.getFloat32(offset + 40, true),
      graspForce: view.getFloat32(offset + 44, true),
      safetyStatus: this.readSafetyStatus(view, offset + 48)
    };
    
    this.handleInstrumentState(state);
  }
  
  /**
   * Czyta ID narzędzia z formatu binarnego
   */
  private readInstrumentId(view: DataView, offset: number): string {
    // 4 bajty na ID (np. "IN01")
    const bytes = new Uint8Array(view.buffer, offset, 4);
    return String.fromCharCode(...bytes);
  }
  
  /**
   * Czyta status bezpieczeństwa
   */
  private readSafetyStatus(view: DataView, offset: number): SafetyStatus {
    const flags = view.getUint8(offset);
    return {
      inWorkspace: !!(flags & 0x01),
      collisionRisk: view.getUint8(offset + 1) / 255, // Normalizowane 0-1
      proximityAlerts: [], // Uproszczone dla szybkości
      forceLimit: !!(flags & 0x02)
    };
  }
  
  /**
   * Obsługa stanu narzędzia
   */
  private handleInstrumentState(state: InstrumentState): void {
    // Zapisz do bufora
    this.instrumentStateBuffer.push(state);
    
    // Oblicz opóźnienie
    const latency = Date.now() - Number(state.timestamp);
    this.latencyMonitor.recordLatency(latency);
    
    // Sprawdź czy opóźnienie jest akceptowalne
    if (latency > this.streamingParams.maxLatency) {
      this.onLatencyWarning?.(latency);
      
      // W trybie krytycznym, używamy predykcji
      if (this.streamingParams.motionPrediction.enabled) {
        state = this.predictFutureState(state, latency);
      }
    }
    
    // Callback do aplikacji
    this.onInstrumentUpdate?.(state);
  }
  
  /**
   * Predykcja przyszłego stanu dla kompensacji opóźnień
   * To jest kluczowe dla bezpieczeństwa!
   */
  private predictFutureState(
    currentState: InstrumentState, 
    latency: number
  ): InstrumentState {
    // Pobierz historię dla tego narzędzia
    const history = this.instrumentStateBuffer
      .toArray()
      .filter(s => s.instrumentId === currentState.instrumentId)
      .slice(-10); // Ostatnie 10 próbek
    
    if (history.length < 3) {
      return currentState; // Za mało danych
    }
    
    // Oblicz prędkości z historii
    const velocities = this.calculateVelocities(history);
    
    // Czas predykcji
    const predictionTime = latency + this.streamingParams.motionPrediction.lookAheadTime;
    
    // Predykcja pozycji (model liniowy)
    const predictedPosition: [number, number, number] = [
      currentState.tipPosition[0] + velocities.linear[0] * predictionTime / 1000,
      currentState.tipPosition[1] + velocities.linear[1] * predictionTime / 1000,
      currentState.tipPosition[2] + velocities.linear[2] * predictionTime / 1000
    ];
    
    // Predykcja orientacji (zakładamy stałą prędkość kątową)
    // Tu użylibyśmy bardziej zaawansowanej metody w praktyce
    const predictedOrientation = this.predictOrientation(
      currentState.orientation,
      velocities.angular,
      predictionTime
    );
    
    return {
      ...currentState,
      tipPosition: predictedPosition,
      orientation: predictedOrientation,
      // Oznacz jako predykowane
      predictedPosition,
      predictedOrientation
    } as InstrumentState;
  }
  
  /**
   * Oblicza prędkości z historii
   */
  private calculateVelocities(history: InstrumentState[]): {
    linear: [number, number, number],
    angular: [number, number, number]
  } {
    if (history.length < 2) {
      return { linear: [0, 0, 0], angular: [0, 0, 0] };
    }
    
    // Używamy ostatnich dwóch próbek dla prostoty
    const prev = history[history.length - 2];
    const curr = history[history.length - 1];
    const dt = (Number(curr.timestamp) - Number(prev.timestamp)) / 1000; // sekundy
    
    if (dt === 0) {
      return { linear: [0, 0, 0], angular: [0, 0, 0] };
    }
    
    // Prędkość liniowa
    const linear: [number, number, number] = [
      (curr.tipPosition[0] - prev.tipPosition[0]) / dt,
      (curr.tipPosition[1] - prev.tipPosition[1]) / dt,
      (curr.tipPosition[2] - prev.tipPosition[2]) / dt
    ];
    
    // Prędkość kątowa (uproszczona)
    // W praktyce użylibyśmy różnicy kwaternionów
    const angular: [number, number, number] = [0, 0, 0];
    
    return { linear, angular };
  }
  
  /**
   * Predykcja orientacji
   */
  private predictOrientation(
    current: [number, number, number, number],
    angularVel: [number, number, number],
    time: number
  ): [number, number, number, number] {
    // Uproszczona implementacja
    // W praktyce użylibyśmy integracji kwaternionów
    return current;
  }
  
  /**
   * Obsługa danych haptycznych
   */
  private handleHapticFeedback(data: HapticData): void {
    // Zapisz do bufora
    this.hapticDataBuffer.push(data);
    
    // Callback natychmiastowy - haptyka musi być real-time
    this.onHapticFeedback?.(data);
  }
  
  /**
   * Obsługa alertów bezpieczeństwa
   */
  private handleSafetyAlert(alert: any): void {
    console.error('ALERT BEZPIECZEŃSTWA:', alert);
    
    // Natychmiastowe zatrzymanie jeśli krytyczne
    if (alert.severity === 'critical') {
      this.emergencyStop();
    }
  }
  
  /**
   * Awaryjne zatrzymanie wszystkich narzędzi
   */
  private emergencyStop(): void {
    console.error('AWARYJNE ZATRZYMANIE!');
    
    // Wysłanie komendy stop przez wszystkie kanały
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const stopCommand = new Uint8Array([MessageType.EMERGENCY_STOP]);
      this.dataChannel.send(stopCommand);
    }
    
    if (this.socket && this.socket.connected) {
      this.socket.emit('emergency-stop');
    }
    
    // Powiadom lokalną aplikację
    this.onInstrumentUpdate?.({
      instrumentId: 'ALL',
      timestamp: Date.now() * 1000,
      tipPosition: [0, 0, 0],
      orientation: [0, 0, 0, 1],
      safetyStatus: {
        inWorkspace: false,
        collisionRisk: 1,
        proximityAlerts: [],
        forceLimit: true
      }
    });
  }
  
  /**
   * Wysyła komendę ruchu chirurga
   * @param command Komenda ruchu
   */
  public sendSurgeonCommand(command: SurgeonCommand): void {
    const timestamp = Date.now() * 1000; // mikrosekundy
    
    // Dodaj timestamp
    const timedCommand = { ...command, timestamp };
    
    // Wybierz najszybszy dostępny kanał
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      // Koduj do formatu binarnego
      const binary = this.encodeSurgeonCommand(timedCommand);
      this.dataChannel.send(binary);
    } else if (this.socket && this.socket.connected) {
      // Fallback na WebSocket
      this.socket.emit('surgeon-command', timedCommand);
    } else {
      console.error('Brak połączenia do wysłania komendy!');
    }
    
    // Zapisz do monitora pakietów
    this.packetLossMonitor.recordSent(timedCommand.commandId);
  }
  
  /**
   * Koduje komendę chirurga do formatu binarnego
   */
  private encodeSurgeonCommand(command: SurgeonCommand): ArrayBuffer {
    // Format: [type][timestamp][commandId][instrumentId][position][orientation][jawAngle]
    const buffer = new ArrayBuffer(64);
    const view = new DataView(buffer);
    
    let offset = 0;
    
    // Typ wiadomości
    view.setUint8(offset, MessageType.SURGEON_COMMAND);
    offset += 1;
    
    // Timestamp
    view.setBigUint64(offset, BigInt(command.timestamp), true);
    offset += 8;
    
    // Command ID (4 bajty)
    view.setUint32(offset, command.commandId, true);
    offset += 4;
    
    // Instrument ID (4 bajty)
    for (let i = 0; i < 4; i++) {
      view.setUint8(offset + i, command.instrumentId.charCodeAt(i) || 0);
    }
    offset += 4;
    
    // Pozycja docelowa (3 x float32)
    command.targetPosition.forEach((val, i) => {
      view.setFloat32(offset + i * 4, val, true);
    });
    offset += 12;
    
    // Orientacja docelowa (4 x float32)
    command.targetOrientation.forEach((val, i) => {
      view.setFloat32(offset + i * 4, val, true);
    });
    offset += 16;
    
    // Kąt szczęk
    view.setFloat32(offset, command.targetJawAngle || 0, true);
    
    return buffer;
  }
  
  /**
   * Monitorowanie wydajności
   */
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      const metrics = {
        averageLatency: this.latencyMonitor.getAverageLatency(),
        maxLatency: this.latencyMonitor.getMaxLatency(),
        packetLoss: this.packetLossMonitor.getPacketLossRate(),
        bufferUtilization: this.instrumentStateBuffer.getUtilization()
      };
      
      // Adaptacja parametrów jeśli potrzeba
      this.adaptToNetworkConditions(metrics);
      
      // Raportowanie
      if (this.socket) {
        this.socket.emit('performance-metrics', metrics);
      }
    }, 1000); // Co sekundę
  }
  
  /**
   * Adaptacja do warunków sieci
   */
  private adaptToNetworkConditions(metrics: any): void {
    // Jeśli opóźnienie rośnie, zmniejsz jakość dla szybkości
    if (metrics.averageLatency > this.streamingParams.targetLatency * 1.5) {
      console.warn('Wysokie opóźnienie, redukuję jakość strumienia');
      
      if (this.streamingParams.adaptiveBitrate.enabled) {
        // Zmniejsz bitrate
        const newBitrate = Math.max(
          this.streamingParams.adaptiveBitrate.minBitrate,
          this.streamingParams.adaptiveBitrate.maxBitrate * 0.7
        );
        
        this.socket?.emit('adjust-bitrate', newBitrate);
      }
    }
    
    // Jeśli utrata pakietów, włącz FEC
    if (metrics.packetLoss > 0.01) { // >1% utraty
      console.warn('Wykryto utratę pakietów, włączam FEC');
      this.socket?.emit('enable-fec', true);
    }
  }
  
  /**
   * Synchronizacja czasu z serwerem
   */
  private syncTime(serverTime: number): void {
    const clientTime = Date.now();
    const offset = serverTime - clientTime;
    
    // Zapisz offset dla korekcji timestampów
    this.timeOffset = offset;
    
    console.log(`Synchronizacja czasu: offset = ${offset}ms`);
  }
  
  private timeOffset: number = 0;
  
  /**
   * Rozłącza wszystkie połączenia
   */
  public disconnect(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    
    if (this.socket) {
      this.socket.disconnect();
    }
    
    console.log('Rozłączono połączenia chirurgiczne');
  }
  
  // Settery dla callbacków
  public setOnInstrumentUpdate(callback: (state: InstrumentState) => void): void {
    this.onInstrumentUpdate = callback;
  }
  
  public setOnHapticFeedback(callback: (data: HapticData) => void): void {
    this.onHapticFeedback = callback;
  }
  
  public setOnLatencyWarning(callback: (latency: number) => void): void {
    this.onLatencyWarning = callback;
  }
}

/**
 * Typy wiadomości binarnych
 */
enum MessageType {
  INSTRUMENT_STATE = 0x01,
  HAPTIC_FEEDBACK = 0x02,
  SURGEON_COMMAND = 0x03,
  BATCH_UPDATE = 0x04,
  EMERGENCY_STOP = 0xFF
}

/**
 * Komenda chirurga
 */
interface SurgeonCommand {
  commandId: number;
  instrumentId: string;
  targetPosition: [number, number, number];
  targetOrientation: [number, number, number, number];
  targetJawAngle?: number;
  timestamp: number;
}

/**
 * Bufor cykliczny dla efektywnego przechowywania
 */
class RingBuffer<T> {
  private buffer: (T | null)[];
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  
  constructor(private capacity: number) {
    this.buffer = new Array(capacity).fill(null);
  }
  
  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    
    if (this.size < this.capacity) {
      this.size++;
    } else {
      // Nadpisujemy najstarszy element
      this.head = (this.head + 1) % this.capacity;
    }
  }
  
  toArray(): T[] {
    const result: T[] = [];
    let index = this.head;
    
    for (let i = 0; i < this.size; i++) {
      const item = this.buffer[index];
      if (item !== null) {
        result.push(item);
      }
      index = (index + 1) % this.capacity;
    }
    
    return result;
  }
  
  getUtilization(): number {
    return this.size / this.capacity;
  }
}

/**
 * Monitor opóźnień
 */
class LatencyMonitor {
  private latencies: number[] = [];
  private maxSize: number = 100;
  
  constructor(private targetLatency: number) {}
  
  recordLatency(latency: number): void {
    this.latencies.push(latency);
    
    if (this.latencies.length > this.maxSize) {
      this.latencies.shift();
    }
  }
  
  getAverageLatency(): number {
    if (this.latencies.length === 0) return 0;
    
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    return sum / this.latencies.length;
  }
  
  getMaxLatency(): number {
    if (this.latencies.length === 0) return 0;
    return Math.max(...this.latencies);
  }
  
  getPercentile(p: number): number {
    if (this.latencies.length === 0) return 0;
    
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.ceil(p * sorted.length) - 1;
    return sorted[index];
  }
}

/**
 * Monitor utraty pakietów
 */
class PacketLossMonitor {
  private sentPackets: Map<number, number> = new Map(); // ID -> timestamp
  private receivedPackets: Set<number> = new Set();
  private windowSize: number = 1000; // ms
  
  recordSent(packetId: number): void {
    this.sentPackets.set(packetId, Date.now());
    
    // Czyść stare pakiety
    this.cleanOldPackets();
  }
  
  recordReceived(packetId: number): void {
    this.receivedPackets.add(packetId);
  }
  
  getPacketLossRate(): number {
    this.cleanOldPackets();
    
    const sent = this.sentPackets.size;
    if (sent === 0) return 0;
    
    const received = Array.from(this.sentPackets.keys())
      .filter(id => this.receivedPackets.has(id))
      .length;
    
    return (sent - received) / sent;
  }
  
  private cleanOldPackets(): void {
    const now = Date.now();
    const cutoff = now - this.windowSize;
    
    for (const [id, timestamp] of this.sentPackets) {
      if (timestamp < cutoff) {
        this.sentPackets.delete(id);
        this.receivedPackets.delete(id);
      }
    }
  }
}

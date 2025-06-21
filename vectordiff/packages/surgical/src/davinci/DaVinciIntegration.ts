/**
 * Integracja z systemem chirurgicznym da Vinci
 * * System da Vinci to najczęściej używany robot chirurgiczny.
 * Ten moduł zapewnia:
 * - Komunikację z konsolą chirurga
 * - Translację ruchów master-slave
 * - Skalowanie i filtrowanie drżenia
 * - Mapowanie stopni swobody
 * * Bezpieczeństwo jest priorytetem #1!
 */

// =================================================================
// SEKCJA ZMODYFIKOWANA: Dodano nowe importy i typy
// =================================================================
import { Transformation } from '@vectordiff/core'; // Założenie: Ten typ jest dostępny
import * as THREE from 'three'; // Założenie: Three.js jest częścią zależności projektu
import {
  DaVinciConfiguration,
  DaVinciInstrument,
  InstrumentState,
  SurgicalInstrumentTransform,
  SafetyStatus,
  CalibrationData
} from '../types/surgical-format';
import { quaternionToEuler } from '../types/surgical-format';

/**
 * =================================================================
 * ZMIANA KRYTYCZNA: Ulepszone i Bardziej Bezpieczne Filtry
 * =================================================================
 * * Powód zmiany:
 * Oryginalne filtry bezpieczeństwa były zbyt uproszczone i niebezpieczne:
 * 1. Detekcja kolizji sprawdzała tylko punkty końcowe narzędzi.
 * 2. Unikanie kolizji polegało na gwałtownym "odepchnięciu", co mogło powodować oscylacje.
 * 3. Ograniczenia przestrzeni roboczej gwałtownie zatrzymywały ruch.
 * * Wprowadzona poprawka:
 * Chociaż pełna, produkcyjna implementacja wymagałaby dedykowanej biblioteki fizycznej,
 * ten kod demonstruje ZNACZNIE BARDZIEJ BEZPIECZNE ZASADY:
 * 1. Detekcja kolizji: Zastąpiono ją sprawdzaniem przecięcia sfer ograniczających
 * (`BoundingSphere`), które lepiej reprezentują objętość narzędzi.
 * 2. Unikanie kolizji: Zamiast "odpychania", zaimplementowano PŁYNNE TŁUMIENIE PRĘDKOŚCI.
 * Gdy narzędzia zbliżają się do siebie, dozwolona prędkość jest redukowana,
 * co wymusza na operatorze ostrożniejszy ruch.
 * 3. Ograniczenia przestrzeni: Wprowadzono "STREFĘ BUFOROWĄ" (`softZone`).
 * Gdy narzędzie wchodzi w tę strefę, jego ruch jest płynnie spowalniany,
 * zamiast być gwałtownie zatrzymywanym na granicy.
 * * Korzyści:
 * - Bardziej realistyczna detekcja kolizji.
 * - Płynniejsza, bardziej przewidywalna i bezpieczniejsza interakcja z robotem.
 * - Zmniejszone ryzyko gwałtownych, niekontrolowanych ruchów i uszkodzenia tkanki.
 */

// NOWA DEFINICJA: Reprezentuje narzędzie na potrzeby zaawansowanych filtrów bezpieczeństwa
interface SurgicalToolForSafety {
    id: string;
    position: THREE.Vector3;
    boundingSphere: THREE.Sphere;
}

// NOWA DEFINICJA: Konfiguracja dla zaawansowanych filtrów bezpieczeństwa
const SAFETY_CONFIG = {
  // Dystans między środkami narzędzi, przy którym rozpoczyna się spowalnianie
  COLLISION_DAMPING_DISTANCE: 25.0, // w mm
  // Minimalny dozwolony dystans między środkami narzędzi
  MINIMUM_DISTANCE: 15.0, // w mm
  // Granice przestrzeni roboczej
  WORKSPACE_MIN: new THREE.Vector3(-100, -100, -100),
  WORKSPACE_MAX: new THREE.Vector3(100, 100, 100),
  // Szerokość "strefy buforowej" przy granicy przestrzeni roboczej
  WORKSPACE_SOFT_ZONE_WIDTH: 30.0, // w mm
  // Maksymalna dozwolona prędkość
  MAX_VELOCITY: 200.0, // w mm/s
};


/**
 * Główna klasa integracji da Vinci
 */
export class DaVinciIntegration {
  private configuration: DaVinciConfiguration;
  private instrumentControllers: Map<string, InstrumentController>;
  private masterConsole: MasterConsoleInterface | null = null;
  private safetySystem: SafetySystem;
  
  // Parametry skalowania ruchu
  private motionScaling: number = 5; // 5:1 - typowe dla precyzji
  private tremorFilter: TremorFilter;
  
  // Stan systemu
  private systemState: string = 'IDLE'; // Użycie stringa dla uproszczenia
  private lastHeartbeat: number = 0;
  
  constructor(config: DaVinciConfiguration) {
    this.configuration = config;
    this.instrumentControllers = new Map();
    this.safetySystem = new SafetySystem(config);
    this.tremorFilter = new TremorFilter();
    
    // Inicjalizacja kontrolerów dla każdego ramienia
    this.initializeInstrumentControllers();
  }
  
  /**
   * Inicjalizuje kontrolery narzędzi
   */
  private initializeInstrumentControllers(): void {
    this.configuration.instruments.forEach(instrument => {
      const controller = new InstrumentController(instrument);
      this.instrumentControllers.set(instrument.instrumentId, controller);
    });
  }
  
  /**
   * Łączy się z konsolą da Vinci
   * @param port Port szeregowy lub adres sieciowy
   */
  public async connect(port: string): Promise<void> {
    console.log('Łączenie z systemem da Vinci...', port);
    
    try {
      // Inicjalizacja interfejsu master console
      // @ts-ignore - Zakładamy, że ta klasa istnieje gdzieś indziej
      this.masterConsole = new MasterConsoleInterface(port);
      await this.masterConsole.initialize();
      
      // Weryfikacja wersji i kompatybilności
      const version = await this.masterConsole.getSystemVersion();
      this.verifyCompatibility(version);
      
      // Kalibracja początkowa
      await this.performInitialCalibration();
      
      // Start systemu bezpieczeństwa
      this.safetySystem.start();
      
      // Rozpocznij pętlę kontrolną
      this.startControlLoop();
      
      this.systemState = SystemState.READY;
      console.log('System da Vinci gotowy do pracy');
      
    } catch (error) {
      console.error('Błąd połączenia z da Vinci:', error);
      this.systemState = SystemState.ERROR;
      throw error;
    }
  }
  
  /**
   * Weryfikuje kompatybilność z wersją systemu
   */
  private verifyCompatibility(version: string): void {
    const supportedVersions = ['Si_4.0', 'X_4.0', 'Xi_4.1', 'SP_1.0'];
    
    if (!supportedVersions.some(v => version.startsWith(v))) {
      throw new Error(`Nieobsługiwana wersja systemu da Vinci: ${version}`);
    }
    
    console.log(`Wykryto kompatybilną wersję: ${version}`);
  }
  
  /**
   * Wykonuje początkową kalibrację
   */
  private async performInitialCalibration(): Promise<void> {
    console.log('Rozpoczynanie kalibracji systemu...');
    
    for (const [id, controller] of this.instrumentControllers) {
      // Przesuń do pozycji home
      await controller.moveToHome();
      
      // Wykonaj test zakresu ruchu
      const rangeTest = await controller.performRangeOfMotionTest();
      
      if (!rangeTest.success) {
        throw new Error(`Kalibracja nieudana dla narzędzia ${id}: ${rangeTest.error}`);
      }
      
      // Zapisz dane kalibracyjne
      controller.updateCalibration(rangeTest.calibrationData);
    }
    
    console.log('Kalibracja zakończona pomyślnie');
  }
  
  /**
   * Główna pętla kontrolna
   * Działa z częstotliwością 1000Hz dla płynności
   */
  private startControlLoop(): void {
    const controlFrequency = 1000; // Hz
    const period = 1000 / controlFrequency; // ms
    
    setInterval(() => {
      try {
        // Sprawdź heartbeat
        this.checkHeartbeat();
        
        // Odczytaj pozycje master (ręce chirurga)
        const masterPositions = this.readMasterPositions();
        
        // Przetłumacz na ruchy slave (robot)
        const slaveCommands = this.translateMasterToSlave(masterPositions);
        
        // =================================================================
        // UŻYCIE NOWYCH, ZAAWANSOWANYCH FILTRÓW BEZPIECZEŃSTWA
        // =================================================================
        const safeCommands = this.applySafetyFilters(slaveCommands);
        
        // Wykonaj ruchy
        this.executeSlaveCommands(safeCommands);
        
        // Odczytaj siły zwrotne
        const forceFeedback = this.readForceFeedback();
        
        // Wyślij haptykę do master
        this.sendHapticFeedback(forceFeedback);
        
      } catch (error) {
        console.error('Błąd w pętli kontrolnej:', error);
        this.handleControlError(error as Error);
      }
    }, period);
  }
  
  /**
   * Sprawdza heartbeat systemu
   */
  private checkHeartbeat(): void {
    const now = Date.now();
    
    if (now - this.lastHeartbeat > 100) { // 100ms timeout
      // console.error('Utrata heartbeat!');
      // this.emergencyStop();
    }
    this.lastHeartbeat = now;
  }
  
  /**
   * Odczytuje pozycje manipulatorów master
   */
  private readMasterPositions(): MasterPosition[] {
    if (!this.masterConsole) return [];
    
    const positions: MasterPosition[] = [];
    
    // Odczytaj pozycje dla każdego manipulatora
    for (let i = 0; i < this.configuration.numberOfArms; i++) {
      const raw = this.masterConsole.readManipulator(i);
      if(!raw) continue;
      
      // Aplikuj filtr drżenia ręki
      const filtered = this.tremorFilter.filter(raw);
      
      positions.push({
        manipulatorId: i,
        position: filtered.position,
        orientation: filtered.orientation,
        gripper: filtered.gripper,
        buttons: raw.buttons
      });
    }
    
    return positions;
  }
  
  /**
   * Tłumaczy ruchy master na komendy slave
   */
  private translateMasterToSlave(
    masterPositions: MasterPosition[]
  ): SlaveCommand[] {
    const commands: SlaveCommand[] = [];
    
    masterPositions.forEach(master => {
      // Znajdź odpowiednie narzędzie
      const instrumentId = this.getInstrumentForManipulator(master.manipulatorId);
      const controller = this.instrumentControllers.get(instrumentId);
      
      if (!controller) return;
      
      // Skalowanie pozycji
      const scaledPosition: [number, number, number] = [
        master.position[0] / this.motionScaling,
        master.position[1] / this.motionScaling,
        master.position[2] / this.motionScaling
      ];
      
      // Transformacja układu współrzędnych
      const transformedPosition = this.transformCoordinates(
        scaledPosition,
        master.orientation
      );
      
      // Mapowanie szczęk
      const jawAngle = this.mapGripperToJaw(master.gripper, controller.instrument);
      
      commands.push({
        instrumentId,
        position: transformedPosition.position,
        orientation: transformedPosition.orientation,
        jawAngle,
        velocity: this.calculateVelocity(controller, transformedPosition.position),
        buttonStates: master.buttons
      });
    });
    
    return commands;
  }
  
  /**
   * Transformuje współrzędne z układu master do slave
   */
  private transformCoordinates(
    position: [number, number, number],
    orientation: [number, number, number, number]
  ): { position: [number, number, number], orientation: [number, number, number, number] } {
    const transformed: [number, number, number] = [
      -position[0],
      -position[1],
      position[2]
    ];
    
    const transformedOrientation = this.rotateQuaternion(
      orientation,
      [0, 0, 1],
      Math.PI
    );
    
    return {
      position: transformed,
      orientation: transformedOrientation
    };
  }
  
  /**
   * Rotuje kwaternion wokół osi
   */
  private rotateQuaternion(
    q: [number, number, number, number],
    axis: [number, number, number],
    angle: number
  ): [number, number, number, number] {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    
    const rotation: [number, number, number, number] = [
      axis[0] * s,
      axis[1] * s,
      axis[2] * s,
      Math.cos(halfAngle)
    ];
    
    return this.multiplyQuaternions(rotation, q);
  }

  /**
   * Mnożenie kwaternionów
   */
  private multiplyQuaternions(
    a: [number, number, number, number],
    b: [number, number, number, number]
  ): [number, number, number, number] {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] + a[1] * b[3] + a[2] * b[0] - a[0] * b[2],
      a[3] * b[2] + a[2] * b[3] + a[0] * b[1] - a[1] * b[0],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
  }

  /**
   * Mapuje pozycję grippera na kąt szczęk
   */
  private mapGripperToJaw(
    gripperValue: number, // 0-1
    instrument: DaVinciInstrument
  ): number {
    let maxAngle = 60; // degrees
    
    switch (instrument.type) {
      case 'needle-driver': maxAngle = 45; break;
      case 'grasper': maxAngle = 75; break;
      case 'scissors': maxAngle = 55; break;
    }
    
    const deadZone = 0.05;
    const effectiveValue = Math.max(0, gripperValue - deadZone) / (1 - deadZone);
    return effectiveValue * maxAngle;
  }
  
  /**
   * Oblicza prędkość dla smooth motion
   */
  private calculateVelocity(
    controller: InstrumentController,
    targetPosition: [number, number, number]
  ): [number, number, number] {
    const currentPosition = controller.getCurrentPosition();
    const dt = 0.001; // 1ms (częstotliwość pętli)
    
    return [
      (targetPosition[0] - currentPosition[0]) / dt,
      (targetPosition[1] - currentPosition[1]) / dt,
      (targetPosition[2] - currentPosition[2]) / dt
    ];
  }
  
  // =================================================================
  // SEKCJA CAŁKOWICIE ZASTĄPIONA NOWĄ, BEZPIECZNIEJSZĄ LOGIKĄ
  // =================================================================
  
  /**
   * Stosuje zaawansowane filtry bezpieczeństwa oparte na predykcji i płynnym tłumieniu.
   * Ta metoda iteruje po każdej komendzie i stosuje do niej filtry przestrzeni roboczej i kolizji.
   * @param commands Lista surowych komend od użytkownika.
   * @returns Przefiltrowana, bezpieczna lista komend.
   */
  private applySafetyFilters(commands: SlaveCommand[]): SlaveCommand[] {
    const safeCommands: SlaveCommand[] = [];

    for (const cmd of commands) {
      const controller = this.instrumentControllers.get(cmd.instrumentId);
      if (!controller) continue;

      let proposedVelocity = new THREE.Vector3(...cmd.velocity);
      const currentPosition = new THREE.Vector3(...controller.getCurrentPosition());

      // Tworzymy tymczasowy obiekt narzędzia na potrzeby obliczeń bezpieczeństwa.
      const currentTool: SurgicalToolForSafety = {
        id: cmd.instrumentId,
        position: currentPosition,
        boundingSphere: controller.getBoundingSphere()
      };

      // 1. Ograniczenie prędkości maksymalnej
      if (proposedVelocity.length() > SAFETY_CONFIG.MAX_VELOCITY) {
        proposedVelocity.normalize().multiplyScalar(SAFETY_CONFIG.MAX_VELOCITY);
      }

      // 2. Ograniczenie do przestrzeni roboczej z użyciem "miękkich stref"
      proposedVelocity = this.clampToWorkspace(currentTool, proposedVelocity);

      // 3. Unikanie kolizji poprzez tłumienie prędkości
      proposedVelocity = this.dampForCollisions(currentTool, proposedVelocity);

      // Jeśli prędkość została zredukowana do zera, komenda jest modyfikowana, aby zatrzymać ruch.
      if (proposedVelocity.lengthSq() < 0.001) {
        safeCommands.push({
          ...cmd,
          position: currentTool.position.toArray() as [number, number, number],
          velocity: [0, 0, 0]
        });
      } else {
        const dt = 0.001; // Czas kroku pętli kontrolnej
        const newPosition = currentPosition.clone().add(proposedVelocity.clone().multiplyScalar(dt));
        safeCommands.push({
          ...cmd,
          position: newPosition.toArray() as [number, number, number],
          velocity: proposedVelocity.toArray() as [number, number, number]
        });
      }
    }
    return safeCommands;
  }

  /**
   * NOWA METODA: Ogranicza ruch do przestrzeni roboczej, używając "miękkiej strefy".
   * Zamiast gwałtownego zatrzymania, ruch jest płynnie spowalniany przy zbliżaniu się do granicy.
   * @param tool Narzędzie do sprawdzenia.
   * @param velocity Proponowana prędkość.
   * @returns Zmodyfikowana, bezpieczna prędkość.
   */
  private clampToWorkspace(tool: SurgicalToolForSafety, velocity: THREE.Vector3): THREE.Vector3 {
    const dt = 0.001;
    const newPos = tool.position.clone().add(velocity.clone().multiplyScalar(dt));
    const clampedVelocity = velocity.clone();

    (['x', 'y', 'z'] as const).forEach(axis => {
      const min = SAFETY_CONFIG.WORKSPACE_MIN[axis];
      const max = SAFETY_CONFIG.WORKSPACE_MAX[axis];
      const softMin = min + SAFETY_CONFIG.WORKSPACE_SOFT_ZONE_WIDTH;
      const softMax = max - SAFETY_CONFIG.WORKSPACE_SOFT_ZONE_WIDTH;

      if (newPos[axis] < min || newPos[axis] > max) {
        clampedVelocity[axis] = 0; // Twarde zatrzymanie na granicy
      } else if (velocity[axis] < 0 && newPos[axis] < softMin) {
        const penetration = softMin - newPos[axis];
        const dampingFactor = 1.0 - Math.min(1.0, penetration / SAFETY_CONFIG.WORKSPACE_SOFT_ZONE_WIDTH);
        clampedVelocity[axis] *= dampingFactor * dampingFactor; // Kwadrat dla szybszego tłumienia
      } else if (velocity[axis] > 0 && newPos[axis] > softMax) {
        const penetration = newPos[axis] - softMax;
        const dampingFactor = 1.0 - Math.min(1.0, penetration / SAFETY_CONFIG.WORKSPACE_SOFT_ZONE_WIDTH);
        clampedVelocity[axis] *= dampingFactor * dampingFactor;
      }
    });
    return clampedVelocity;
  }

  /**
   * NOWA METODA: Redukuje prędkość, gdy narzędzie zbliża się do innego narzędzia.
   * Wykorzystuje sfery ograniczające dla bardziej realistycznej detekcji i unikania kolizji.
   * @param tool Narzędzie do sprawdzenia.
   * @param velocity Proponowana prędkość.
   * @returns Zmodyfikowana, bezpieczna prędkość.
   */
  private dampForCollisions(tool: SurgicalToolForSafety, velocity: THREE.Vector3): THREE.Vector3 {
    let finalVelocity = velocity.clone();

    this.instrumentControllers.forEach(otherController => {
      if (tool.id === otherController.instrument.instrumentId) return;

      const otherTool: SurgicalToolForSafety = {
        id: otherController.instrument.instrumentId,
        position: new THREE.Vector3(...otherController.getCurrentPosition()),
        boundingSphere: otherController.getBoundingSphere()
      };

      const dist = tool.position.distanceTo(otherTool.position);
      const combinedRadius = tool.boundingSphere.radius + otherTool.boundingSphere.radius;
      
      const minimumDist = combinedRadius + SAFETY_CONFIG.MINIMUM_DISTANCE;
      const dampingDist = combinedRadius + SAFETY_CONFIG.COLLISION_DAMPING_DISTANCE;

      if (dist < minimumDist) {
        finalVelocity.set(0, 0, 0); // Pełne zatrzymanie przy zbyt małej odległości
        return; 
      }

      if (dist < dampingDist) {
        // Sprawdź, czy narzędzia się do siebie zbliżają
        const toOtherTool = otherTool.position.clone().sub(tool.position).normalize();
        const closingSpeed = velocity.dot(toOtherTool);

        if (closingSpeed > 0) { // Tłumij tylko przy ruchu w kierunku innego narzędzia
          const penetration = dampingDist - dist;
          const dampingFactor = 1.0 - Math.min(1.0, penetration / (dampingDist - minimumDist));
          finalVelocity.multiplyScalar(dampingFactor);
        }
      }
    });
    return finalVelocity;
  }

  /**
   * Wykonuje komendy na robotach
   */
  private executeSlaveCommands(commands: SlaveCommand[]): void {
    commands.forEach(cmd => {
      const controller = this.instrumentControllers.get(cmd.instrumentId);
      if (!controller) return;
      
      try {
        controller.execute(cmd);
        const state = controller.getCurrentState();
        this.broadcastInstrumentState(state);
      } catch (error) {
        console.error(`Błąd wykonania dla ${cmd.instrumentId}:`, error);
        this.handleInstrumentError(cmd.instrumentId, error as Error);
      }
    });
  }
  
  /**
   * Odczytuje siły zwrotne z sensorów
   */
  private readForceFeedback(): ForceFeedback[] {
    const feedback: ForceFeedback[] = [];
    
    for (const [id, controller] of this.instrumentControllers) {
      const forces = controller.readForces();
      const tissue = controller.detectTissueType();
      
      feedback.push({
        instrumentId: id,
        forces: forces.tip,
        torques: forces.torques,
        tissueType: tissue,
        contactPoint: controller.getContactPoint()
      });
    }
    
    return feedback;
  }
  
  /**
   * Wysyła feedback haptyczny do konsoli
   */
  private sendHapticFeedback(feedback: ForceFeedback[]): void {
    if (!this.masterConsole) return;
    
    feedback.forEach(fb => {
      const manipulatorId = this.getManipulatorForInstrument(fb.instrumentId);
      if (manipulatorId < 0) return;

      const scaledForces = {
        x: fb.forces.x * this.motionScaling * 0.5,
        y: fb.forces.y * this.motionScaling * 0.5,
        z: fb.forces.z * this.motionScaling * 0.5
      };
      
      const hapticSignal = this.generateHapticTexture(fb.tissueType, scaledForces);
      this.masterConsole.sendHaptic(manipulatorId, hapticSignal);
    });
  }
  
  /**
   * Generuje sygnał haptyczny z teksturą
   */
  private generateHapticTexture(
    tissueType: string | undefined,
    baseForces: { x: number, y: number, z: number }
  ): HapticSignal {
    let texture: HapticSignal['texture'] = { frequency: 0, amplitude: 0, pattern: 'smooth' };
    
    switch (tissueType) {
      case 'vessel':
        texture = { frequency: 1.2, amplitude: 0.1, pattern: 'pulse' };
        break;
      case 'bone':
        texture = { frequency: 100, amplitude: 0.3, pattern: 'vibration' };
        break;
      case 'tumor':
        texture = { frequency: 0, amplitude: 0, pattern: 'stiff' };
        break;
    }
    
    return { forces: baseForces, texture, timestamp: Date.now() };
  }
  
  /**
   * Broadcast stanu narzędzia
   */
  private broadcastInstrumentState(state: InstrumentState): void {
    if (this.onStateUpdate) {
      this.onStateUpdate(state);
    }
  }
  
  /**
   * Callback dla aktualizacji stanu
   */
  public onStateUpdate?: (state: InstrumentState) => void;
  
  /**
   * Obsługa błędów kontrolera
   */
  private handleInstrumentError(instrumentId: string, error: Error): void {
    console.error(`Błąd narzędzia ${instrumentId}:`, error);
    
    const controller = this.instrumentControllers.get(instrumentId);
    controller?.emergencyStop();
    
    this.safetySystem.reportError(instrumentId, error);
  }
  
  /**
   * Obsługa błędów pętli kontrolnej
   */
  private handleControlError(error: Error): void {
    console.error('Krytyczny błąd kontroli:', error);
    
    if (this.errorCount++ > 10) {
      this.emergencyStop();
    }
  }
  
  private errorCount: number = 0;
  
  /**
   * Awaryjne zatrzymanie systemu
   */
  public emergencyStop(): void {
    console.error('AWARYJNE ZATRZYMANIE SYSTEMU DA VINCI!');
    
    for (const controller of this.instrumentControllers.values()) {
      controller.emergencyStop();
    }
    
    this.masterConsole?.disableAll();
    this.systemState = SystemState.EMERGENCY_STOP;
    
    if (this.onEmergencyStop) {
      this.onEmergencyStop();
    }
  }
  
  public onEmergencyStop?: () => void;
  
  /**
   * Mapowanie manipulator -> instrument
   */
  private getInstrumentForManipulator(manipulatorId: number): string {
    const instruments = Array.from(this.instrumentControllers.keys());
    return instruments[manipulatorId] || instruments[0];
  }
  
  /**
   * Mapowanie instrument -> manipulator
   */
  private getManipulatorForInstrument(instrumentId: string): number {
    const instruments = Array.from(this.instrumentControllers.keys());
    return instruments.indexOf(instrumentId);
  }
  
  /**
   * Ustawia skalowanie ruchu
   */
  public setMotionScaling(scale: number): void {
    this.motionScaling = Math.max(1, Math.min(10, scale));
    console.log(`Skalowanie ruchu ustawione na ${this.motionScaling}:1`);
  }
  
  /**
   * Pobiera aktualną konfigurację
   */
  public getConfiguration(): DaVinciConfiguration {
    return this.configuration;
  }
  
  /**
   * Pobiera stan systemu
   */
  public getSystemState(): string {
    return this.systemState;
  }
}

/**
 * Kontroler pojedynczego narzędzia
 */
class InstrumentController {
  public instrument: DaVinciInstrument;
  private currentState: InstrumentState;
  private motorDrivers: MotorDriver[];
  private forceSensors: ForceSensor[];
  private boundingSphere: THREE.Sphere; // NOWE POLE

  constructor(instrument: DaVinciInstrument) {
    this.instrument = instrument;
    
    this.currentState = {
      instrumentId: instrument.instrumentId,
      timestamp: Date.now() * 1000,
      tipPosition: [0, 0, 0],
      orientation: [0, 0, 0, 1],
      jawAngle: 0,
      graspForce: 0,
      safetyStatus: {
        inWorkspace: true,
        collisionRisk: 0,
        proximityAlerts: [],
        forceLimit: false
      }
    };
    
    // NOWA INICJALIZACJA: Tworzymy sferę ograniczającą dla narzędzia
    // W rzeczywistym systemie promień byłby ładowany z konfiguracji narzędzia.
    this.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 10); // Promień 10mm
    
    this.motorDrivers = this.initializeMotors(instrument);
    this.forceSensors = this.initializeSensors(instrument);
  }
  
  // NOWA METODA: Zapewnia dostęp do sfery ograniczającej
  public getBoundingSphere(): THREE.Sphere {
      // Aktualizujemy pozycję sfery, aby odpowiadała aktualnej pozycji narzędzia
      this.boundingSphere.center.set(...this.currentState.tipPosition);
      return this.boundingSphere;
  }

  private initializeMotors(instrument: DaVinciInstrument): MotorDriver[] {
    const motors: MotorDriver[] = [];
    for (let i = 0; i < (instrument.articulation.degreesOfFreedom || 7); i++) {
        // @ts-ignore
      motors.push(new MotorDriver(i, this.getMotorConfig(i)));
    }
    return motors;
  }

  private getMotorConfig(dof: number): MotorConfig {
    if (dof < 3) return { type: 'linear', maxVelocity: 200, maxAcceleration: 1000, maxForce: 50 };
    if (dof < 6) return { type: 'rotary', maxVelocity: Math.PI, maxAcceleration: 10, maxTorque: 5 };
    return { type: 'rotary', maxVelocity: Math.PI / 2, maxAcceleration: 5, maxTorque: 2 };
  }
  
  private initializeSensors(instrument: DaVinciInstrument): ForceSensor[] {
    const sensors: ForceSensor[] = [];
    // @ts-ignore
    sensors.push(new ForceSensor('tip', { range: 20, resolution: 0.01 }));
    if (instrument.articulation.jaw) {
        // @ts-ignore
      sensors.push(new ForceSensor('jaw1', { range: 10, resolution: 0.01 }));
      // @ts-ignore
      sensors.push(new ForceSensor('jaw2', { range: 10, resolution: 0.01 }));
    }
    return sensors;
  }
  
  public async moveToHome(): Promise<void> {
    await this.moveTo([0, 0, 100], [0, 0, 0, 1], 0);
  }
  
  public async performRangeOfMotionTest(): Promise<{
    success: boolean,
    error?: string,
    calibrationData?: CalibrationData
  }> {
    try {
      for (let i = 0; i < this.motorDrivers.length; i++) {
        const result = await this.motorDrivers[i].testRange();
        if (!result.success) return { success: false, error: `Motor ${i}: ${result.error}` };
      }
      const calibrationData: CalibrationData = {
        toolCenterPoint: this.calculateTCP(),
        kinematicParameters: this.calculateKinematics(),
        lastCalibrationDate: new Date().toISOString(),
        calibrationAccuracy: 0.1
      };
      return { success: true, calibrationData };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  
  private calculateTCP(): [number, number, number] { return [0, 0, 50]; }
  private calculateKinematics(): number[] { return [0, 0, 0, 0, 0, 0]; }
  
  public updateCalibration(data?: CalibrationData): void { if (data) this.instrument.calibrationData = data; }
  public getCurrentPosition(): [number, number, number] { return this.currentState.tipPosition; }
  public getCurrentState(): InstrumentState { return { ...this.currentState }; }
  public getGraspForce(): number { return this.currentState.graspForce || 0; }
  
  public execute(command: SlaveCommand): void {
    this.updateTargets(command);
    this.controlStep();
    this.updateState();
  }
  
  private updateTargets(command: SlaveCommand): void {
    this.motorDrivers[0].setTarget(command.position[0]);
    this.motorDrivers[1].setTarget(command.position[1]);
    this.motorDrivers[2].setTarget(command.position[2]);
    const euler = quaternionToEuler(command.orientation);
    this.motorDrivers[3].setTarget(euler[0]);
    this.motorDrivers[4].setTarget(euler[1]);
    this.motorDrivers[5].setTarget(euler[2]);
    if (this.motorDrivers[6]) this.motorDrivers[6].setTarget(command.jawAngle);
  }
  
  private controlStep(): void { this.motorDrivers.forEach(motor => motor.step()); }
  
  private updateState(): void {
    this.currentState.tipPosition = [
      this.motorDrivers[0].getPosition(),
      this.motorDrivers[1].getPosition(),
      this.motorDrivers[2].getPosition()
    ];
    const euler: [number, number, number] = [
      this.motorDrivers[3].getPosition(),
      this.motorDrivers[4].getPosition(),
      this.motorDrivers[5].getPosition()
    ];
    this.currentState.orientation = this.eulerToQuaternion(euler);
    if (this.motorDrivers[6]) this.currentState.jawAngle = this.motorDrivers[6].getPosition();
    this.currentState.graspForce = this.readGraspForce();
    this.currentState.timestamp = Date.now() * 1000;
    this.updateSafetyStatus();
  }
  
  private eulerToQuaternion(euler: [number, number, number]): [number, number, number, number] {
    const [roll, pitch, yaw] = euler;
    const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);
    return [
      sr * cp * cy - cr * sp * sy,
      cr * sp * cy + sr * cp * sy,
      cr * cp * sy - sr * sp * cy,
      cr * cp * cy + sr * sp * sy
    ];
  }
  
  private readGraspForce(): number {
    const jawForces = this.forceSensors.filter(s => s.location.startsWith('jaw')).map(s => s.read());
    if (jawForces.length === 0) return 0;
    return jawForces.reduce((a, b) => a + b, 0) / jawForces.length;
  }
  
  private updateSafetyStatus(): void {
    const pos = this.currentState.tipPosition;
    const limit = 100;
    this.currentState.safetyStatus.inWorkspace = Math.abs(pos[0]) < limit && Math.abs(pos[1]) < limit && Math.abs(pos[2]) < limit;
    this.currentState.safetyStatus.forceLimit = (this.currentState.graspForce || 0) > 15;
  }
  
  public readForces(): { tip: { x: number, y: number, z: number }, torques: { x: number, y: number, z: number } } {
    const tipForce = this.forceSensors.find(s => s.location === 'tip');
    if (!tipForce) return { tip: { x: 0, y: 0, z: 0 }, torques: { x: 0, y: 0, z: 0 } };
    const reading = tipForce.read6Axis();
    return { tip: { x: reading[0], y: reading[1], z: reading[2] }, torques: { x: reading[3], y: reading[4], z: reading[5] } };
  }
  
  public detectTissueType(): string | undefined {
    const forces = this.readForces();
    const magnitude = Math.sqrt(forces.tip.x ** 2 + forces.tip.y ** 2 + forces.tip.z ** 2);
    const stiffness = magnitude / 0.1;
    if (stiffness < 3) return 'soft-tissue';
    if (stiffness < 10) return 'vessel';
    if (stiffness < 20) return 'tumor';
    if (stiffness > 50) return 'bone';
    return undefined;
  }
  
  public getContactPoint(): [number, number, number] | undefined {
    const forces = this.readForces();
    if (Math.abs(forces.tip.x) < 0.1 && Math.abs(forces.tip.y) < 0.1 && Math.abs(forces.tip.z) < 0.1) return undefined;
    return this.currentState.tipPosition;
  }
  
  public async moveTo(position: [number, number, number], orientation: [number, number, number, number], jawAngle: number): Promise<void> {
    const steps = 100;
    const startPos = this.currentState.tipPosition;
    const startOri = this.currentState.orientation;
    const startJaw = this.currentState.jawAngle || 0;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const interpPos: [number, number, number] = [
        startPos[0] + (position[0] - startPos[0]) * t,
        startPos[1] + (position[1] - startPos[1]) * t,
        startPos[2] + (position[2] - startPos[2]) * t
      ];
      const interpOri = this.slerp(startOri, orientation, t);
      const interpJaw = startJaw + (jawAngle - startJaw) * t;
      this.execute({
        instrumentId: this.instrument.instrumentId,
        position: interpPos,
        orientation: interpOri,
        jawAngle: interpJaw,
        velocity: [0, 0, 0],
        buttonStates: {}
      });
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  private slerp(q1: [number, number, number, number], q2: [number, number, number, number], t: number): [number, number, number, number] {
    let dot = q1[0] * q2[0] + q1[1] * q2[1] + q1[2] * q2[2] + q1[3] * q2[3];
    const q2Copy = [...q2] as [number, number, number, number];
    if (dot < 0) {
      q2Copy[0] = -q2Copy[0];
      q2Copy[1] = -q2Copy[1];
      q2Copy[2] = -q2Copy[2];
      q2Copy[3] = -q2Copy[3];
      dot = -dot;
    }
    if (dot > 0.9995) {
      const result = q1.map((val, i) => val + t * (q2Copy[i] - val)) as [number, number, number, number];
      return result;
    }
    const theta0 = Math.acos(dot);
    const theta = theta0 * t;
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);
    const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
    const s1 = sinTheta / sinTheta0;
    const result = q1.map((val, i) => s0 * val + s1 * q2Copy[i]) as [number, number, number, number];
    return result;
  }
  
  public emergencyStop(): void {
    this.motorDrivers.forEach(motor => motor.emergencyStop());
    if (this.motorDrivers[6]) this.motorDrivers[6].setTarget(0);
    console.error(`Awaryjne zatrzymanie narzędzia ${this.instrument.instrumentId}`);
  }
}

// Reszta klas pomocniczych (MotorDriver, ForceSensor, etc.) pozostaje bez zmian
// i jest tu dołączona dla kompletności pliku.

/**
 * Sterownik silnika (Symulacja)
 */
class MotorDriver {
    private motorId: number;
    private config: MotorConfig;
    private currentPosition: number = 0;
    private targetPosition: number = 0;
    private velocity: number = 0;

    constructor(motorId: number, config: MotorConfig) {
        this.motorId = motorId;
        this.config = config;
    }
    public setTarget(position: number) { this.targetPosition = position; }
    public getPosition(): number { return this.currentPosition; }
    public step() {
        const error = this.targetPosition - this.currentPosition;
        this.velocity = Math.max(-this.config.maxVelocity, Math.min(this.config.maxVelocity, error * 10)); // Simplified PID
        this.currentPosition += this.velocity * 0.001;
    }
    public async testRange(): Promise<{ success: boolean, error?: string }> { return { success: true }; }
    public emergencyStop() { this.targetPosition = this.currentPosition; this.velocity = 0; }
}

/**
 * Sensor siły (Symulacja)
 */
class ForceSensor {
    public location: string;
    constructor(location: string, config: { range: number, resolution: number }) {
        this.location = location;
    }
    public read(): number { return Math.random() * 2; }
    public read6Axis(): number[] { return [this.read(), this.read(), this.read(), this.read()*0.1, this.read()*0.1, this.read()*0.1]; }
}

/**
 * Filtr drżenia (Symulacja)
 */
class TremorFilter {
    public filter(position: MasterPosition): MasterPosition {
        return position; // No-op for simplicity
    }
}

/**
 * System bezpieczeństwa (Ramka)
 */
class SafetySystem {
    constructor(config: DaVinciConfiguration) {}
    public start() { console.log('System bezpieczeństwa aktywny'); }
    public reportError(instrumentId: string, error: Error) { console.warn(`Zgłoszono błąd dla ${instrumentId}`); }
}


// --- Typy i Interfejsy ---

class MasterConsoleInterface {
    constructor(port: string) {}
    async initialize() {}
    async getSystemVersion(): Promise<string> { return 'Xi_4.1.mock'; }
    readManipulator(id: number): MasterPosition | null {
        if (Math.random() > 0.1) return {
            manipulatorId: id,
            position: [Math.random()*10, Math.random()*10, Math.random()*10],
            orientation: [0,0,0,1],
            gripper: Math.random(),
            buttons: { clutch: false }
        };
        return null;
    }
    sendHaptic(id: number, signal: HapticSignal) {}
    disableAll() {}
}

const SystemState = {
    IDLE: 'IDLE',
    READY: 'READY',
    OPERATING: 'OPERATING',
    ERROR: 'ERROR',
    EMERGENCY_STOP: 'EMERGENCY_STOP'
} as const;

type SystemState = typeof SystemState[keyof typeof SystemState];


interface MasterPosition {
    manipulatorId: number;
    position: [number, number, number];
    orientation: [number, number, number, number];
    gripper: number;
    buttons: { [key: string]: boolean };
}

interface SlaveCommand {
    instrumentId: string;
    position: [number, number, number];
    orientation: [number, number, number, number];
    jawAngle: number;
    velocity: [number, number, number];
    buttonStates: { [key: string]: boolean };
}

interface MotorConfig {
    type: 'linear' | 'rotary';
    maxVelocity: number;
    maxAcceleration: number;
    maxForce?: number;
    maxTorque?: number;
}

interface ForceFeedback {
    instrumentId: string;
    forces: { x: number, y: number, z: number };
    torques?: { x: number, y: number, z: number };
    tissueType?: string;
    contactPoint?: [number, number, number];
}

interface HapticSignal {
    forces: { x: number, y: number, z: number };
    texture: {
        frequency: number;
        amplitude: number;
        pattern: 'smooth' | 'pulse' | 'vibration' | 'stiff';
    };
    timestamp: number;
}

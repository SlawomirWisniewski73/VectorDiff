/**
 * Integracja z systemem chirurgicznym da Vinci
 * 
 * System da Vinci to najczęściej używany robot chirurgiczny.
 * Ten moduł zapewnia:
 * - Komunikację z konsolą chirurga
 * - Translację ruchów master-slave
 * - Skalowanie i filtrowanie drżenia
 * - Mapowanie stopni swobody
 * 
 * Bezpieczeństwo jest priorytetem #1!
 */

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
  private systemState: SystemState = SystemState.IDLE;
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
        
        // Zastosuj filtry bezpieczeństwa
        const safeCommands = this.applySafetyFilters(slaveCommands);
        
        // Wykonaj ruchy
        this.executeSlaveCommands(safeCommands);
        
        // Odczytaj siły zwrotne
        const forceFeedback = this.readForceFeedback();
        
        // Wyślij haptykę do master
        this.sendHapticFeedback(forceFeedback);
        
      } catch (error) {
        console.error('Błąd w pętli kontrolnej:', error);
        this.handleControlError(error);
      }
    }, period);
  }
  
  /**
   * Sprawdza heartbeat systemu
   */
  private checkHeartbeat(): void {
    const now = Date.now();
    
    if (now - this.lastHeartbeat > 100) { // 100ms timeout
      console.error('Utrata heartbeat!');
      this.emergencyStop();
    }
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
   * To jest kluczowe dla intuicyjnego sterowania
   */
  private transformCoordinates(
    position: [number, number, number],
    orientation: [number, number, number, number]
  ): { position: [number, number, number], orientation: [number, number, number, number] } {
    // Macierz transformacji zależy od setup sali operacyjnej
    // Tu używamy typowej konfiguracji
    
    // Obrót o 180 stopni wokół Z (chirurg patrzy "do środka" pacjenta)
    const transformed: [number, number, number] = [
      -position[0],  // Odwrócenie X
      -position[1],  // Odwrócenie Y
      position[2]    // Z bez zmian
    ];
    
    // Transformacja orientacji
    // Tu również należałoby zastosować odpowiednią rotację
    const transformedOrientation = this.rotateQuaternion(
      orientation,
      [0, 0, 1],  // Oś Z
      Math.PI     // 180 stopni
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
    // Implementacja mnożenia kwaternionów
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    const c = Math.cos(halfAngle);
    
    const rotation: [number, number, number, number] = [
      axis[0] * s,
      axis[1] * s,
      axis[2] * s,
      c
    ];
    
    // q' = rotation * q * rotation^-1
    return this.multiplyQuaternions(
      rotation,
      this.multiplyQuaternions(q, this.conjugateQuaternion(rotation))
    );
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
   * Koniugat kwaterniona
   */
  private conjugateQuaternion(
    q: [number, number, number, number]
  ): [number, number, number, number] {
    return [-q[0], -q[1], -q[2], q[3]];
  }
  
  /**
   * Mapuje pozycję grippera na kąt szczęk
   */
  private mapGripperToJaw(
    gripperValue: number, // 0-1
    instrument: DaVinciInstrument
  ): number {
    // Różne narzędzia mają różne zakresy
    let maxAngle = 60; // stopnie
    
    switch (instrument.type) {
      case 'needle-driver':
        maxAngle = 45;
        break;
      case 'grasper':
        maxAngle = 75;
        break;
      case 'scissors':
        maxAngle = 55;
        break;
    }
    
    // Mapowanie liniowe z dead zone
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
  
  /**
   * Stosuje filtry bezpieczeństwa
   */
  private applySafetyFilters(commands: SlaveCommand[]): SlaveCommand[] {
    return commands.map(cmd => {
      const controller = this.instrumentControllers.get(cmd.instrumentId);
      if (!controller) return cmd;
      
      // Sprawdź ograniczenia workspace
      const clampedPosition = this.clampToWorkspace(cmd.position);
      
      // Sprawdź kolizje
      const collisionFree = this.checkCollisions(cmd.instrumentId, clampedPosition);
      
      // Sprawdź prędkość
      const limitedVelocity = this.limitVelocity(cmd.velocity);
      
      // Sprawdź siłę
      const safeJawAngle = this.limitForce(cmd.jawAngle, controller);
      
      return {
        ...cmd,
        position: collisionFree,
        velocity: limitedVelocity,
        jawAngle: safeJawAngle
      };
    });
  }
  
  /**
   * Ogranicza pozycję do workspace
   */
  private clampToWorkspace(position: [number, number, number]): [number, number, number] {
    // Workspace da Vinci to zazwyczaj sześcian 20x20x20cm
    const limit = 100; // mm
    
    return [
      Math.max(-limit, Math.min(limit, position[0])),
      Math.max(-limit, Math.min(limit, position[1])),
      Math.max(-limit, Math.min(limit, position[2]))
    ];
  }
  
  /**
   * Sprawdza kolizje między narzędziami
   */
  private checkCollisions(
    instrumentId: string,
    position: [number, number, number]
  ): [number, number, number] {
    const minDistance = 10; // mm
    
    for (const [otherId, controller] of this.instrumentControllers) {
      if (otherId === instrumentId) continue;
      
      const otherPos = controller.getCurrentPosition();
      const distance = Math.sqrt(
        Math.pow(position[0] - otherPos[0], 2) +
        Math.pow(position[1] - otherPos[1], 2) +
        Math.pow(position[2] - otherPos[2], 2)
      );
      
      if (distance < minDistance) {
        // Odsuń narzędzia
        const direction = [
          position[0] - otherPos[0],
          position[1] - otherPos[1],
          position[2] - otherPos[2]
        ];
        
        const magnitude = Math.sqrt(
          direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2
        );
        
        if (magnitude > 0) {
          const normalized = direction.map(d => d / magnitude);
          const correction = minDistance - distance;
          
          position[0] += normalized[0] * correction / 2;
          position[1] += normalized[1] * correction / 2;
          position[2] += normalized[2] * correction / 2;
        }
      }
    }
    
    return position;
  }
  
  /**
   * Ogranicza prędkość dla bezpieczeństwa
   */
  private limitVelocity(
    velocity: [number, number, number]
  ): [number, number, number] {
    const maxVelocity = 200; // mm/s
    
    const magnitude = Math.sqrt(
      velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2
    );
    
    if (magnitude > maxVelocity) {
      const scale = maxVelocity / magnitude;
      return [
        velocity[0] * scale,
        velocity[1] * scale,
        velocity[2] * scale
      ];
    }
    
    return velocity;
  }
  
  /**
   * Ogranicza siłę chwytu
   */
  private limitForce(jawAngle: number, controller: InstrumentController): number {
    const maxForce = 10; // Newtony
    const currentForce = controller.getGraspForce();
    
    if (currentForce > maxForce) {
      // Zmniejsz kąt szczęk proporcjonalnie
      const reduction = maxForce / currentForce;
      return jawAngle * reduction;
    }
    
    return jawAngle;
  }
  
  /**
   * Wykonuje komendy na robotach
   */
  private executeSlaveCommands(commands: SlaveCommand[]): void {
    commands.forEach(cmd => {
      const controller = this.instrumentControllers.get(cmd.instrumentId);
      if (!controller) return;
      
      try {
        // Wyślij komendę do kontrolera
        controller.execute(cmd);
        
        // Aktualizuj stan
        const state = controller.getCurrentState();
        this.broadcastInstrumentState(state);
        
      } catch (error) {
        console.error(`Błąd wykonania dla ${cmd.instrumentId}:`, error);
        this.handleInstrumentError(cmd.instrumentId, error);
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
      
      // Skaluj siły dla realizmu
      const scaledForces = {
        x: fb.forces.x * this.motionScaling * 0.5, // 50% siły
        y: fb.forces.y * this.motionScaling * 0.5,
        z: fb.forces.z * this.motionScaling * 0.5
      };
      
      // Dodaj teksturę tkanki
      const hapticSignal = this.generateHapticTexture(fb.tissueType, scaledForces);
      
      // Wyślij do manipulatora
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
    let texture = {
      frequency: 0,
      amplitude: 0,
      pattern: 'smooth' as const
    };
    
    switch (tissueType) {
      case 'vessel':
        // Pulsacja dla naczyń
        texture = {
          frequency: 1.2, // Hz (tętno)
          amplitude: 0.1,
          pattern: 'pulse'
        };
        break;
        
      case 'bone':
        // Wibracje dla kości
        texture = {
          frequency: 100, // Hz
          amplitude: 0.3,
          pattern: 'vibration'
        };
        break;
        
      case 'tumor':
        // Sztywniejsza tekstura
        texture = {
          frequency: 0,
          amplitude: 0,
          pattern: 'stiff'
        };
        break;
    }
    
    return {
      forces: baseForces,
      texture,
      timestamp: Date.now()
    };
  }
  
  /**
   * Broadcast stanu narzędzia
   */
  private broadcastInstrumentState(state: InstrumentState): void {
    // Tu wysyłamy stan przez streaming manager
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
  private handleInstrumentError(instrumentId: string, error: any): void {
    console.error(`Błąd narzędzia ${instrumentId}:`, error);
    
    // Zatrzymaj to narzędzie
    const controller = this.instrumentControllers.get(instrumentId);
    controller?.emergencyStop();
    
    // Powiadom system
    this.safetySystem.reportError(instrumentId, error);
  }
  
  /**
   * Obsługa błędów pętli kontrolnej
   */
  private handleControlError(error: any): void {
    console.error('Krytyczny błąd kontroli:', error);
    
    // Jeśli zbyt wiele błędów, zatrzymaj system
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
    
    // Zatrzymaj wszystkie narzędzia
    for (const controller of this.instrumentControllers.values()) {
      controller.emergencyStop();
    }
    
    // Wyłącz napędy
    this.masterConsole?.disableAll();
    
    // Zmień stan systemu
    this.systemState = SystemState.EMERGENCY_STOP;
    
    // Powiadom wszystkich
    if (this.onEmergencyStop) {
      this.onEmergencyStop();
    }
  }
  
  public onEmergencyStop?: () => void;
  
  /**
   * Mapowanie manipulator -> instrument
   */
  private getInstrumentForManipulator(manipulatorId: number): string {
    // Tu byłaby logika mapowania
    // Na razie zakładamy proste mapowanie 1:1
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
   * @param scale Współczynnik skalowania (1-10)
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
  public getSystemState(): SystemState {
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
  
  constructor(instrument: DaVinciInstrument) {
    this.instrument = instrument;
    
    // Inicjalizacja stanu
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
    
    // Inicjalizacja sterowników
    this.motorDrivers = this.initializeMotors(instrument);
    this.forceSensors = this.initializeSensors(instrument);
  }
  
  private initializeMotors(instrument: DaVinciInstrument): MotorDriver[] {
    // Każdy stopień swobody ma swój silnik
    const motors: MotorDriver[] = [];
    
    for (let i = 0; i < instrument.articulation.degreesOfFreedom; i++) {
      motors.push(new MotorDriver(i, this.getMotorConfig(i)));
    }
    
    return motors;
  }
  
  private getMotorConfig(dof: number): MotorConfig {
    // Konfiguracja zależy od stopnia swobody
    // DOF 0-2: pozycja XYZ
    // DOF 3-5: orientacja
    // DOF 6: szczęki
    
    if (dof < 3) {
      // Silniki pozycji
      return {
        type: 'linear',
        maxVelocity: 200, // mm/s
        maxAcceleration: 1000, // mm/s²
        maxForce: 50 // N
      };
    } else if (dof < 6) {
      // Silniki orientacji
      return {
        type: 'rotary',
        maxVelocity: Math.PI, // rad/s
        maxAcceleration: 10, // rad/s²
        maxTorque: 5 // Nm
      };
    } else {
      // Silnik szczęk
      return {
        type: 'rotary',
        maxVelocity: Math.PI / 2,
        maxAcceleration: 5,
        maxTorque: 2
      };
    }
  }
  
  private initializeSensors(instrument: DaVinciInstrument): ForceSensor[] {
    const sensors: ForceSensor[] = [];
    
    // Sensor na końcówce
    sensors.push(new ForceSensor('tip', { range: 20, resolution: 0.01 }));
    
    // Sensory w szczękach
    if (instrument.articulation.jaw) {
      sensors.push(new ForceSensor('jaw1', { range: 10, resolution: 0.01 }));
      sensors.push(new ForceSensor('jaw2', { range: 10, resolution: 0.01 }));
    }
    
    return sensors;
  }
  
  public async moveToHome(): Promise<void> {
    // Ruch do pozycji bazowej
    const homePosition: [number, number, number] = [0, 0, 100]; // 10cm nad pacjentem
    const homeOrientation: [number, number, number, number] = [0, 0, 0, 1];
    
    await this.moveTo(homePosition, homeOrientation, 0);
  }
  
  public async performRangeOfMotionTest(): Promise<{
    success: boolean,
    error?: string,
    calibrationData?: CalibrationData
  }> {
    try {
      // Test każdego stopnia swobody
      for (let i = 0; i < this.motorDrivers.length; i++) {
        const result = await this.motorDrivers[i].testRange();
        if (!result.success) {
          return { success: false, error: `Motor ${i}: ${result.error}` };
        }
      }
      
      // Oblicz parametry kalibracyjne
      const calibrationData: CalibrationData = {
        toolCenterPoint: this.calculateTCP(),
        kinematicParameters: this.calculateKinematics(),
        lastCalibrationDate: new Date().toISOString(),
        calibrationAccuracy: 0.1 // mm
      };
      
      return { success: true, calibrationData };
      
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  
  private calculateTCP(): [number, number, number] {
    // Obliczenie Tool Center Point
    // W praktyce używa się wizji komputerowej
    return [0, 0, 50]; // 50mm od ostatniego przegubu
  }
  
  private calculateKinematics(): number[] {
    // Parametry Denavit-Hartenberg
    // Specyficzne dla każdego modelu da Vinci
    return [0, 0, 0, 0, 0, 0];
  }
  
  public updateCalibration(data?: CalibrationData): void {
    if (data) {
      this.instrument.calibrationData = data;
    }
  }
  
  public getCurrentPosition(): [number, number, number] {
    return this.currentState.tipPosition;
  }
  
  public getCurrentState(): InstrumentState {
    return { ...this.currentState };
  }
  
  public getGraspForce(): number {
    return this.currentState.graspForce || 0;
  }
  
  public execute(command: SlaveCommand): void {
    // Aktualizuj cel dla kontrolerów PID
    this.updateTargets(command);
    
    // Wykonaj krok kontroli
    this.controlStep();
    
    // Aktualizuj stan
    this.updateState();
  }
  
  private updateTargets(command: SlaveCommand): void {
    // Przekaż cele do odpowiednich silników
    // Pozycja XYZ
    this.motorDrivers[0].setTarget(command.position[0]);
    this.motorDrivers[1].setTarget(command.position[1]);
    this.motorDrivers[2].setTarget(command.position[2]);
    
    // Orientacja (konwersja z kwaterniona)
    const euler = quaternionToEuler(command.orientation);
    this.motorDrivers[3].setTarget(euler[0]);
    this.motorDrivers[4].setTarget(euler[1]);
    this.motorDrivers[5].setTarget(euler[2]);
    
    // Szczęki
    if (this.motorDrivers[6]) {
      this.motorDrivers[6].setTarget(command.jawAngle);
    }
  }
  
  private controlStep(): void {
    // Wykonaj krok kontroli dla każdego silnika
    this.motorDrivers.forEach(motor => motor.step());
  }
  
  private updateState(): void {
    // Odczytaj aktualną pozycję z enkoderów
    this.currentState.tipPosition = [
      this.motorDrivers[0].getPosition(),
      this.motorDrivers[1].getPosition(),
      this.motorDrivers[2].getPosition()
    ];
    
    // Odczytaj orientację
    const euler: [number, number, number] = [
      this.motorDrivers[3].getPosition(),
      this.motorDrivers[4].getPosition(),
      this.motorDrivers[5].getPosition()
    ];
    this.currentState.orientation = this.eulerToQuaternion(euler);
    
    // Odczytaj szczęki
    if (this.motorDrivers[6]) {
      this.currentState.jawAngle = this.motorDrivers[6].getPosition();
    }
    
    // Odczytaj siły
    this.currentState.graspForce = this.readGraspForce();
    
    // Aktualizuj timestamp
    this.currentState.timestamp = Date.now() * 1000;
    
    // Sprawdź bezpieczeństwo
    this.updateSafetyStatus();
  }
  
  private eulerToQuaternion(euler: [number, number, number]): [number, number, number, number] {
    // Konwersja kątów Eulera na kwaternion
    const [roll, pitch, yaw] = euler;
    
    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5);
    const sr = Math.sin(roll * 0.5);
    
    return [
      sr * cp * cy - cr * sp * sy,
      cr * sp * cy + sr * cp * sy,
      cr * cp * sy - sr * sp * cy,
      cr * cp * cy + sr * sp * sy
    ];
  }
  
  private readGraspForce(): number {
    // Odczyt z sensorów siły
    const jawForces = this.forceSensors
      .filter(s => s.location.startsWith('jaw'))
      .map(s => s.read());
    
    if (jawForces.length === 0) return 0;
    
    // Średnia siła ze szczęk
    return jawForces.reduce((a, b) => a + b, 0) / jawForces.length;
  }
  
  private updateSafetyStatus(): void {
    const pos = this.currentState.tipPosition;
    
    // Sprawdź workspace
    const limit = 100; // mm
    this.currentState.safetyStatus.inWorkspace = 
      Math.abs(pos[0]) < limit &&
      Math.abs(pos[1]) < limit &&
      Math.abs(pos[2]) < limit;
    
    // Sprawdź siłę
    this.currentState.safetyStatus.forceLimit = 
      this.currentState.graspForce! > 15; // 15N limit
  }
  
  public readForces(): {
    tip: { x: number, y: number, z: number },
    torques: { x: number, y: number, z: number }
  } {
    const tipForce = this.forceSensors.find(s => s.location === 'tip');
    
    if (!tipForce) {
      return {
        tip: { x: 0, y: 0, z: 0 },
        torques: { x: 0, y: 0, z: 0 }
      };
    }
    
    // Odczyt 6-axis force/torque
    const reading = tipForce.read6Axis();
    
    return {
      tip: { x: reading[0], y: reading[1], z: reading[2] },
      torques: { x: reading[3], y: reading[4], z: reading[5] }
    };
  }
  
  public detectTissueType(): string | undefined {
    // Analiza sygnału siły dla detekcji tkanki
    const forces = this.readForces();
    const magnitude = Math.sqrt(
      forces.tip.x ** 2 + forces.tip.y ** 2 + forces.tip.z ** 2
    );
    
    // Analiza sztywności (uproszczona)
    const stiffness = magnitude / 0.1; // Założenie 0.1mm penetracji
    
    if (stiffness < 3) return 'soft-tissue';
    if (stiffness < 5) return 'organ';
    if (stiffness < 10) return 'vessel';
    if (stiffness < 20) return 'tumor';
    if (stiffness > 50) return 'bone';
    
    return undefined;
  }
  
  public getContactPoint(): [number, number, number] | undefined {
    // Detekcja punktu kontaktu na podstawie sił
    const forces = this.readForces();
    
    if (Math.abs(forces.tip.x) < 0.1 && 
        Math.abs(forces.tip.y) < 0.1 && 
        Math.abs(forces.tip.z) < 0.1) {
      return undefined; // Brak kontaktu
    }
    
    // Zakładamy kontakt na końcówce
    return this.currentState.tipPosition;
  }
  
  public async moveTo(
    position: [number, number, number],
    orientation: [number, number, number, number],
    jawAngle: number
  ): Promise<void> {
    // Ruch punkt-do-punktu z interpolacją
    const steps = 100;
    const startPos = this.currentState.tipPosition;
    const startOri = this.currentState.orientation;
    const startJaw = this.currentState.jawAngle || 0;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      
      // Interpolacja liniowa pozycji
      const interpPos: [number, number, number] = [
        startPos[0] + (position[0] - startPos[0]) * t,
        startPos[1] + (position[1] - startPos[1]) * t,
        startPos[2] + (position[2] - startPos[2]) * t
      ];
      
      // SLERP dla orientacji
      const interpOri = this.slerp(startOri, orientation, t);
      
      // Interpolacja szczęk
      const interpJaw = startJaw + (jawAngle - startJaw) * t;
      
      // Wykonaj krok
      this.execute({
        instrumentId: this.instrument.instrumentId,
        position: interpPos,
        orientation: interpOri,
        jawAngle: interpJaw,
        velocity: [0, 0, 0],
        buttonStates: {}
      });
      
      // Czekaj na wykonanie
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  private slerp(
    q1: [number, number, number, number],
    q2: [number, number, number, number],
    t: number
  ): [number, number, number, number] {
    // Spherical Linear Interpolation dla kwaternionów
    let dot = q1[0] * q2[0] + q1[1] * q2[1] + q1[2] * q2[2] + q1[3] * q2[3];
    
    // Jeśli kąt > 90°, idź krótszą drogą
    const q2Copy = [...q2] as [number, number, number, number];
    if (dot < 0) {
      q2Copy[0] = -q2Copy[0];
      q2Copy[1] = -q2Copy[1];
      q2Copy[2] = -q2Copy[2];
      q2Copy[3] = -q2Copy[3];
      dot = -dot;
    }
    
    // Dla małych kątów używaj interpolacji liniowej
    if (dot > 0.9995) {
      return [
        q1[0] + t * (q2Copy[0] - q1[0]),
        q1[1] + t * (q2Copy[1] - q1[1]),
        q1[2] + t * (q2Copy[2] - q1[2]),
        q1[3] + t * (q2Copy[3] - q1[3])
      ];
    }
    
    // SLERP
    const theta0 = Math.acos(dot);
    const theta = theta0 * t;
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);
    
    const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
    const s1 = sinTheta / sinTheta0;
    
    return [
      s0 * q1[0] + s1 * q2Copy[0],
      s0 * q1[1] + s1 * q2Copy[1],
      s0 * q1[2] + s1 * q2Copy[2],
      s0 * q1[3] + s1 * q2Copy[3]
    ];
  }
  
  public emergencyStop(): void {
    // Natychmiastowe zatrzymanie wszystkich silników
    this.motorDrivers.forEach(motor => motor.emergencyStop());
    
    // Zwolnij szczęki jeśli coś trzymają
    if (this.motorDrivers[6]) {
      this.motorDrivers[6].setTarget(0);
    }
    
    console.error(`Awaryjne zatrzymanie narzędzia ${this.instrument.instrumentId}`);
  }
}

/**
 * Sterownik silnika
 */
class MotorDriver {
  private motorId: number;
  private config: MotorConfig;
  private currentPosition: number = 0;
  private targetPosition: number = 0;
  private velocity: number = 0;
  private pidController: PIDController;
  
  constructor(motorId: number, config: MotorConfig) {
    this.motorId = motorId;
    this.config = config;
    
    // Konfiguracja PID dla precyzyjnej kontroli
    this.pidController = new PIDController({
      kp: 10,    // Proportional gain
      ki: 0.1,   // Integral gain
      kd: 0.5,   // Derivative gain
      outputLimits: [-config.maxVelocity, config.maxVelocity]
    });
  }
  
  public setTarget(position: number): void {
    this.targetPosition = position;
  }
  
  public getPosition(): number {
    return this.currentPosition;
  }
  
  public step(): void {
    // Oblicz błąd
    const error = this.targetPosition - this.currentPosition;
    
    // Kontrola PID
    const output = this.pidController.update(error);
    
    // Ograniczenie prędkości
    this.velocity = Math.max(
      -this.config.maxVelocity,
      Math.min(this.config.maxVelocity, output)
    );
    
    // Aktualizacja pozycji (symulacja)
    const dt = 0.001; // 1ms
    this.currentPosition += this.velocity * dt;
  }
  
  public async testRange(): Promise<{ success: boolean, error?: string }> {
    // Test zakresu ruchu
    try {
      // Ruch do limitu dolnego
      this.setTarget(-100);
      await this.waitForPosition(-100, 5000);
      
      // Ruch do limitu górnego
      this.setTarget(100);
      await this.waitForPosition(100, 5000);
      
      // Powrót do zera
      this.setTarget(0);
      await this.waitForPosition(0, 5000);
      
      return { success: true };
      
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  
  private async waitForPosition(target: number, timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (Math.abs(this.currentPosition - target) > 0.1) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for position');
      }
      
      this.step();
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
  
  public emergencyStop(): void {
    this.targetPosition = this.currentPosition;
    this.velocity = 0;
  }
}

/**
 * Sensor siły
 */
class ForceSensor {
  public location: string;
  private config: { range: number, resolution: number };
  private noiseLevel: number = 0.05; // 5% szumu
  
  constructor(location: string, config: { range: number, resolution: number }) {
    this.location = location;
    this.config = config;
  }
  
  public read(): number {
    // Symulacja odczytu z szumem
    const baseReading = Math.random() * 5; // 0-5N
    const noise = (Math.random() - 0.5) * this.noiseLevel;
    
    return Math.round((baseReading + noise) / this.config.resolution) * this.config.resolution;
  }
  
  public read6Axis(): number[] {
    // 6-osiowy odczyt [Fx, Fy, Fz, Tx, Ty, Tz]
    return [
      this.read(),
      this.read(),
      this.read(),
      this.read() * 0.1, // Momenty są mniejsze
      this.read() * 0.1,
      this.read() * 0.1
    ];
  }
}

/**
 * Kontroler PID
 */
class PIDController {
  private kp: number;
  private ki: number;
  private kd: number;
  private integral: number = 0;
  private previousError: number = 0;
  private outputLimits: [number, number];
  
  constructor(params: {
    kp: number,
    ki: number,
    kd: number,
    outputLimits: [number, number]
  }) {
    this.kp = params.kp;
    this.ki = params.ki;
    this.kd = params.kd;
    this.outputLimits = params.outputLimits;
  }
  
  public update(error: number): number {
    // Proportional term
    const P = this.kp * error;
    
    // Integral term
    this.integral += error;
    const I = this.ki * this.integral;
    
    // Derivative term
    const derivative = error - this.previousError;
    const D = this.kd * derivative;
    
    this.previousError = error;
    
    // Suma PID
    let output = P + I + D;
    
    // Ograniczenie wyjścia
    output = Math.max(this.outputLimits[0], Math.min(this.outputLimits[1], output));
    
    // Anti-windup
    if (output === this.outputLimits[0] || output === this.outputLimits[1]) {
      this.integral -= error; // Cofnij integrację jeśli saturacja
    }
    
    return output;
  }
  
  public reset(): void {
    this.integral = 0;
    this.previousError = 0;
  }
}

/**
 * Filtr drżenia ręki chirurga
 */
class TremorFilter {
  private history: MasterPosition[] = [];
  private historySize: number = 10;
  private cutoffFrequency: number = 10; // Hz
  
  public filter(position: MasterPosition): MasterPosition {
    // Dodaj do historii
    this.history.push(position);
    if (this.history.length > this.historySize) {
      this.history.shift();
    }
    
    // Dla pierwszych próbek zwróć bez filtrowania
    if (this.history.length < 3) {
      return position;
    }
    
    // Filtr dolnoprzepustowy Butterwortha
    const filtered = this.butterworthFilter(this.history);
    
    return filtered;
  }
  
  private butterworthFilter(data: MasterPosition[]): MasterPosition {
    // Parametry filtra Butterwortha 2. rzędu
    const dt = 0.001; // 1ms
    const RC = 1 / (2 * Math.PI * this.cutoffFrequency);
    const alpha = dt / (RC + dt);
    
    // Filtruj każdą oś osobno
    let filteredPos: [number, number, number] = [0, 0, 0];
    let filteredOri: [number, number, number, number] = [0, 0, 0, 1];
    let filteredGripper = 0;
    
    // Średnia ważona z historii
    for (let i = 0; i < 3; i++) {
      filteredPos[i] = alpha * data[data.length - 1].position[i] + 
                       (1 - alpha) * (data[data.length - 2]?.position[i] || 0);
    }
    
    // Dla orientacji używamy SLERP
    if (data.length >= 2) {
      const t = alpha;
      filteredOri = this.slerpQuaternion(
        data[data.length - 2].orientation,
        data[data.length - 1].orientation,
        t
      );
    } else {
      filteredOri = data[data.length - 1].orientation;
    }
    
    // Gripper
    filteredGripper = alpha * data[data.length - 1].gripper + 
                     (1 - alpha) * (data[data.length - 2]?.gripper || 0);
    
    return {
      manipulatorId: data[data.length - 1].manipulatorId,
      position: filteredPos,
      orientation: filteredOri,
      gripper: filteredGripper,
      buttons: data[data.length - 1].buttons
    };
  }
  
  private slerpQuaternion(
    q1: [number, number, number, number],
    q2: [number, number, number, number],
    t: number
  ): [number, number, number, number] {
    // Reużywamy implementację SLERP
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
      return [
        q1[0] + t * (q2Copy[0] - q1[0]),
        q1[1] + t * (q2Copy[1] - q1[1]),
        q1[2] + t * (q2Copy[2] - q1[2]),
        q1[3] + t * (q2Copy[3] - q1[3])
      ];
    }
    
    const theta0 = Math.acos(dot);
    const theta = theta0 * t;
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);
    
    const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
    const s1 = sinTheta / sinTheta0;
    
    return [
      s0 * q1[0] + s1 * q2Copy[0],
      s0 * q1[1] + s1 * q2Copy[1],
      s0 * q1[2] + s1 * q2Copy[2],
      s0 * q1[3] + s1 * q2Copy[3]
    ];
  }
}

/**
 * System bezpieczeństwa
 */
class SafetySystem {
  private config: DaVinciConfiguration;
  private violations: SafetyViolation[] = [];
  private maxViolations: number = 10;
  
  constructor(config: DaVinciConfiguration) {
    this.config = config;
  }
  
  public start(): void {
    console.log('System bezpieczeństwa aktywny');
    
    // Monitoruj parametry vitalne
    setInterval(() => this.checkVitals(), 100);
  }
  
  private checkVitals(): void {
    // Tu byłoby połączenie z monitorami pacjenta
    // Tętno, ciśnienie, saturacja, etc.
  }
  
  public reportError(instrumentId: string, error: any): void {
    const violation: SafetyViolation = {
      timestamp: Date.now(),
      instrumentId,
      type: 'error',
      severity: 'high',
      description: String(error)
    };
    
    this.violations.push(violation);
    
    // Sprawdź czy nie przekroczono limitu
    if (this.violations.length > this.maxViolations) {
      console.error('Przekroczono limit naruszeń bezpieczeństwa!');
      // Tu powinno być awaryjne zatrzymanie
    }
  }
}

// Interfejsy pomocnicze
interface MasterConsoleInterface {
  initialize(): Promise<void>;
  getSystemVersion(): Promise<string>;
  readManipulator(id: number): any;
  sendHaptic(id: number, signal: HapticSignal): void;
  disableAll(): void;
}

interface SystemState {
  IDLE: 'IDLE';
  READY: 'READY';
  OPERATING: 'OPERATING';
  ERROR: 'ERROR';
  EMERGENCY_STOP: 'EMERGENCY_STOP';
}

const SystemState: SystemState = {
  IDLE: 'IDLE',
  READY: 'READY',
  OPERATING: 'OPERATING',
  ERROR: 'ERROR',
  EMERGENCY_STOP: 'EMERGENCY_STOP'
};

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

interface SafetyViolation {
  timestamp: number;
  instrumentId: string;
  type: 'collision' | 'force-limit' | 'workspace' | 'error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

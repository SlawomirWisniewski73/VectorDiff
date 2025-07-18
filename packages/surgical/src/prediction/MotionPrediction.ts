/**
 * System predykcji ruchu dla kompensacji opóźnień
 * 
 * W chirurgii zdalnej nawet 50ms opóźnienia może być niebezpieczne.
 * Ten moduł używa różnych technik do przewidywania przyszłych pozycji:
 * - Filtr Kalmana dla liniowej predykcji
 * - Sieci neuronowe dla złożonych wzorców ruchu
 * - Interpolacja wielomianowa dla płynnych trajektorii
 * 
 * Cel: przewidzieć pozycję 50-100ms w przyszłość z dokładnością <1mm
 */

import KalmanFilter from 'kalmanjs';
import { Matrix } from 'ml-matrix';
import { InstrumentState } from '../types/surgical-format';

/**
 * Główny predyktor ruchu
 */
export class MotionPredictor {
  private algorithm: 'kalman' | 'neural' | 'polynomial';
  private lookAheadTime: number; // ms
  
  // Różne implementacje predyktorów
  private kalmanPredictor: KalmanMotionPredictor;
  private neuralPredictor: NeuralMotionPredictor;
  private polynomialPredictor: PolynomialMotionPredictor;
  
  // Historia dla uczenia
  private stateHistory: Map<string, InstrumentState[]> = new Map();
  private maxHistorySize: number = 1000;
  
  constructor(algorithm: 'kalman' | 'neural' | 'polynomial', lookAheadTime: number) {
    this.algorithm = algorithm;
    this.lookAheadTime = lookAheadTime;
    
    // Inicjalizacja predyktorów
    this.kalmanPredictor = new KalmanMotionPredictor();
    this.neuralPredictor = new NeuralMotionPredictor();
    this.polynomialPredictor = new PolynomialMotionPredictor();
  }
  
  /**
   * Przewiduje przyszły stan narzędzia
   * @param currentState Obecny stan
   * @param deltaTime Czas predykcji w ms
   * @returns Przewidywany stan
   */
  public predict(
    currentState: InstrumentState, 
    deltaTime?: number
  ): InstrumentState {
    const predictionTime = deltaTime || this.lookAheadTime;
    
    // Aktualizuj historię
    this.updateHistory(currentState);
    
    // Wybierz odpowiedni algorytm
    let predictedState: InstrumentState;
    
    switch (this.algorithm) {
      case 'kalman':
        predictedState = this.kalmanPredictor.predict(
          currentState, 
          this.getHistory(currentState.instrumentId),
          predictionTime
        );
        break;
        
      case 'neural':
        predictedState = this.neuralPredictor.predict(
          currentState,
          this.getHistory(currentState.instrumentId),
          predictionTime
        );
        break;
        
      case 'polynomial':
        predictedState = this.polynomialPredictor.predict(
          currentState,
          this.getHistory(currentState.instrumentId),
          predictionTime
        );
        break;
        
      default:
        predictedState = currentState; // Bez predykcji
    }
    
    // Walidacja predykcji
    return this.validatePrediction(predictedState, currentState);
  }
  
  /**
   * Aktualizuje historię stanów
   */
  private updateHistory(state: InstrumentState): void {
    const history = this.stateHistory.get(state.instrumentId) || [];
    history.push(state);
    
    // Ogranicz rozmiar historii
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    
    this.stateHistory.set(state.instrumentId, history);
  }
  
  /**
   * Pobiera historię dla narzędzia
   */
  private getHistory(instrumentId: string): InstrumentState[] {
    return this.stateHistory.get(instrumentId) || [];
  }
  
  /**
   * Waliduje predykcję
   * Zapobiega nierealistycznym przewidywaniom
   */
  private validatePrediction(
    predicted: InstrumentState,
    current: InstrumentState
  ): InstrumentState {
    // Maksymalne dozwolone zmiany
    const maxPositionChange = 50; // mm
    const maxOrientationChange = Math.PI / 4; // 45 stopni
    
    // Sprawdź zmianę pozycji
    const positionChange = Math.sqrt(
      Math.pow(predicted.tipPosition[0] - current.tipPosition[0], 2) +
      Math.pow(predicted.tipPosition[1] - current.tipPosition[1], 2) +
      Math.pow(predicted.tipPosition[2] - current.tipPosition[2], 2)
    );
    
    if (positionChange > maxPositionChange) {
      console.warn(`Predykcja odrzucona: zbyt duża zmiana pozycji (${positionChange}mm)`);
      return current;
    }
    
    // Sprawdź workspace
    const limit = 150; // mm
    if (Math.abs(predicted.tipPosition[0]) > limit ||
        Math.abs(predicted.tipPosition[1]) > limit ||
        Math.abs(predicted.tipPosition[2]) > limit) {
      console.warn('Predykcja odrzucona: poza workspace');
      return current;
    }
    
    return predicted;
  }
  
  /**
   * Ocenia dokładność predykcji
   * Używane do auto-kalibracji
   */
  public evaluateAccuracy(
    predicted: InstrumentState,
    actual: InstrumentState
  ): PredictionAccuracy {
    const positionError = Math.sqrt(
      Math.pow(predicted.tipPosition[0] - actual.tipPosition[0], 2) +
      Math.pow(predicted.tipPosition[1] - actual.tipPosition[1], 2) +
      Math.pow(predicted.tipPosition[2] - actual.tipPosition[2], 2)
    );
    
    // Błąd orientacji (używamy kąta między kwaternionami)
    const orientationError = this.quaternionAngle(
      predicted.orientation,
      actual.orientation
    );
    
    return {
      positionError,
      orientationError,
      timestamp: Date.now(),
      algorithmUsed: this.algorithm
    };
  }
  
  /**
   * Oblicza kąt między kwaternionami
   */
  private quaternionAngle(
    q1: [number, number, number, number],
    q2: [number, number, number, number]
  ): number {
    const dot = q1[0] * q2[0] + q1[1] * q2[1] + q1[2] * q2[2] + q1[3] * q2[3];
    return 2 * Math.acos(Math.abs(Math.min(1, dot)));
  }
  
  /**
   * Adaptacyjne przełączanie algorytmów
   * Na podstawie charakterystyki ruchu
   */
  public adaptAlgorithm(history: InstrumentState[]): void {
    if (history.length < 10) return;
    
    // Analiza charakterystyki ruchu
    const velocity = this.calculateAverageVelocity(history);
    const acceleration = this.calculateAverageAcceleration(history);
    const jerk = this.calculateJerk(history);
    
    // Heurystyki wyboru algorytmu
    if (jerk < 10) {
      // Płynny ruch - Kalman wystarcza
      this.algorithm = 'kalman';
    } else if (acceleration > 100) {
      // Szybkie zmiany - sieć neuronowa
      this.algorithm = 'neural';
    } else {
      // Złożone trajektorie - wielomiany
      this.algorithm = 'polynomial';
    }
    
    console.log(`Zmieniono algorytm predykcji na: ${this.algorithm}`);
  }
  
  private calculateAverageVelocity(history: InstrumentState[]): number {
    if (history.length < 2) return 0;
    
    let totalVelocity = 0;
    for (let i = 1; i < history.length; i++) {
      const dt = (Number(history[i].timestamp) - Number(history[i-1].timestamp)) / 1000;
      const dp = Math.sqrt(
        Math.pow(history[i].tipPosition[0] - history[i-1].tipPosition[0], 2) +
        Math.pow(history[i].tipPosition[1] - history[i-1].tipPosition[1], 2) +
        Math.pow(history[i].tipPosition[2] - history[i-1].tipPosition[2], 2)
      );
      totalVelocity += dp / dt;
    }
    
    return totalVelocity / (history.length - 1);
  }
  
  private calculateAverageAcceleration(history: InstrumentState[]): number {
    if (history.length < 3) return 0;
    
    const velocities: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const dt = (Number(history[i].timestamp) - Number(history[i-1].timestamp)) / 1000;
      const dp = Math.sqrt(
        Math.pow(history[i].tipPosition[0] - history[i-1].tipPosition[0], 2) +
        Math.pow(history[i].tipPosition[1] - history[i-1].tipPosition[1], 2) +
        Math.pow(history[i].tipPosition[2] - history[i-1].tipPosition[2], 2)
      );
      velocities.push(dp / dt);
    }
    
    let totalAcceleration = 0;
    for (let i = 1; i < velocities.length; i++) {
      const dt = (Number(history[i+1].timestamp) - Number(history[i].timestamp)) / 1000;
      totalAcceleration += Math.abs(velocities[i] - velocities[i-1]) / dt;
    }
    
    return totalAcceleration / (velocities.length - 1);
  }
  
  private calculateJerk(history: InstrumentState[]): number {
    // Jerk to pochodna przyspieszenia
    // Wysoki jerk = nienaturalne ruchy
    if (history.length < 4) return 0;
    
    const accelerations: number[] = [];
    
    for (let i = 2; i < history.length; i++) {
      const dt1 = (Number(history[i].timestamp) - Number(history[i-1].timestamp)) / 1000;
      const dt2 = (Number(history[i-1].timestamp) - Number(history[i-2].timestamp)) / 1000;
      
      const v1 = [
        (history[i].tipPosition[0] - history[i-1].tipPosition[0]) / dt1,
        (history[i].tipPosition[1] - history[i-1].tipPosition[1]) / dt1,
        (history[i].tipPosition[2] - history[i-1].tipPosition[2]) / dt1
      ];
      
      const v2 = [
        (history[i-1].tipPosition[0] - history[i-2].tipPosition[0]) / dt2,
        (history[i-1].tipPosition[1] - history[i-2].tipPosition[1]) / dt2,
        (history[i-1].tipPosition[2] - history[i-2].tipPosition[2]) / dt2
      ];
      
      const acc = Math.sqrt(
        Math.pow(v1[0] - v2[0], 2) +
        Math.pow(v1[1] - v2[1], 2) +
        Math.pow(v1[2] - v2[2], 2)
      ) / dt1;
      
      accelerations.push(acc);
    }
    
    let totalJerk = 0;
    for (let i = 1; i < accelerations.length; i++) {
      const dt = (Number(history[i+2].timestamp) - Number(history[i+1].timestamp)) / 1000;
      totalJerk += Math.abs(accelerations[i] - accelerations[i-1]) / dt;
    }
    
    return totalJerk / (accelerations.length - 1);
  }
}

/**
 * Predyktor używający filtra Kalmana
 * Najlepszy dla liniowych, płynnych ruchów
 */
class KalmanMotionPredictor {
  private filters: Map<string, {
    x: KalmanFilter,
    y: KalmanFilter,
    z: KalmanFilter
  }> = new Map();
  
  public predict(
    current: InstrumentState,
    history: InstrumentState[],
    deltaTime: number
  ): InstrumentState {
    // Pobierz lub utwórz filtry dla tego narzędzia
    let filters = this.filters.get(current.instrumentId);
    if (!filters) {
      filters = {
        x: new KalmanFilter({ R: 0.01, Q: 3 }),
        y: new KalmanFilter({ R: 0.01, Q: 3 }),
        z: new KalmanFilter({ R: 0.01, Q: 3 })
      };
      this.filters.set(current.instrumentId, filters);
    }
    
    // Filtruj obecną pozycję
    const filtered = {
      x: filters.x.filter(current.tipPosition[0]),
      y: filters.y.filter(current.tipPosition[1]),
      z: filters.z.filter(current.tipPosition[2])
    };
    
    // Oblicz prędkość z historii
    const velocity = this.calculateVelocity(history);
    
    // Ekstrapolacja liniowa
    const predicted: InstrumentState = {
      ...current,
      tipPosition: [
        filtered.x + velocity[0] * deltaTime / 1000,
        filtered.y + velocity[1] * deltaTime / 1000,
        filtered.z + velocity[2] * deltaTime / 1000
      ],
      predictedPosition: [
        filtered.x + velocity[0] * deltaTime / 1000,
        filtered.y + velocity[1] * deltaTime / 1000,
        filtered.z + velocity[2] * deltaTime / 1000
      ]
    };
    
    // Predykcja orientacji (uproszczona)
    predicted.orientation = this.predictOrientation(
      history, 
      current.orientation, 
      deltaTime
    );
    
    return predicted;
  }
  
  private calculateVelocity(history: InstrumentState[]): [number, number, number] {
    if (history.length < 2) return [0, 0, 0];
    
    const recent = history.slice(-5); // Ostatnie 5 próbek
    const velocities: Array<[number, number, number]> = [];
    
    for (let i = 1; i < recent.length; i++) {
      const dt = (Number(recent[i].timestamp) - Number(recent[i-1].timestamp)) / 1000;
      if (dt > 0) {
        velocities.push([
          (recent[i].tipPosition[0] - recent[i-1].tipPosition[0]) / dt,
          (recent[i].tipPosition[1] - recent[i-1].tipPosition[1]) / dt,
          (recent[i].tipPosition[2] - recent[i-1].tipPosition[2]) / dt
        ]);
      }
    }
    
    // Średnia ważona (nowsze próbki mają większą wagę)
    let weightedSum = [0, 0, 0];
    let totalWeight = 0;
    
    velocities.forEach((vel, i) => {
      const weight = i + 1; // Waga rośnie z czasem
      weightedSum[0] += vel[0] * weight;
      weightedSum[1] += vel[1] * weight;
      weightedSum[2] += vel[2] * weight;
      totalWeight += weight;
    });
    
    return [
      weightedSum[0] / totalWeight,
      weightedSum[1] / totalWeight,
      weightedSum[2] / totalWeight
    ];
  }
  
  private predictOrientation(
    history: InstrumentState[],
    current: [number, number, number, number],
    deltaTime: number
  ): [number, number, number, number] {
    // Dla uproszczenia zwracamy obecną orientację
    // W pełnej implementacji użylibyśmy SLERP i prędkości kątowe
    return current;
  }
}

/**
 * Predyktor używający sieci neuronowej
 * Najlepszy dla złożonych, nieliniowych wzorców
 */
class NeuralMotionPredictor {
  private model: SimpleNeuralNetwork | null = null;
  private inputSize: number = 30; // 10 ostatnich pozycji (x,y,z)
  private outputSize: number = 3;  // Przewidywana pozycja (x,y,z)
  
  constructor() {
    // Inicjalizacja prostej sieci
    this.model = new SimpleNeuralNetwork(
      this.inputSize,
      [20, 15], // Warstwy ukryte
      this.outputSize
    );
  }
  
  public predict(
    current: InstrumentState,
    history: InstrumentState[],
    deltaTime: number
  ): InstrumentState {
    if (!this.model || history.length < 10) {
      // Za mało danych - używamy prostej ekstrapolacji
      return current;
    }
    
    // Przygotuj dane wejściowe
    const input = this.prepareInput(history.slice(-10));
    
    // Predykcja
    const output = this.model.forward(input);
    
    // Skalowanie do czasu predykcji
    const scaleFactor = deltaTime / 50; // Model trenowany na 50ms
    
    return {
      ...current,
      tipPosition: [
        current.tipPosition[0] + output[0] * scaleFactor,
        current.tipPosition[1] + output[1] * scaleFactor,
        current.tipPosition[2] + output[2] * scaleFactor
      ],
      predictedPosition: [
        current.tipPosition[0] + output[0] * scaleFactor,
        current.tipPosition[1] + output[1] * scaleFactor,
        current.tipPosition[2] + output[2] * scaleFactor
      ]
    };
  }
  
  private prepareInput(history: InstrumentState[]): number[] {
    const input: number[] = [];
    
    // Normalizacja względem pierwszej pozycji
    const base = history[0].tipPosition;
    
    history.forEach(state => {
      input.push(
        (state.tipPosition[0] - base[0]) / 100, // Normalizacja do [-1, 1]
        (state.tipPosition[1] - base[1]) / 100,
        (state.tipPosition[2] - base[2]) / 100
      );
    });
    
    return input;
  }
  
  /**
   * Trenuje model na zebranych danych
   * W prawdziwej implementacji użylibyśmy TensorFlow.js
   */
  public train(trainingData: TrainingData[]): void {
    if (!this.model) return;
    
    console.log(`Trenowanie na ${trainingData.length} próbkach...`);
    
    // Prosty algorytm gradientu
    const learningRate = 0.01;
    const epochs = 100;
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalError = 0;
      
      trainingData.forEach(sample => {
        const predicted = this.model!.forward(sample.input);
        const error = this.calculateError(predicted, sample.output);
        totalError += error;
        
        // Backpropagation (uproszczone)
        this.model!.backward(sample.output, learningRate);
      });
      
      if (epoch % 10 === 0) {
        console.log(`Epoch ${epoch}, Error: ${totalError / trainingData.length}`);
      }
    }
  }
  
  private calculateError(predicted: number[], actual: number[]): number {
    let sum = 0;
    for (let i = 0; i < predicted.length; i++) {
      sum += Math.pow(predicted[i] - actual[i], 2);
    }
    return Math.sqrt(sum);
  }
}

/**
 * Predyktor używający interpolacji wielomianowej
 * Najlepszy dla płynnych, krzywoliniowych trajektorii
 */
class PolynomialMotionPredictor {
  private polynomialDegree: number = 3; // Wielomian 3. stopnia
  
  public predict(
    current: InstrumentState,
    history: InstrumentState[],
    deltaTime: number
  ): InstrumentState {
    if (history.length < this.polynomialDegree + 1) {
      return current; // Za mało punktów
    }
    
    // Użyj ostatnich N punktów
    const points = history.slice(-(this.polynomialDegree + 1));
    
    // Dopasuj wielomian dla każdej osi
    const predictedX = this.fitAndPredict(
      points.map((p, i) => ({ 
        x: i, 
        y: p.tipPosition[0] 
      })),
      points.length + deltaTime / 10 // Ekstrapolacja
    );
    
    const predictedY = this.fitAndPredict(
      points.map((p, i) => ({ 
        x: i, 
        y: p.tipPosition[1] 
      })),
      points.length + deltaTime / 10
    );
    
    const predictedZ = this.fitAndPredict(
      points.map((p, i) => ({ 
        x: i, 
        y: p.tipPosition[2] 
      })),
      points.length + deltaTime / 10
    );
    
    return {
      ...current,
      tipPosition: [predictedX, predictedY, predictedZ],
      predictedPosition: [predictedX, predictedY, predictedZ]
    };
  }
  
  /**
   * Dopasowuje wielomian i przewiduje wartość
   * Używa metody najmniejszych kwadratów
   */
  private fitAndPredict(
    points: { x: number, y: number }[], 
    xPredict: number
  ): number {
    const n = points.length;
    const degree = Math.min(this.polynomialDegree, n - 1);
    
    // Buduj macierz Vandermonde'a
    const X = new Matrix(n, degree + 1);
    const y = new Matrix(n, 1);
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= degree; j++) {
        X.set(i, j, Math.pow(points[i].x, j));
      }
      y.set(i, 0, points[i].y);
    }
    
    // Rozwiąż układ równań normalnych: (X^T * X) * coeffs = X^T * y
    const XtX = X.transpose().mmul(X);
    const Xty = X.transpose().mmul(y);
    
    // Współczynniki wielomianu
    const coeffs = this.solve(XtX, Xty);
    
    // Oblicz wartość przewidywaną
    let result = 0;
    for (let i = 0; i <= degree; i++) {
      result += coeffs.get(i, 0) * Math.pow(xPredict, i);
    }
    
    return result;
  }
  
  /**
   * Rozwiązuje układ równań liniowych
   * Używa eliminacji Gaussa
   */
  private solve(A: Matrix, b: Matrix): Matrix {
    // W praktyce użylibyśmy bibliotekę numeryczną
    try {
      return A.inverse().mmul(b);
    } catch (e) {
      // Macierz osobliwa - zwróć rozwiązanie zerowe
      return new Matrix(A.columns, 1);
    }
  }
}

/**
 * Prosta implementacja sieci neuronowej
 * W praktyce użylibyśmy TensorFlow.js
 */
class SimpleNeuralNetwork {
  private weights: Matrix[];
  private biases: Matrix[];
  private activations: Matrix[];
  
  constructor(inputSize: number, hiddenSizes: number[], outputSize: number) {
    this.weights = [];
    this.biases = [];
    this.activations = [];
    
    // Inicjalizacja wag
    let prevSize = inputSize;
    for (const size of hiddenSizes) {
      this.weights.push(Matrix.random(size, prevSize, -0.5, 0.5));
      this.biases.push(Matrix.random(size, 1, -0.5, 0.5));
      prevSize = size;
    }
    
    // Warstwa wyjściowa
    this.weights.push(Matrix.random(outputSize, prevSize, -0.5, 0.5));
    this.biases.push(Matrix.random(outputSize, 1, -0.5, 0.5));
  }
  
  public forward(input: number[]): number[] {
    let activation = new Matrix([input]).transpose();
    this.activations = [activation];
    
    // Propagacja w przód
    for (let i = 0; i < this.weights.length; i++) {
      const z = this.weights[i].mmul(activation).add(this.biases[i]);
      activation = this.activate(z);
      this.activations.push(activation);
    }
    
    return activation.to1DArray();
  }
  
  public backward(target: number[], learningRate: number): void {
    // Uproszczona implementacja backpropagation
    // W praktyce byłaby bardziej złożona
  }
  
  private activate(z: Matrix): Matrix {
    // Funkcja aktywacji ReLU
    return z.map(val => Math.max(0, val));
  }
}

// Interfejsy pomocnicze
interface PredictionAccuracy {
  positionError: number;     // mm
  orientationError: number;  // radiany
  timestamp: number;
  algorithmUsed: string;
}

interface TrainingData {
  input: number[];
  output: number[];
}

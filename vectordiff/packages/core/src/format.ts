/**
 * Definicje typów i interfejsów dla formatu VectorDiff
 */

// Główna struktura animacji VectorDiff
export interface VectorDiffAnimation {
  version: string;
  metadata: Metadata;
  baseScene: BaseScene;
  timeline: TimelineKeyframe[];
}

// Metadane animacji
export interface Metadata {
  author: string;
  creationDate: string;
  duration: number;
  [key: string]: any; // Rozszerzalne dla specyficznych zastosowań
}

// Scena bazowa zawierająca wszystkie obiekty
export interface BaseScene {
  canvas: Canvas;
  objects: VectorObject[];
}

// Wymiary płótna
export interface Canvas {
  width: number;
  height: number;
  depth?: number; // Opcjonalne dla 3D
}

// Obiekt wektorowy - bazowy interfejs
export interface VectorObject {
  id: string;
  type: "path" | "rect" | "ellipse" | "text" | "group" | string; // Rozszerzalne
  data: any;
  attributes: Attributes;
}

// Atrybuty obiektu
export interface Attributes {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  [key: string]: any;
}

// Klatka kluczowa na osi czasu
export interface TimelineKeyframe {
  timestamp: number;
  changes: ObjectChange[];
}

// Zmiana obiektu
export interface ObjectChange {
  objectId: string;
  transformation: Transformation;
}

// Typy transformacji
export type Transformation =
  | TranslateTransformation
  | RotateTransformation
  | ScaleTransformation
  | AffineTransformation;

// Transformacja przesunięcia
export interface TranslateTransformation {
  type: "translate";
  x: number;
  y: number;
  z?: number; // Opcjonalne dla 3D
}

// Transformacja obrotu
export interface RotateTransformation {
  type: "rotate";
  angle: number;
  centerX?: number;
  centerY?: number;
  centerZ?: number; // Opcjonalne dla 3D
  axis?: [number, number, number]; // Oś obrotu dla 3D
}

// Transformacja skalowania
export interface ScaleTransformation {
  type: "scale";
  scaleX: number;
  scaleY: number;
  scaleZ?: number; // Opcjonalne dla 3D
  centerX?: number;
  centerY?: number;
  centerZ?: number;
}

// Transformacja afiniczna
export interface AffineTransformation {
  type: "affine";
  matrix: number[]; // 6 elementów dla 2D, 16 dla 3D
}

// Wewnętrzna reprezentacja animacji w bibliotece
export interface Animation {
  width: number;
  height: number;
  depth?: number;
  objects: Map<string, VectorObject>;
  timeline: Map<number, ObjectChange[]>;
  duration: number;
}

// Funkcja pomocnicza do tworzenia pustej animacji
export function createEmptyAnimation(width: number, height: number, depth?: number): VectorDiffAnimation {
  return {
    version: "0.2", // Wersja 0.2 wspiera 3D
    metadata: {
      author: "VectorDiff Library",
      creationDate: new Date().toISOString(),
      duration: 0
    },
    baseScene: {
      canvas: {
        width,
        height,
        ...(depth !== undefined && { depth })
      },
      objects: []
    },
    timeline: [
      {
        timestamp: 0,
        changes: []
      }
    ]
  };
}

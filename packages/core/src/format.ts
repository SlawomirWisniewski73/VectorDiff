// packages/core/src/format.ts
// UWAGA: To jest poprawiona wersja pliku.

/**
 * =================================================================
 * ZMIANA KRYTYCZNA: Ustrukturyzowanie Danych Geometrycznych
 * =================================================================
 * * Powód zmiany:
 * Oryginalna implementacja przechowywała dane geometryczne (np. współrzędne x, y, promień)
 * w jednym polu tekstowym `data`. To podejście było niezwykle kruche, podatne na błędy
 * parsowania i uniemożliwiało spójne stosowanie transformacji.
 * * Wprowadzona poprawka:
 * 1. Zrezygnowano z pola `data` typu string na rzecz ustrukturyzowanych obiektów.
 * 2. Zdefiniowano dedykowane interfejsy dla każdego typu kształtu (np. `RectData`, `EllipseData`).
 * 3. Pole `VectorObject.data` jest teraz unią tych typów, co zapewnia bezpieczeństwo typów
 * i eliminuje potrzebę parsowania stringów.
 * * Korzyści:
 * - Bezpieczeństwo typów i autouzupełnianie kodu w IDE.
 * - Wyeliminowanie błędów parsowania.
 * - Umożliwienie spójnej i jednoznacznej logiki transformacji.
 */

// --- Nowe, ustrukturyzowane typy danych dla kształtów ---

export interface RectData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseData {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface PathData {
  d: string; // The 'd' attribute for SVG paths remains a string, as it's a complex mini-language.
}

export interface PolylineData {
  points: string; // Similar to path 'd', points are a standardized string format.
}

// Union type for all possible structured data formats
export type VectorObjectData = RectData | EllipseData | PathData | PolylineData;

// --- Zaktualizowany interfejs VectorObject ---

export interface VectorObject {
  id: string;
  type: 'rect' | 'ellipse' | 'path' | 'polyline' | 'group';
  
  // The 'data' field now holds structured geometric information.
  data: VectorObjectData | {}; // Empty object for groups

  // Attributes remain for styling and transformations.
  attributes: {
    fill?: string;
    stroke?: string;
    'stroke-width'?: number;
    transform?: string; // This will be the SOLE source of truth for transformations.
    [key: string]: any;
  };
  
  // Children for grouping objects.
  children?: VectorObject[];
}

// --- Zaktualizowany interfejs VectorDiff ---

export interface VectorDiff {
  version: string;
  baseScene: {
    objects: VectorObject[];
  };
  timeline: {
    [time: string]: {
      targetId: string;
      transformation: Transformation;
    }[];
  };
}

// --- Typy transformacji pozostają bez zmian ---

export type Transformation =
  | TranslateTransformation
  | RotateTransformation
  | ScaleTransformation
  | AffineTransformation;

export interface TranslateTransformation {
  type: 'translate';
  x: number;
  y: number;
}

export interface RotateTransformation {
  type: 'rotate';
  angle: number;
  centerX?: number;
  centerY?: number;
}

export interface ScaleTransformation {
  type: 'scale';
  sx: number;
  sy: number;
  centerX?: number;
  centerY?: number;
}

export interface AffineTransformation {
  type: 'affine';
  matrix: [number, number, number, number, number, number];
}

/**
 * Validates the structure of a VectorDiff object.
 * UWAGA: Ta funkcja powinna zostać rozbudowana o walidację
 * nowej, ustrukturyzowanej zawartości pola `data`.
 * @param diff The VectorDiff object to validate.
 * @returns True if the object is valid, otherwise throws an error.
 */
export function validateVectorDiff(diff: any): diff is VectorDiff {
  if (!diff.version || !diff.baseScene || !diff.timeline) {
    throw new Error('Invalid VectorDiff: Missing top-level properties.');
  }
  // TODO: Add more in-depth validation for the new structured data.
  // For example, check if a 'rect' object has 'x', 'y', 'width', 'height' in its data.
  return true;
}

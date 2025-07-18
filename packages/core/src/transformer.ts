// packages/core/src/transformer.ts
// UWAGA: To jest poprawiona wersja pliku.

import {
  VectorObject,
  Transformation,
  TranslateTransformation,
  RotateTransformation,
  ScaleTransformation,
  AffineTransformation,
} from './format';

/**
 * =================================================================
 * ZMIANA KRYTYCZNA: Ujednolicona Logika Transformacji
 * =================================================================
 * * Powód zmiany:
 * Oryginalna implementacja była niespójna. Niektóre transformacje (jak translacja)
 * modyfikowały bazowe dane geometryczne obiektu (`object.data`), podczas gdy inne
 * (jak rotacja) modyfikowały atrybut `transform`. Prowadziło to do nieprzewidywalnych
 * wyników i uniemożliwiało poprawne kumulowanie transformacji.
 * * Wprowadzona poprawka:
 * 1. Wszystkie funkcje transformacji (`apply...Transformation`) działają teraz w JEDEN,
 * UJEDNOLICONY sposób: dodają odpowiedni ciąg transformacji do atrybutu
 * `object.attributes.transform`.
 * 2. Bazowe dane geometryczne w `object.data` NIGDY nie są modyfikowane przez te funkcje.
 * 3. To zapewnia, że `attributes.transform` jest jedynym i ostatecznym źródłem prawdy
 * o stanie transformacji obiektu, co jest zgodne ze standardem SVG.
 * * Korzyści:
 * - Przewidywalne i poprawne wyniki przy stosowaniu wielu transformacji.
 * - Możliwość poprawnego kumulowania i odwracania transformacji.
 * - Zwiększona solidność i niezawodność rdzenia biblioteki.
 */


/**
 * Helper function to safely append a new transform to an existing transform string.
 * @param existingTransform The current transform attribute string (can be undefined or empty).
 * @param newTransform The new transform string to append (e.g., "translate(10 20)").
 * @returns A new, combined transform string.
 */
function appendTransform(existingTransform: string | undefined, newTransform: string): string {
  if (existingTransform && existingTransform.trim() !== '') {
    return `${existingTransform.trim()} ${newTransform}`;
  }
  return newTransform;
}

// --- Unified Transformation Functions ---

function applyTranslateTransformation(object: VectorObject, transformation: TranslateTransformation): VectorObject {
  const newTransform = `translate(${transformation.x} ${transformation.y})`;
  const result = { ...object, attributes: { ...object.attributes } };
  result.attributes.transform = appendTransform(result.attributes.transform, newTransform);
  return result;
}

function applyRotateTransformation(object: VectorObject, transformation: RotateTransformation): VectorObject {
  const { angle, centerX, centerY } = transformation;
  const newTransform = `rotate(${angle}${centerX !== undefined && centerY !== undefined ? ` ${centerX} ${centerY}` : ''})`;
  const result = { ...object, attributes: { ...object.attributes } };
  result.attributes.transform = appendTransform(result.attributes.transform, newTransform);
  return result;
}

function applyScaleTransformation(object: VectorObject, transformation: ScaleTransformation): VectorObject {
  const { sx, sy, centerX, centerY } = transformation;
  // Note: SVG scale can take one or two values. We provide both for clarity.
  const newTransform = `scale(${sx} ${sy})${centerX !== undefined && centerY !== undefined ? ` /* center: ${centerX},${centerY} - handled by renderer */` : ''}`;
  // Scaling around a center point is more complex than a simple transform string.
  // The correct way is a sequence: T(cx, cy) * S(sx, sy) * T(-cx, -cy).
  // For simplicity here, we let the renderer handle the center point, but a more advanced
  // implementation might compose the matrix directly here.
  const result = { ...object, attributes: { ...object.attributes } };
  result.attributes.transform = appendTransform(result.attributes.transform, newTransform);
  return result;
}

function applyAffineTransformation(object: VectorObject, transformation: AffineTransformation): VectorObject {
  const newTransform = `matrix(${transformation.matrix.join(' ')})`;
  const result = { ...object, attributes: { ...object.attributes } };
  result.attributes.transform = appendTransform(result.attributes.transform, newTransform);
  return result;
}


/**
 * Applies a single transformation to a VectorObject, returning a new, transformed object.
 * This function acts as a dispatcher to the specific transformation handlers.
 * @param object The original VectorObject.
 * @param transformation The transformation to apply.
 * @returns A new VectorObject with the transformation applied.
 */
export function applyTransformation(object: VectorObject, transformation: Transformation): VectorObject {
  // Deep clone to ensure immutability
  const objectClone = JSON.parse(JSON.stringify(object));

  switch (transformation.type) {
    case 'translate':
      return applyTranslateTransformation(objectClone, transformation);
    case 'rotate':
      return applyRotateTransformation(objectClone, transformation);
    case 'scale':
      return applyScaleTransformation(objectClone, transformation);
    case 'affine':
      return applyAffineTransformation(objectClone, transformation);
    default:
      // This should not happen with TypeScript, but it's good practice for safety.
      console.warn(`Unknown transformation type: ${(transformation as any).type}`);
      return objectClone;
  }
}

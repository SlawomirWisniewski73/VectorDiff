import {
  VectorObject,
  Transformation,
  TranslateTransformation,
  RotateTransformation,
  ScaleTransformation,
  AffineTransformation
} from './format';

export function applyTransformation(object: VectorObject, transformation: Transformation): VectorObject {
  const result: VectorObject = {
    ...object,
    data: typeof object.data === 'object' ? { ...object.data } : object.data,
    attributes: { ...object.attributes }
  };
  if (!result.attributes.transform) {
    result.attributes.transform = '';
  }
  switch (transformation.type) {
    case 'translate':
      result.attributes.transform = appendTransform(result.attributes.transform, `translate(${transformation.x} ${transformation.y})`);
      break;
    case 'rotate':
      result.attributes.transform = appendTransform(result.attributes.transform, `rotate(${transformation.angle} ${transformation.centerX || 0} ${transformation.centerY || 0})`);
      break;
    case 'scale':
      // POPRAWKA: Używamy scaleX i scaleY
      result.attributes.transform = appendTransform(result.attributes.transform, `scale(${transformation.scaleX} ${transformation.scaleY})`);
      break;
    case 'affine':
      result.attributes.transform = appendTransform(result.attributes.transform, `matrix(${transformation.matrix.join(' ')})`);
      break;
  }
  return result;
}

function appendTransform(existing: string, newTransform: string): string {
  return existing ? `${existing} ${newTransform}` : newTransform;
}

// POPRAWKA: Dodajemy słowo kluczowe 'export'
export function detectTransformation(prevObject: VectorObject, currentObject: VectorObject): Transformation | null {
  // Placeholder implementation
  return null;
}

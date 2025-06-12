/**
 * Parser i walidator formatu VectorDiff
 * Ten moduł odpowiada za bezpieczne parsowanie i walidację danych
 */

import { VectorDiffAnimation, Animation, VectorObject, ObjectChange } from './format';

/**
 * Waliduje format VectorDiff
 * Sprawdza strukturę danych i poprawność typów
 * @param data Dane do walidacji
 * @returns Czy dane są poprawnym formatem VectorDiff
 */
export function validateVectorDiff(data: any): boolean {
  // Podstawowa walidacja struktury
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Sprawdzenie wymaganych pól głównych
  if (!data.version || !data.baseScene || !data.timeline) {
    return false;
  }

  // Walidacja wersji - wspieramy 0.1 (2D) i 0.2 (3D)
  if (!['0.1', '0.2'].includes(data.version)) {
    console.warn(`Nieznana wersja formatu: ${data.version}`);
  }

  // Sprawdzenie baseScene
  if (!data.baseScene.canvas || 
      typeof data.baseScene.canvas.width !== 'number' ||
      typeof data.baseScene.canvas.height !== 'number') {
    return false;
  }

  // Dla wersji 0.2 sprawdzamy także głębokość
  if (data.version === '0.2' && data.baseScene.canvas.depth !== undefined &&
      typeof data.baseScene.canvas.depth !== 'number') {
    return false;
  }

  // Sprawdzenie objects
  if (!Array.isArray(data.baseScene.objects)) {
    return false;
  }

  // Sprawdzenie timeline
  if (!Array.isArray(data.timeline)) {
    return false;
  }

  // Sprawdzenie unikalności identyfikatorów obiektów
  const objectIds = new Set<string>();
  for (const obj of data.baseScene.objects) {
    if (!obj.id || !obj.type || objectIds.has(obj.id)) {
      return false;
    }
    objectIds.add(obj.id);
  }

  // Sprawdzenie poprawności klatek czasowych
  for (const keyframe of data.timeline) {
    if (typeof keyframe.timestamp !== 'number' || !Array.isArray(keyframe.changes)) {
      return false;
    }

    // Sprawdzenie poprawności zmian
    for (const change of keyframe.changes) {
      if (!change.objectId || !objectIds.has(change.objectId) || !change.transformation) {
        return false;
      }

      // Sprawdzenie poprawności transformacji
      if (!validateTransformation(change.transformation, data.version)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Waliduje pojedynczą transformację
 * @param transformation Transformacja do sprawdzenia
 * @param version Wersja formatu (wpływa na obsługę 3D)
 * @returns Czy transformacja jest poprawna
 */
function validateTransformation(transformation: any, version: string): boolean {
  if (!transformation.type) {
    return false;
  }

  switch (transformation.type) {
    case 'translate':
      if (typeof transformation.x !== 'number' || typeof transformation.y !== 'number') {
        return false;
      }
      // Dla wersji 0.2 opcjonalnie sprawdzamy z
      if (version === '0.2' && transformation.z !== undefined && 
          typeof transformation.z !== 'number') {
        return false;
      }
      break;

    case 'rotate':
      if (typeof transformation.angle !== 'number') {
        return false;
      }
      // Dla wersji 0.2 sprawdzamy opcjonalną oś obrotu
      if (version === '0.2' && transformation.axis !== undefined &&
          (!Array.isArray(transformation.axis) || transformation.axis.length !== 3)) {
        return false;
      }
      break;

    case 'scale':
      if (typeof transformation.scaleX !== 'number' || typeof transformation.scaleY !== 'number') {
        return false;
      }
      // Dla wersji 0.2 opcjonalnie sprawdzamy scaleZ
      if (version === '0.2' && transformation.scaleZ !== undefined &&
          typeof transformation.scaleZ !== 'number') {
        return false;
      }
      break;

    case 'affine':
      if (!Array.isArray(transformation.matrix)) {
        return false;
      }
      // Macierz 2D ma 6 elementów, 3D ma 16
      const expectedLength = version === '0.2' && transformation.matrix.length === 16 ? 16 : 6;
      if (transformation.matrix.length !== expectedLength) {
        return false;
      }
      // Sprawdzenie czy wszystkie elementy to liczby
      for (const value of transformation.matrix) {
        if (typeof value !== 'number') {
          return false;
        }
      }
      break;

    default:
      // Nieznany typ transformacji - może być rozszerzenie
      console.warn(`Nieznany typ transformacji: ${transformation.type}`);
      return true; // Pozwalamy na rozszerzenia
  }

  return true;
}

/**
 * Parsuje string JSON do formatu VectorDiff
 * @param jsonString String JSON do sparsowania
 * @returns Sparsowany obiekt VectorDiffAnimation
 * @throws Error jeśli parsowanie się nie powiedzie
 */
export function parseVectorDiff(jsonString: string): VectorDiffAnimation {
  try {
    const data = JSON.parse(jsonString);
    
    if (!validateVectorDiff(data)) {
      throw new Error('Invalid VectorDiff format');
    }
    
    return data as VectorDiffAnimation;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse JSON: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Serializuje format VectorDiff do JSON
 * @param animation Animacja VectorDiff
 * @param pretty Czy formatować JSON (domyślnie tak)
 * @returns String JSON
 */
export function serializeVectorDiff(animation: VectorDiffAnimation, pretty: boolean = true): string {
  // Sprawdzenie poprawności przed serializacją
  if (!validateVectorDiff(animation)) {
    throw new Error('Invalid VectorDiff animation object');
  }
  
  return JSON.stringify(animation, null, pretty ? 2 : 0);
}

/**
 * Konwertuje format VectorDiff na wewnętrzną reprezentację animacji
 * Ta funkcja jest używana wewnętrznie przez bibliotekę do optymalizacji
 * @param data Dane w formacie VectorDiff
 * @returns Wewnętrzna reprezentacja animacji
 */
export function vectorDiffToAnimation(data: VectorDiffAnimation): Animation {
  const animation: Animation = {
    width: data.baseScene.canvas.width,
    height: data.baseScene.canvas.height,
    depth: data.baseScene.canvas.depth,
    objects: new Map(),
    timeline: new Map(),
    duration: data.metadata.duration
  };

  // Konwersja obiektów do Map dla szybszego dostępu
  for (const obj of data.baseScene.objects) {
    animation.objects.set(obj.id, { ...obj });
  }

  // Konwersja timeline do Map dla efektywnego wyszukiwania
  for (const keyframe of data.timeline) {
    animation.timeline.set(keyframe.timestamp, [...keyframe.changes]);
  }

  return animation;
}

/**
 * Konwertuje wewnętrzną reprezentację animacji na format VectorDiff
 * @param animation Wewnętrzna reprezentacja animacji
 * @returns Dane w formacie VectorDiff
 */
export function animationToVectorDiff(animation: Animation): VectorDiffAnimation {
  // Określenie wersji na podstawie obecności głębokości
  const version = animation.depth !== undefined ? '0.2' : '0.1';
  
  const result: VectorDiffAnimation = {
    version,
    metadata: {
      author: 'VectorDiff Library',
      creationDate: new Date().toISOString(),
      duration: animation.duration
    },
    baseScene: {
      canvas: {
        width: animation.width,
        height: animation.height,
        ...(animation.depth !== undefined && { depth: animation.depth })
      },
      objects: Array.from(animation.objects.values())
    },
    timeline: Array.from(animation.timeline.entries())
      .map(([timestamp, changes]) => ({
        timestamp,
        changes: [...changes]
      }))
      .sort((a, b) => a.timestamp - b.timestamp) // Sortujemy dla przewidywalności
  };

  return result;
}

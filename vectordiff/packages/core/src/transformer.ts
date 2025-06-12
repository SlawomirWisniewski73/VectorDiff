/**
 * Transformacje obiektów wektorowych
 * Ten moduł implementuje wszystkie rodzaje transformacji geometrycznych
 */

import { 
  VectorObject, 
  Transformation, 
  TranslateTransformation, 
  RotateTransformation, 
  ScaleTransformation, 
  AffineTransformation 
} from './format';

/**
 * Stosuje transformację do obiektu wektorowego
 * Zwraca nowy obiekt bez modyfikacji oryginału (immutable)
 * @param object Obiekt wektorowy
 * @param transformation Transformacja do zastosowania
 * @returns Nowy obiekt wektorowy po zastosowaniu transformacji
 */
export function applyTransformation(object: VectorObject, transformation: Transformation): VectorObject {
  // Klonowanie obiektu dla zachowania niemutowalności
  const result: VectorObject = {
    ...object,
    data: typeof object.data === 'object' ? { ...object.data } : object.data,
    attributes: { ...object.attributes }
  };

  // Inicjalizacja atrybutu transform jeśli nie istnieje
  if (!result.attributes.transform) {
    result.attributes.transform = '';
  }

  // Stosowanie transformacji w zależności od typu
  switch (transformation.type) {
    case 'translate':
      return applyTranslateTransformation(result, transformation);
    case 'rotate':
      return applyRotateTransformation(result, transformation);
    case 'scale':
      return applyScaleTransformation(result, transformation);
    case 'affine':
      return applyAffineTransformation(result, transformation);
    default:
      console.warn(`Nieobsługiwany typ transformacji: ${(transformation as any).type}`);
      return result;
  }
}

/**
 * Stosuje transformację przesunięcia
 * @param object Obiekt wektorowy
 * @param transformation Transformacja przesunięcia
 * @returns Nowy obiekt wektorowy po przesunięciu
 */
function applyTranslateTransformation(
  object: VectorObject, 
  transformation: TranslateTransformation
): VectorObject {
  const result = { ...object };
  
  // Dla obiektów z danymi pozycyjnymi, aktualizujemy dane
  if (typeof object.data === 'string') {
    switch (object.type) {
      case 'rect':
        // Parsowanie i aktualizacja współrzędnych prostokąta
        const rectMatch = object.data.match(/x=([\d.-]+)\s+y=([\d.-]+)\s+width=([\d.-]+)\s+height=([\d.-]+)/);
        if (rectMatch) {
          const x = parseFloat(rectMatch[1]) + transformation.x;
          const y = parseFloat(rectMatch[2]) + transformation.y;
          result.data = `x=${x} y=${y} width=${rectMatch[3]} height=${rectMatch[4]}`;
        }
        break;
        
      case 'ellipse':
        // Parsowanie i aktualizacja środka elipsy
        const ellipseMatch = object.data.match(/cx=([\d.-]+)\s+cy=([\d.-]+)\s+rx=([\d.-]+)\s+ry=([\d.-]+)/);
        if (ellipseMatch) {
          const cx = parseFloat(ellipseMatch[1]) + transformation.x;
          const cy = parseFloat(ellipseMatch[2]) + transformation.y;
          result.data = `cx=${cx} cy=${cy} rx=${ellipseMatch[3]} ry=${ellipseMatch[4]}`;
        }
        break;
        
      case 'path':
        // Dla ścieżki SVG używamy transformacji CSS/SVG
        result.attributes.transform = appendTransform(
          result.attributes.transform || '',
          `translate(${transformation.x} ${transformation.y}${
            transformation.z !== undefined ? ` ${transformation.z}` : ''
          })`
        );
        break;
        
      default:
        // Dla innych typów używamy transformacji atrybutu
        result.attributes.transform = appendTransform(
          result.attributes.transform || '',
          `translate(${transformation.x} ${transformation.y}${
            transformation.z !== undefined ? ` ${transformation.z}` : ''
          })`
        );
    }
  }
  
  return result;
}

/**
 * Stosuje transformację obrotu
 * @param object Obiekt wektorowy
 * @param transformation Transformacja obrotu
 * @returns Nowy obiekt wektorowy po obrocie
 */
function applyRotateTransformation(
  object: VectorObject, 
  transformation: RotateTransformation
): VectorObject {
  const result = { ...object };
  
  // Przygotowanie parametrów obrotu
  let rotateString = `rotate(${transformation.angle}`;
  
  // Dodanie centrum obrotu jeśli określone
  if (transformation.centerX !== undefined && transformation.centerY !== undefined) {
    rotateString += ` ${transformation.centerX} ${transformation.centerY}`;
    if (transformation.centerZ !== undefined) {
      rotateString += ` ${transformation.centerZ}`;
    }
  }
  
  rotateString += ')';
  
  // Aplikacja transformacji
  result.attributes.transform = appendTransform(
    result.attributes.transform || '',
    rotateString
  );
  
  return result;
}

/**
 * Stosuje transformację skalowania
 * @param object Obiekt wektorowy
 * @param transformation Transformacja skalowania
 * @returns Nowy obiekt wektorowy po skalowaniu
 */
function applyScaleTransformation(
  object: VectorObject, 
  transformation: ScaleTransformation
): VectorObject {
  const result = { ...object };
  
  // Budowanie transformacji skalowania
  let scaleTransform = '';
  
  // Jeśli określono centrum, musimy przesunąć, skalować i przesunąć z powrotem
  if (transformation.centerX !== undefined && transformation.centerY !== undefined) {
    const cx = transformation.centerX;
    const cy = transformation.centerY;
    const cz = transformation.centerZ || 0;
    
    scaleTransform = `translate(${cx} ${cy}${transformation.centerZ !== undefined ? ` ${cz}` : ''}) `;
    scaleTransform += `scale(${transformation.scaleX} ${transformation.scaleY}${
      transformation.scaleZ !== undefined ? ` ${transformation.scaleZ}` : ''
    }) `;
    scaleTransform += `translate(${-cx} ${-cy}${transformation.centerZ !== undefined ? ` ${-cz}` : ''})`;
  } else {
    scaleTransform = `scale(${transformation.scaleX} ${transformation.scaleY}${
      transformation.scaleZ !== undefined ? ` ${transformation.scaleZ}` : ''
    })`;
  }
  
  result.attributes.transform = appendTransform(
    result.attributes.transform || '',
    scaleTransform
  );
  
  return result;
}

/**
 * Stosuje transformację afiniczną
 * @param object Obiekt wektorowy
 * @param transformation Transformacja afiniczna
 * @returns Nowy obiekt wektorowy po transformacji afinicznej
 */
function applyAffineTransformation(
  object: VectorObject, 
  transformation: AffineTransformation
): VectorObject {
  const result = { ...object };
  
  // Formatowanie macierzy dla SVG
  let matrixString: string;
  
  if (transformation.matrix.length === 6) {
    // Macierz 2D
    matrixString = `matrix(${transformation.matrix.join(' ')})`;
  } else if (transformation.matrix.length === 16) {
    // Macierz 3D - używamy matrix3d
    matrixString = `matrix3d(${transformation.matrix.join(' ')})`;
  } else {
    console.error(`Nieprawidłowa długość macierzy: ${transformation.matrix.length}`);
    return result;
  }
  
  result.attributes.transform = appendTransform(
    result.attributes.transform || '',
    matrixString
  );
  
  return result;
}

/**
 * Pomocnicza funkcja do łączenia transformacji
 * Zapewnia poprawne odstępy między transformacjami
 * @param existing Istniejący string transformacji
 * @param newTransform Nowa transformacja do dodania
 * @returns Połączony string transformacji
 */
function appendTransform(existing: string, newTransform: string): string {
  return existing ? `${existing} ${newTransform}` : newTransform;
}

/**
 * Wykrywa transformację między dwoma stanami obiektu
 * Używane do automatycznego generowania animacji
 * @param prevObject Poprzedni stan obiektu
 * @param currentObject Bieżący stan obiektu
 * @returns Wykryta transformacja lub null jeśli nie wykryto zmiany
 */
export function detectTransformation(
  prevObject: VectorObject, 
  currentObject: VectorObject
): Transformation | null {
  // Sprawdzamy czy obiekty mają ten sam typ i ID
  if (prevObject.type !== currentObject.type || prevObject.id !== currentObject.id) {
    return null;
  }

  // Próbujemy wykryć różne typy transformacji
  const translation = detectTranslation(prevObject, currentObject);
  if (translation) {
    return translation;
  }

  const rotation = detectRotation(prevObject, currentObject);
  if (rotation) {
    return rotation;
  }

  const scaling = detectScaling(prevObject, currentObject);
  if (scaling) {
    return scaling;
  }

  // Jeśli nie wykryto prostej transformacji, możemy spróbować
  // obliczyć ogólną transformację afiniczną
  // (To wymaga bardziej zaawansowanej implementacji)
  
  return null;
}

/**
 * Wykrywa transformację przesunięcia
 * @param prevObject Poprzedni stan
 * @param currentObject Obecny stan
 * @returns Transformacja przesunięcia lub null
 */
function detectTranslation(
  prevObject: VectorObject, 
  currentObject: VectorObject
): TranslateTransformation | null {
  // Implementacja zależy od typu obiektu
  if (typeof prevObject.data === 'string' && typeof currentObject.data === 'string') {
    switch (prevObject.type) {
      case 'rect': {
        const prevMatch = prevObject.data.match(/x=([\d.-]+)\s+y=([\d.-]+)/);
        const currMatch = currentObject.data.match(/x=([\d.-]+)\s+y=([\d.-]+)/);
        
        if (prevMatch && currMatch) {
          const dx = parseFloat(currMatch[1]) - parseFloat(prevMatch[1]);
          const dy = parseFloat(currMatch[2]) - parseFloat(prevMatch[2]);
          
          if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
            return {
              type: 'translate',
              x: dx,
              y: dy
            };
          }
        }
        break;
      }
      
      case 'ellipse': {
        const prevMatch = prevObject.data.match(/cx=([\d.-]+)\s+cy=([\d.-]+)/);
        const currMatch = currentObject.data.match(/cx=([\d.-]+)\s+cy=([\d.-]+)/);
        
        if (prevMatch && currMatch) {
          const dx = parseFloat(currMatch[1]) - parseFloat(prevMatch[1]);
          const dy = parseFloat(currMatch[2]) - parseFloat(prevMatch[2]);
          
          if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
            return {
              type: 'translate',
              x: dx,
              y: dy
            };
          }
        }
        break;
      }
    }
  }
  
  return null;
}

/**
 * Wykrywa transformację obrotu
 * @param prevObject Poprzedni stan
 * @param currentObject Obecny stan
 * @returns Transformacja obrotu lub null
 */
function detectRotation(
  prevObject: VectorObject, 
  currentObject: VectorObject
): RotateTransformation | null {
  // Ta implementacja wymaga analizy atrybutów transform
  // lub porównania orientacji obiektów
  // Zostawiam jako szkielet do rozbudowy
  return null;
}

/**
 * Wykrywa transformację skalowania
 * @param prevObject Poprzedni stan
 * @param currentObject Obecny stan
 * @returns Transformacja skalowania lub null
 */
function detectScaling(
  prevObject: VectorObject, 
  currentObject: VectorObject
): ScaleTransformation | null {
  if (typeof prevObject.data === 'string' && typeof currentObject.data === 'string') {
    switch (prevObject.type) {
      case 'rect': {
        const prevMatch = prevObject.data.match(/width=([\d.-]+)\s+height=([\d.-]+)/);
        const currMatch = currentObject.data.match(/width=([\d.-]+)\s+height=([\d.-]+)/);
        
        if (prevMatch && currMatch) {
          const prevWidth = parseFloat(prevMatch[1]);
          const prevHeight = parseFloat(prevMatch[2]);
          const currWidth = parseFloat(currMatch[1]);
          const currHeight = parseFloat(currMatch[2]);
          
          const scaleX = currWidth / prevWidth;
          const scaleY = currHeight / prevHeight;
          
          if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001) {
            return {
              type: 'scale',
              scaleX,
              scaleY
            };
          }
        }
        break;
      }
      
      case 'ellipse': {
        const prevMatch = prevObject.data.match(/rx=([\d.-]+)\s+ry=([\d.-]+)/);
        const currMatch = currentObject.data.match(/rx=([\d.-]+)\s+ry=([\d.-]+)/);
        
        if (prevMatch && currMatch) {
          const prevRx = parseFloat(prevMatch[1]);
          const prevRy = parseFloat(prevMatch[2]);
          const currRx = parseFloat(currMatch[1]);
          const currRy = parseFloat(currMatch[2]);
          
          const scaleX = currRx / prevRx;
          const scaleY = currRy / prevRy;
          
          if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001) {
            return {
              type: 'scale',
              scaleX,
              scaleY
            };
          }
        }
        break;
      }
    }
  }
  
  return null;
}

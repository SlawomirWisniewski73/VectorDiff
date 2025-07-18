/**
 * Eksport i import formatu VectorDiff
 * Ten moduł zapewnia API wysokiego poziomu do tworzenia animacji
 */

import { 
  VectorDiffAnimation, 
  Animation, 
  VectorObject, 
  Attributes,
  Transformation,
  createEmptyAnimation 
} from './format';
import { 
  animationToVectorDiff, 
  vectorDiffToAnimation, 
  parseVectorDiff, 
  serializeVectorDiff 
} from './parser';

/**
 * Tworzy nową animację
 * @param width Szerokość płótna
 * @param height Wysokość płótna
 * @param depth Opcjonalna głębokość dla animacji 3D
 * @returns Obiekt animacji gotowy do manipulacji
 */
export function createAnimation(width: number, height: number, depth?: number): Animation {
  return {
    width,
    height,
    depth,
    objects: new Map<string, VectorObject>(),
    timeline: new Map<number, any[]>(),
    duration: 0
  };
}

/**
 * Dodaje obiekt ścieżki do animacji
 * Ścieżki są najbardziej elastycznym typem obiektu wektorowego
 * @param animation Obiekt animacji
 * @param path Dane ścieżki SVG (format d="...")
 * @param attributes Atrybuty wizualne obiektu
 * @returns Identyfikator utworzonego obiektu
 */
export function addPath(
  animation: Animation, 
  path: string, 
  attributes: Attributes = {}
): string {
  const id = generateObjectId(animation);
  const object: VectorObject = {
    id,
    type: 'path',
    data: path,
    attributes
  };
  
  animation.objects.set(id, object);
  return id;
}

/**
 * Dodaje obiekt prostokąta do animacji
 * @param animation Obiekt animacji
 * @param x Współrzędna X lewego górnego rogu
 * @param y Współrzędna Y lewego górnego rogu
 * @param width Szerokość prostokąta
 * @param height Wysokość prostokąta
 * @param attributes Atrybuty wizualne
 * @returns Identyfikator utworzonego obiektu
 */
export function addRectangle(
  animation: Animation, 
  x: number, 
  y: number, 
  width: number, 
  height: number, 
  attributes: Attributes = {}
): string {
  const id = generateObjectId(animation);
  const object: VectorObject = {
    id,
    type: 'rect',
    data: `x=${x} y=${y} width=${width} height=${height}`,
    attributes
  };
  
  animation.objects.set(id, object);
  return id;
}

/**
 * Dodaje obiekt elipsy do animacji
 * @param animation Obiekt animacji
 * @param cx Współrzędna X środka
 * @param cy Współrzędna Y środka
 * @param rx Promień X (poziomy)
 * @param ry Promień Y (pionowy)
 * @param attributes Atrybuty wizualne
 * @returns Identyfikator utworzonego obiektu
 */
export function addEllipse(
  animation: Animation, 
  cx: number, 
  cy: number, 
  rx: number, 
  ry: number, 
  attributes: Attributes = {}
): string {
  const id = generateObjectId(animation);
  const object: VectorObject = {
    id,
    type: 'ellipse',
    data: `cx=${cx} cy=${cy} rx=${rx} ry=${ry}`,
    attributes
  };
  
  animation.objects.set(id, object);
  return id;
}

/**
 * Dodaje obiekt koła do animacji
 * Koło to specjalny przypadek elipsy z równymi promieniami
 * @param animation Obiekt animacji
 * @param cx Współrzędna X środka
 * @param cy Współrzędna Y środka
 * @param r Promień
 * @param attributes Atrybuty wizualne
 * @returns Identyfikator utworzonego obiektu
 */
export function addCircle(
  animation: Animation, 
  cx: number, 
  cy: number, 
  r: number, 
  attributes: Attributes = {}
): string {
  return addEllipse(animation, cx, cy, r, r, attributes);
}

/**
 * Dodaje obiekt tekstu do animacji
 * @param animation Obiekt animacji
 * @param text Treść tekstu
 * @param x Współrzędna X początku tekstu
 * @param y Współrzędna Y linii bazowej tekstu
 * @param attributes Atrybuty wizualne (font, rozmiar, etc.)
 * @returns Identyfikator utworzonego obiektu
 */
export function addText(
  animation: Animation, 
  text: string, 
  x: number, 
  y: number, 
  attributes: Attributes = {}
): string {
  const id = generateObjectId(animation);
  const object: VectorObject = {
    id,
    type: 'text',
    data: text,
    attributes: {
      x,
      y,
      ...attributes
    }
  };
  
  animation.objects.set(id, object);
  return id;
}

/**
 * Dodaje grupę obiektów do animacji
 * Grupy pozwalają na łączne transformowanie wielu obiektów
 * @param animation Obiekt animacji
 * @param objectIds Identyfikatory obiektów w grupie
 * @param attributes Atrybuty grupy
 * @returns Identyfikator utworzonej grupy
 */
export function addGroup(
  animation: Animation, 
  objectIds: string[], 
  attributes: Attributes = {}
): string {
  // Weryfikacja czy wszystkie obiekty istnieją
  for (const objId of objectIds) {
    if (!animation.objects.has(objId)) {
      throw new Error(`Object with id '${objId}' does not exist in animation`);
    }
  }
  
  const id = generateObjectId(animation);
  const object: VectorObject = {
    id,
    type: 'group',
    data: objectIds.join(','),
    attributes
  };
  
  animation.objects.set(id, object);
  return id;
}

/**
 * Dodaje transformację do animacji
 * Transformacje definiują jak obiekty zmieniają się w czasie
 * @param animation Obiekt animacji
 * @param objectId Identyfikator obiektu do transformacji
 * @param timestamp Czas w milisekundach kiedy ma nastąpić transformacja
 * @param transformation Definicja transformacji
 */
export function addTransformation(
  animation: Animation, 
  objectId: string, 
  timestamp: number, 
  transformation: Transformation
): void {
  // Sprawdzenie czy obiekt istnieje
  if (!animation.objects.has(objectId)) {
    throw new Error(`Object with id '${objectId}' does not exist`);
  }
  
  // Sprawdzenie poprawności timestamp
  if (timestamp < 0) {
    throw new Error('Timestamp cannot be negative');
  }
  
  // Pobieranie lub tworzenie klatki czasowej
  let keyframe = animation.timeline.get(timestamp);
  if (!keyframe) {
    keyframe = [];
    animation.timeline.set(timestamp, keyframe);
  }
  
  // Sprawdzenie czy obiekt nie ma już transformacji w tej klatce
  const existingIndex = keyframe.findIndex(change => change.objectId === objectId);
  
  if (existingIndex >= 0) {
    // Aktualizacja istniejącej transformacji
    console.warn(`Overwriting existing transformation for object ${objectId} at time ${timestamp}`);
    keyframe[existingIndex] = {
      objectId,
      transformation
    };
  } else {
    // Dodawanie nowej transformacji
    keyframe.push({
      objectId,
      transformation
    });
  }
  
  // Aktualizacja czasu trwania animacji
  if (timestamp > animation.duration) {
    animation.duration = timestamp;
  }
}

/**
 * Eksportuje animację do formatu VectorDiff
 * @param animation Obiekt animacji
 * @param metadata Opcjonalne dodatkowe metadane
 * @returns Dane w formacie VectorDiff gotowe do zapisu
 */
export function exportVectorDiff(
  animation: Animation, 
  metadata: Partial<VectorDiffAnimation['metadata']> = {}
): VectorDiffAnimation {
  const vectorDiff = animationToVectorDiff(animation);
  
  // Scalenie z dodatkowymi metadanymi
  if (metadata) {
    vectorDiff.metadata = {
      ...vectorDiff.metadata,
      ...metadata
    };
  }
  
  return vectorDiff;
}

/**
 * Ładuje animację z formatu VectorDiff
 * @param data Dane w formacie VectorDiff
 * @returns Obiekt animacji gotowy do manipulacji
 */
export function loadAnimation(data: VectorDiffAnimation): Animation {
  return vectorDiffToAnimation(data);
}

/**
 * Ładuje animację z JSON
 * @param jsonString String JSON zawierający animację VectorDiff
 * @returns Obiekt animacji
 */
export function loadAnimationFromJson(jsonString: string): Animation {
  const data = parseVectorDiff(jsonString);
  return vectorDiffToAnimation(data);
}

/**
 * Eksportuje animację do JSON
 * @param animation Obiekt animacji
 * @param pretty Czy formatować JSON dla czytelności
 * @returns String JSON
 */
export function exportAnimationToJson(
  animation: Animation, 
  pretty: boolean = true
): string {
  const data = animationToVectorDiff(animation);
  return serializeVectorDiff(data, pretty);
}

/**
 * Klonuje animację
 * Tworzy głęboką kopię animacji
 * @param animation Animacja do sklonowania
 * @returns Nowa instancja animacji
 */
export function cloneAnimation(animation: Animation): Animation {
  const clone: Animation = {
    width: animation.width,
    height: animation.height,
    depth: animation.depth,
    duration: animation.duration,
    objects: new Map(),
    timeline: new Map()
  };
  
  // Klonowanie obiektów
  for (const [id, obj] of animation.objects) {
    clone.objects.set(id, {
      ...obj,
      data: typeof obj.data === 'object' ? { ...obj.data } : obj.data,
      attributes: { ...obj.attributes }
    });
  }
  
  // Klonowanie timeline
  for (const [timestamp, changes] of animation.timeline) {
    clone.timeline.set(timestamp, changes.map(change => ({
      ...change,
      transformation: { ...change.transformation }
    })));
  }
  
  return clone;
}

/**
 * Generuje unikalny identyfikator obiektu
 * @param animation Obiekt animacji (używany do sprawdzenia unikalności)
 * @returns Unikalny identyfikator
 */
function generateObjectId(animation: Animation): string {
  let id: string;
  let counter = 0;
  
  // Generujemy ID w formacie obj000, obj001, etc.
  do {
    id = `obj${counter.toString().padStart(3, '0')}`;
    counter++;
  } while (animation.objects.has(id));
  
  return id;
}

/**
 * Pomocnicza funkcja do tworzenia animacji z przykładowymi danymi
 * Przydatna do testowania i demonstracji
 * @returns Przykładowa animacja
 */
export function createSampleAnimation(): Animation {
  const animation = createAnimation(800, 600);
  
  // Dodajemy przykładowe obiekty
  const rect = addRectangle(animation, 100, 100, 200, 150, {
    fill: '#FF0000',
    stroke: '#000000',
    strokeWidth: 2
  });
  
  const circle = addCircle(animation, 400, 300, 50, {
    fill: '#0000FF',
    opacity: 0.8
  });
  
  const text = addText(animation, 'VectorDiff', 350, 450, {
    fontFamily: 'Arial',
    fontSize: 24,
    fill: '#333333'
  });
  
  // Dodajemy przykładowe transformacje
  addTransformation(animation, rect, 1000, {
    type: 'translate',
    x: 200,
    y: 0
  });
  
  addTransformation(animation, circle, 1000, {
    type: 'scale',
    scaleX: 1.5,
    scaleY: 1.5,
    centerX: 400,
    centerY: 300
  });
  
  addTransformation(animation, rect, 2000, {
    type: 'rotate',
    angle: 45,
    centerX: 300,
    centerY: 175
  });
  
  addTransformation(animation, text, 2000, {
    type: 'translate',
    x: 0,
    y: -50
  });
  
  return animation;
}

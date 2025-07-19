import {
  Animation,
  VectorObject,
  Attributes,
  Transformation,
  ObjectChange
} from './format';

function generateObjectId(animation: Animation): string {
  let id: string;
  let counter = animation.objects.size;
  do {
    id = `obj${counter.toString().padStart(3, '0')}`;
    counter++;
  } while (animation.objects.has(id));
  return id;
}

export function createAnimation(width: number, height: number, depth?: number): Animation {
  return {
    width,
    height,
    depth,
    objects: new Map<string, VectorObject>(),
    timeline: new Map<number, ObjectChange[]>(),
    duration: 0
  };
}

export function addRectangle(animation: Animation, x: number, y: number, width: number, height: number, attributes: Attributes = {}): string {
  const id = generateObjectId(animation);
  const object: VectorObject = {
    id,
    type: 'rect',
    data: { x, y, width, height },
    attributes
  };
  animation.objects.set(id, object);
  return id;
}

export function addCircle(animation: Animation, cx: number, cy: number, r: number, attributes: Attributes = {}): string {
  const id = generateObjectId(animation);
  const object: VectorObject = {
    id,
    type: 'ellipse',
    data: { cx, cy, rx: r, ry: r },
    attributes
  };
  animation.objects.set(id, object);
  return id;
}

export function addPath(animation: Animation, d: string, attributes: Attributes = {}): string {
  const id = generateObjectId(animation);
  const object: VectorObject = {
    id,
    type: 'path',
    data: { d },
    attributes
  };
  animation.objects.set(id, object);
  return id;
}

export function addTransformation(animation: Animation, objectId: string, timestamp: number, transformation: Transformation): void {
  if (!animation.objects.has(objectId)) {
    throw new Error(`Object with id '${objectId}' does not exist`);
  }
  if (timestamp < 0) {
    throw new Error('Timestamp cannot be negative');
  }
  let keyframe = animation.timeline.get(timestamp);
  if (!keyframe) {
    keyframe = [];
    animation.timeline.set(timestamp, keyframe);
  }
  keyframe.push({ objectId, transformation });
  if (timestamp > animation.duration) {
    animation.duration = timestamp;
  }
}

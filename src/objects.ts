import { VectorObject, ObjectType } from './types.js';
import { Animation } from './animation.js';
import { generateId } from './utils.js';
export class ObjectManager {
  constructor(private anim: Animation) {}
  add(type: ObjectType, props: Record<string, any>, style: Record<string, any> = {}) {
    const obj: VectorObject = { id: generateId(), type, properties: props, style };
    this.anim.objects.push(obj);
    return obj.id;
  }
  remove(id: string) {
    const idx = this.anim.objects.findIndex(o => o.id === id);
    if (idx >= 0) this.anim.objects.splice(idx, 1);
  }
}

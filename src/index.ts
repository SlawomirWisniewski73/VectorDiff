export { Animation } from './animation.js';
export { ObjectManager } from './objects.js';
export { TransformManager } from './transforms.js';
export * from './types.js';
export * from './utils.js';
import { Animation } from './animation.js';
export function createAnimation(w: number, h: number, title?: string) {
  return new Animation(w, h, { title });
}
export const VERSION = '1.0.0';

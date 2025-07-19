export { Animation } from './animation';
export { ObjectManager } from './objects';
export { TransformManager } from './transforms';
export * from './types';
export * from './utils';
import { Animation } from './animation';

export function createAnimation(w: number, h: number, title?: string) {
  return new Animation(w, h, { title });
}
export const VERSION = '1.0.0';

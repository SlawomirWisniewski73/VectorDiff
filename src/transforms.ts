import { Animation } from './animation.js';
import { Transform } from './types.js';
export class TransformManager {
  constructor(private anim: Animation) {}
  add(objectId: string, when: number, transform: Transform) {
    let kf = this.anim.timeline.find(k => k.time === when);
    if (!kf) {
      kf = { time: when, changes: [] };
      this.anim.timeline.push(kf);
      this.anim.timeline.sort((a, b) => a.time - b.time);
    }
    const existing = kf.changes.find(c => c.objectId === objectId);
    if (existing) existing.transform = transform;
    else kf.changes.push({ objectId, transform });
    if (when > this.anim.duration) this.anim.setDuration(when);
  }
  clear() { (this.anim.timeline as any[]).length = 0; this.anim.setDuration(0); }
}

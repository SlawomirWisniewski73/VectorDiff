import { VectorDiffAnimation, AnimationMetadata, Canvas } from './types.js';

export class Animation {
  private data: VectorDiffAnimation;
  constructor(width: number, height: number, meta: Partial<AnimationMetadata> = {}) {
    this.data = {
      version: '1.0.0',
      metadata: {
        duration: 0,
        createdAt: new Date().toISOString(),
        fps: 60,
        ...meta
      },
      canvas: { width, height },
      objects: [],
      timeline: []
    };
  }
  get objects()  { return this.data.objects; }
  get timeline() { return this.data.timeline; }
  get duration() { return this.data.metadata.duration; }
  setDuration(ms: number) { this.data.metadata.duration = ms; }
  toJSON(pretty = true): string {
    return JSON.stringify(this.data, null, pretty ? 2 : 0);
  }
  static fromJSON(json: string): Animation {
    const parsed = JSON.parse(json) as VectorDiffAnimation;
    const anim = new Animation(parsed.canvas.width, parsed.canvas.height);
    anim.data = parsed;
    return anim;
  }
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (this.data.canvas.width <= 0 || this.data.canvas.height <= 0) {
      errors.push('Canvas dimensions must be positive');
    }
    const ids = new Set<string>();
    this.data.objects.forEach(o => {
      if (ids.has(o.id)) errors.push(`Duplicate object id ${o.id}`);
      ids.add(o.id);
    });
    return { valid: errors.length === 0, errors };
  }
}

import { Animation, ObjectManager, TransformManager } from '../src';

describe('VectorDiff Core', () => {
  it('creates simple animation', () => {
    const anim = new Animation(800, 600, { title: 'demo' });
    expect(anim.validate().valid).toBe(true);
  });

  it('adds objects and transforms', () => {
    const anim = new Animation(500, 500);
    const objMgr = new ObjectManager(anim);
    const trMgr  = new TransformManager(anim);
    const id = objMgr.add('rect', { x: 0, y: 0, width: 50, height: 30 }, {});
    trMgr.add(id, 1000, { type: 'translate', x: 100, y: 0 });
    expect(anim.objects.length).toBe(1);
    expect(anim.timeline.length).toBe(1);
    expect(anim.duration).toBe(1000);
  });
});

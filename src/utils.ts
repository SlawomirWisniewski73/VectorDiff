let counter = 0;
export const generateId = () => `obj_${++counter}`;
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

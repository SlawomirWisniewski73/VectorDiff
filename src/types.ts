export interface VectorDiffAnimation {
  version: string;
  metadata: AnimationMetadata;
  canvas: Canvas;
  objects: VectorObject[];
  timeline: Keyframe[];
}
export interface AnimationMetadata {
  title?: string;
  author?: string;
  duration: number;
  createdAt: string;
  fps?: number;
}
export interface Canvas {
  width: number;
  height: number;
  backgroundColor?: string;
}
export type ObjectType =
  | 'rect' | 'circle' | 'ellipse'
  | 'path' | 'text'  | 'group';
export interface VectorObject {
  id: string;
  type: ObjectType;
  properties: Record<string, any>;
  style: Record<string, any>;
}
export interface Keyframe {
  time: number;
  changes: ObjectChange[];
}
export interface ObjectChange {
  objectId: string;
  transform: Transform;
}
export type Transform =
  | Translate | Rotate | Scale | Opacity;
export interface Translate { type: 'translate'; x: number; y: number; }
export interface Rotate    { type: 'rotate'; angle: number; cx?: number; cy?: number; }
export interface Scale     { type: 'scale'; sx: number; sy: number; cx?: number; cy?: number; }
export interface Opacity   { type: 'opacity'; value: number; }

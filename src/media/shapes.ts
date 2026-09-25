import type { Box } from '../text/layout';

export type ShapeId = 'rectangle' | 'stele' | 'tabula' | 'fragment' | 'sheet' | 'torn';

export interface ShapeDef {
  label: string;
  /** SHAPE_* code in lib/shapes.glsl. */
  code: number;
}

export const SHAPES: Record<ShapeId, ShapeDef> = {
  rectangle: { label: 'Rectangular', code: 0 },
  stele: { label: 'Round-topped stele', code: 1 },
  tabula: { label: 'Tabula ansata (plaque with handles)', code: 2 },
  fragment: { label: 'Broken fragment', code: 3 },
  sheet: { label: 'Sheet', code: 4 },
  torn: { label: 'Torn-edged sheet', code: 5 },
};

/**
 * Proportions of the shaped outlines, mm, passed to the shaders as u_shapeParams:
 * x = width of each tabula handle, y = width of the tabula's moulded frame,
 * z = radius of the stele's arch.
 */
export function shapeParams(shape: ShapeId, width: number, height: number): [number, number, number, number] {
  if (shape === 'tabula') return [width * 0.13, Math.min(height * 0.09, 14), 0, 0];
  if (shape === 'stele') return [0, 0, width / 2, 0];
  return [0, 0, 0, 0];
}

/** The area the text is fitted into, for an object of this shape and size. */
export function textBox(shape: ShapeId, width: number, height: number, padding: { x: number; y: number }): Box {
  const [handle, frame, arch] = shapeParams(shape, width, height);
  if (shape === 'tabula') {
    // Inside the moulded frame of the central panel.
    const inset = frame + padding.y * 0.5;
    return { x: handle + inset, y: inset, width: width - 2 * (handle + inset), height: height - 2 * inset };
  }
  if (shape === 'stele') {
    // Start partway up the arch, where it is still nearly full width.
    const top = Math.max(padding.y, arch * 0.5);
    return { x: padding.x, y: top, width: width - 2 * padding.x, height: height - top - padding.y };
  }
  return { x: padding.x, y: padding.y, width: width - 2 * padding.x, height: height - 2 * padding.y };
}

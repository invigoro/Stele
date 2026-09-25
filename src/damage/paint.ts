import type { Family, MediumDef } from '../media/media';
import type { Raster } from '../text/rasterize';
import type { DamageId } from './types';

/**
 * Damage painted by hand, in generic kinds that each medium interprets its own way (see
 * PAINT_LABELS), so strokes still make sense after switching medium. Not every medium
 * has every kind: moss grows only on stone, and only ink blots.
 */
export type PaintKind = 'break' | 'wear' | 'stain' | 'burn' | 'growth' | 'blot';

export const PAINT_KINDS: readonly PaintKind[] = ['break', 'wear', 'stain', 'burn', 'growth', 'blot'];

export const PAINT_LABELS: Record<Family, Partial<Record<PaintKind, string>>> = {
  stone: { break: 'Chip', wear: 'Wear away', stain: 'Stain', burn: 'Scorch', growth: 'Moss' },
  wood: { break: 'Gouge', wear: 'Wear away', stain: 'Rot', burn: 'Burn' },
  metal: { break: 'Dent', wear: 'Wear smooth', stain: 'Verdigris', burn: 'Scorch' },
  sheet: { break: 'Hole', wear: 'Rub out', stain: 'Water', burn: 'Burn', blot: 'Ink blot' },
};

/** Kinds offered only on media with the matching damage type. */
const NEEDS: Partial<Record<PaintKind, DamageId>> = { growth: 'lichen', blot: 'blots' };

/** The kinds of damage that can be painted onto a medium, in the order offered. */
export function paintKinds(medium: Pick<MediumDef, 'family' | 'damage'>): PaintKind[] {
  return PAINT_KINDS.filter((kind) => {
    const needs = NEEDS[kind];
    return PAINT_LABELS[medium.family][kind] !== undefined && (!needs || needs in medium.damage);
  });
}

/**
 * One brush stroke. Positions are fractions of the object's width and height, and the
 * radius a fraction of its shorter side, so strokes follow the object when it's resized
 * or the medium changes.
 */
export interface Stroke {
  kind: PaintKind;
  radius: number;
  points: [number, number][];
  /** Which page of a multi-page handout the stroke is on. */
  page: number;
}

/** Limits that keep settings (and share links) a sensible size. */
export const MAX_STROKES = 200;
export const MAX_POINTS = 400;

/** Rounds a coordinate so links stay short; a thousandth of the object is plenty. */
export const quantize = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Adds a point to a stroke unless it's too close to the last one (under a third of the
 * brush radius), which keeps strokes compact without visible gaps.
 */
export function extendStroke(stroke: Stroke, point: [number, number], aspect: number): Stroke {
  const last = stroke.points.at(-1);
  if (stroke.points.length >= MAX_POINTS) return stroke;
  if (last) {
    // Compare in units of the shorter side, where the radius is measured.
    const dx = (point[0] - last[0]) * Math.max(1, aspect);
    const dy = (point[1] - last[1]) * Math.max(1, 1 / aspect);
    if (Math.hypot(dx, dy) < stroke.radius / 3) return stroke;
  }
  return { ...stroke, points: [...stroke.points, [quantize(point[0]), quantize(point[1])]] };
}

/** How far painted damage blurs at its edge, mm; the shaders roughen within this band. */
const SOFTNESS_MM = 2.5;

/**
 * Where each kind is drawn for the shaders: which of the two masks, and in which colour
 * channel (read back by paintAt in shaders/damage/painted.glsl).
 */
const CHANNELS: Record<PaintKind, { mask: 0 | 1; color: string }> = {
  break: { mask: 0, color: '#f00' },
  wear: { mask: 0, color: '#0f0' },
  stain: { mask: 0, color: '#00f' },
  burn: { mask: 1, color: '#f00' },
  growth: { mask: 1, color: '#0f0' },
  blot: { mask: 1, color: '#00f' },
};

/**
 * Draws strokes into two soft masks for the shaders (see CHANNELS). Brush strokes are
 * blurred by drawing each shape far off the canvas and letting only its shadow land.
 */
export function rasterizePaint(
  strokes: readonly Stroke[],
  size: { width: number; height: number },
  raster: Raster,
  masks: readonly [HTMLCanvasElement, HTMLCanvasElement],
): void {
  const short = Math.min(size.width, size.height);
  const toPx = ([u, v]: [number, number]): [number, number] => [
    (u * size.width - raster.originMm[0]) * raster.pxPerMm,
    (v * size.height - raster.originMm[1]) * raster.pxPerMm,
  ];
  const away = 4 * (raster.width + raster.height); // far enough that only the shadow shows

  masks.forEach((canvas, mask) => {
    canvas.width = raster.width;
    canvas.height = raster.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, raster.width, raster.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = SOFTNESS_MM * raster.pxPerMm;
    ctx.shadowOffsetX = away;
    for (const stroke of strokes) {
      const channel = CHANNELS[stroke.kind];
      if (channel.mask !== mask || stroke.points.length === 0) continue;
      ctx.shadowColor = channel.color;
      ctx.strokeStyle = channel.color;
      ctx.lineWidth = Math.max(1, 2 * stroke.radius * short * raster.pxPerMm);
      ctx.beginPath();
      const [x0, y0] = toPx(stroke.points[0]);
      ctx.moveTo(x0 - away, y0);
      // A single point still needs a (zero-length) segment for its round cap to draw.
      for (const point of stroke.points.length > 1 ? stroke.points.slice(1) : stroke.points) {
        const [x, y] = toPx(point);
        ctx.lineTo(x - away, y);
      }
      ctx.stroke();
    }
  });
}

import type { Family } from '../media/media';
import type { Raster } from '../text/rasterize';

/**
 * Damage painted by hand, in four generic kinds that each medium interprets its own
 * way (see PAINT_LABELS), so strokes still make sense after switching medium.
 */
export type PaintKind = 'break' | 'wear' | 'stain' | 'burn';

export const PAINT_KINDS: readonly PaintKind[] = ['break', 'wear', 'stain', 'burn'];

export const PAINT_LABELS: Record<Family, Record<PaintKind, string>> = {
  stone: { break: 'Chip', wear: 'Wear away', stain: 'Stain', burn: 'Scorch' },
  wood: { break: 'Gouge', wear: 'Wear away', stain: 'Rot', burn: 'Burn' },
  sheet: { break: 'Hole', wear: 'Rub out', stain: 'Water', burn: 'Burn' },
};

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
 * Draws strokes into soft masks for the shaders: `main` gets break, wear and stain in
 * its red, green and blue channels, and `burn` gets burning in red. Brush strokes are
 * blurred by drawing each shape far off the canvas and letting only its shadow land.
 */
export function rasterizePaint(
  strokes: readonly Stroke[],
  size: { width: number; height: number },
  raster: Raster,
  main: HTMLCanvasElement,
  burn: HTMLCanvasElement,
): void {
  const colors: Record<PaintKind, string> = { break: '#f00', wear: '#0f0', stain: '#00f', burn: '#f00' };
  const short = Math.min(size.width, size.height);
  const toPx = ([u, v]: [number, number]): [number, number] => [
    (u * size.width - raster.originMm[0]) * raster.pxPerMm,
    (v * size.height - raster.originMm[1]) * raster.pxPerMm,
  ];
  const away = 4 * (raster.width + raster.height); // far enough that only the shadow shows

  for (const canvas of [main, burn]) {
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
      if ((canvas === burn) !== (stroke.kind === 'burn') || stroke.points.length === 0) continue;
      ctx.shadowColor = colors[stroke.kind];
      ctx.strokeStyle = colors[stroke.kind];
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
  }
}

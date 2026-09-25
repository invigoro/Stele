import { cssFont, type FontDef } from './fonts';
import type { Drawing } from './hand';

/** Where the canvas sits in object space: its top-left corner in mm, and its scale. */
export interface Raster {
  originMm: readonly [number, number];
  pxPerMm: number;
  width: number;
  height: number;
}

/**
 * Draws text into `canvas` for the renderer. Red is letter coverage. Green is ink
 * density, filled in a box around each run, padded by `pad` times the font size, so
 * ink that spreads or runs outside the letters still knows how dark it is. (Type needs
 * less, and its boxes mustn't spill into the next letter's.)
 */
export function rasterizeText(
  drawing: Drawing,
  font: FontDef,
  raster: Raster,
  canvas: HTMLCanvasElement,
  pad = 0.4,
): void {
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, raster.width, raster.height);
  if (drawing.runs.length === 0) return;

  const sizePx = drawing.size * raster.pxPerMm;
  const toPx = (x: number, y: number): [number, number] => [
    (x - raster.originMm[0]) * raster.pxPerMm,
    (y - raster.originMm[1]) * raster.pxPerMm,
  ];
  ctx.font = cssFont(font, sizePx);

  const padPx = pad * sizePx;
  for (const run of drawing.runs) {
    const [x, y] = toPx(run.x, run.y);
    const width = ctx.measureText(run.text).width * run.scale;
    const density = Math.min(1, Math.max(0, run.density));
    const green = (fraction: number) => `rgb(0, ${Math.round(density * fraction * 255)}, 0)`;
    if (run.shade) {
      // A lopsided strike: paler toward one side of the letter.
      const reach = 0.5 * sizePx;
      const [cx, cy] = [x + width / 2, y - 0.35 * sizePx];
      const [dx, dy] = [Math.cos(run.shade.angle) * reach, Math.sin(run.shade.angle) * reach];
      const gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      gradient.addColorStop(0, green(1));
      gradient.addColorStop(1, green(1 - run.shade.amount));
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = green(1);
    }
    ctx.fillRect(x - padPx, y - 1.2 * sizePx - padPx, width + 2 * padPx, 1.6 * sizePx + 2 * padPx);
  }

  // Letters in pure red, added on top so the green channel is left alone.
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#f00';
  for (const run of drawing.runs) {
    const [x, y] = toPx(run.x, run.y);
    const cos = Math.cos(run.rotation) * run.scale;
    const sin = Math.sin(run.rotation) * run.scale;
    ctx.setTransform(cos, sin, -sin, cos, x, y);
    ctx.fillText(run.text, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

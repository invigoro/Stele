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
 * density, filled in a padded box around each run, so ink that spreads or runs
 * outside the letters still knows how dark it is.
 */
export function rasterizeText(drawing: Drawing, font: FontDef, raster: Raster, canvas: HTMLCanvasElement): void {
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

  const pad = 0.4 * sizePx;
  for (const run of drawing.runs) {
    const [x, y] = toPx(run.x, run.y);
    const width = ctx.measureText(run.text).width * run.scale;
    const green = Math.round(Math.min(1, Math.max(0, run.density)) * 255);
    ctx.fillStyle = `rgb(0, ${green}, 0)`;
    ctx.fillRect(x - pad, y - 1.2 * sizePx - pad, width + 2 * pad, 1.6 * sizePx + 2 * pad);
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

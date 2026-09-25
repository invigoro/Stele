import { cssFont, FONTS, type FontDef } from './fonts';
import { hasWriting, type Drawing, type Run } from './hand';
import { pictureCoverage } from './picture';

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
 * less, and its boxes mustn't spill into the next letter's.) Blue marks runs written by
 * hand, such as a signature on a typed page.
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
  if (!hasWriting(drawing)) return;

  const sizePx = drawing.size * raster.pxPerMm;
  const toPx = (x: number, y: number): [number, number] => [
    (x - raster.originMm[0]) * raster.pxPerMm,
    (y - raster.originMm[1]) * raster.pxPerMm,
  ];
  const fontFor = (run: Run) => cssFont(run.font ? FONTS[run.font] : font, sizePx);

  for (const run of drawing.runs) {
    const [x, y] = toPx(run.x, run.y);
    ctx.font = fontFor(run);
    // The box the letters cover (a line's height at least), padded; a hand-written run
    // on a typed page gets a pen's padding.
    const metrics = ctx.measureText(run.text);
    const s = run.scale;
    const padPx = (run.handwritten ? 0.4 : pad) * sizePx * s;
    const left = -Math.max(0, metrics.actualBoundingBoxLeft) * s;
    const right = Math.max(metrics.width, metrics.actualBoundingBoxRight) * s;
    const top = Math.max(1.2 * sizePx, metrics.actualBoundingBoxAscent) * s;
    const bottom = Math.max(0.4 * sizePx, metrics.actualBoundingBoxDescent) * s;
    const width = right - left;
    const density = Math.min(1, Math.max(0, run.density));
    const blue = run.handwritten ? 255 : 0;
    const green = (fraction: number) => `rgb(0, ${Math.round(density * fraction * 255)}, ${blue})`;
    if (run.shade) {
      // A lopsided strike: paler toward one side of the letter.
      const reach = 0.5 * sizePx;
      const [cx, cy] = [x + left + width / 2, y - 0.35 * sizePx];
      const [dx, dy] = [Math.cos(run.shade.angle) * reach, Math.sin(run.shade.angle) * reach];
      const gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      gradient.addColorStop(0, green(1));
      gradient.addColorStop(1, green(1 - run.shade.amount));
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = green(1);
    }
    ctx.fillRect(x + left - padPx, y - top - padPx, width + 2 * padPx, top + bottom + 2 * padPx);
  }
  // Lines drawn by hand and pictures are full-strength ink, and hand-made (blue) even on
  // a typed page.
  const handPad = 0.4 * sizePx;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgb(0, 255, 255)';
  for (const line of drawing.lines ?? []) {
    ctx.lineWidth = line.width * raster.pxPerMm + 2 * handPad;
    tracePath(ctx, line.points.map(([x, y]) => toPx(x, y)));
    ctx.stroke();
  }
  const picture = drawing.picture;
  const [px, py] = picture ? toPx(picture.x, picture.y) : [0, 0];
  const [pw, ph] = picture ? [picture.width * raster.pxPerMm, picture.height * raster.pxPerMm] : [0, 0];
  if (picture) {
    ctx.fillStyle = 'rgb(0, 255, 255)';
    ctx.fillRect(px - handPad, py - handPad, pw + 2 * handPad, ph + 2 * handPad);
  }

  // Letters in pure red, added on top so the green channel is left alone.
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#f00';
  for (const run of drawing.runs) {
    const [x, y] = toPx(run.x, run.y);
    ctx.font = fontFor(run);
    const cos = Math.cos(run.rotation) * run.scale;
    const sin = Math.sin(run.rotation) * run.scale;
    ctx.setTransform(cos, sin, -sin, cos, x, y);
    ctx.fillText(run.text, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Ruled lines, thinner than the letters.
  ctx.strokeStyle = '#f00';
  ctx.lineWidth = Math.max(1, 0.05 * sizePx);
  ctx.lineCap = 'round';
  for (const rule of drawing.rules ?? []) {
    ctx.beginPath();
    ctx.moveTo(...toPx(rule.x0, rule.y0));
    ctx.lineTo(...toPx(rule.x1, rule.y1));
    ctx.stroke();
  }
  ctx.lineJoin = 'round';
  for (const line of drawing.lines ?? []) {
    ctx.lineWidth = Math.max(1, line.width * raster.pxPerMm);
    tracePath(ctx, line.points.map(([x, y]) => toPx(x, y)));
    ctx.stroke();
  }
  const coverage = picture ? pictureCoverage(picture) : null;
  if (coverage) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(coverage, px, py, pw, ph);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * A smooth path through the points of a line drawn by hand: curves through each point
 * to the midpoint of the next, as a pen would move.
 */
function tracePath(ctx: CanvasRenderingContext2D, points: [number, number][]): void {
  ctx.beginPath();
  const [first, ...rest] = points;
  ctx.moveTo(...first);
  if (rest.length === 0) {
    ctx.lineTo(...first); // a dot still needs a (zero-length) segment for its round cap
    return;
  }
  for (let i = 0; i < rest.length - 1; i++) {
    ctx.quadraticCurveTo(rest[i][0], rest[i][1], (rest[i][0] + rest[i + 1][0]) / 2, (rest[i][1] + rest[i + 1][1]) / 2);
  }
  ctx.lineTo(...rest[rest.length - 1]);
}

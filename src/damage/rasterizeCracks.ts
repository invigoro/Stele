import type { Raster } from '../text/rasterize';
import type { Crack } from './cracks';

/**
 * Draws cracks in red for their distance field, tapering from start to end. Lines are
 * kept at least ~1 px wide so that hairline cracks still show in a small preview.
 */
export function rasterizeCracks(cracks: readonly Crack[], raster: Raster, canvas: HTMLCanvasElement): void {
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, raster.width, raster.height);
  ctx.strokeStyle = '#f00';
  ctx.lineCap = 'round';
  const toPx = ([x, y]: [number, number]): [number, number] => [
    (x - raster.originMm[0]) * raster.pxPerMm,
    (y - raster.originMm[1]) * raster.pxPerMm,
  ];
  for (const crack of cracks) {
    const last = crack.points.length - 1;
    for (let i = 0; i < last; i++) {
      const t = i / Math.max(1, last - 1);
      const width = crack.startWidth + (crack.endWidth - crack.startWidth) * t;
      ctx.lineWidth = Math.max(1.2, width * raster.pxPerMm);
      ctx.beginPath();
      ctx.moveTo(...toPx(crack.points[i]));
      ctx.lineTo(...toPx(crack.points[i + 1]));
      ctx.stroke();
    }
  }
}

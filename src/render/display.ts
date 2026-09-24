import type { Gpu } from './gl';
import { BLIT } from './programs';
import type { Target } from './targets';

/** Where an image was drawn on the canvas, in canvas pixels from the top left. */
export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws a rendered image centred on the page's canvas over a backdrop colour,
 * shrinking it if it doesn't fit. `backdrop` is sRGB, 0–1.
 */
export function present(
  gpu: Gpu,
  image: Target,
  canvas: HTMLCanvasElement,
  backdrop: readonly [number, number, number],
): Placement {
  const { gl } = gpu;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(backdrop[0], backdrop[1], backdrop[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const scale = Math.min(1, canvas.width / image.width, canvas.height / image.height);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const x = Math.round((canvas.width - width) / 2);
  const y = Math.round((canvas.height - height) / 2);
  gpu.draw(
    BLIT,
    null,
    { u_image: image.texture, u_viewport: [x, y, width, height], u_backdrop: backdrop },
    [x, y, width, height],
  );
  // The viewport counts rows from the bottom; report from the top, like the page does.
  return { x, y: canvas.height - y - height, width, height };
}

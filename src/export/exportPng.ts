import type { DistanceField } from '../render/distanceField';
import type { Gpu } from '../render/gl';
import { SceneRenderer, WHITE, type Rgba } from '../render/renderer';
import type { Scene } from '../scene';
import { setPngDpi } from './png';

/** Renders a scene at print resolution and encodes it as a PNG that records its DPI. */
export async function renderPng(
  gpu: Gpu,
  distanceField: DistanceField,
  scene: Scene,
  dpi = 300,
  background: Rgba = WHITE,
): Promise<Blob> {
  const renderer = new SceneRenderer(gpu, distanceField);
  try {
    await renderer.whenReady(scene);
    renderer.render(scene, dpi / 25.4, background);
    const image = renderer.readPixels();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    ctx.putImageData(image, 0, 0);
    const encoded = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))), 'image/png'),
    );
    const bytes = setPngDpi(new Uint8Array(await encoded.arrayBuffer()), dpi);
    return new Blob([bytes], { type: 'image/png' });
  } finally {
    // Print-size buffers are large; free them rather than keep them for next time.
    renderer.dispose();
    distanceField.release();
  }
}

/** Offers a blob to the user as a file download. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

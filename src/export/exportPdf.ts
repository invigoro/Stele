import { encodeImage } from './exportPng';
import { deflate, splitAlpha, type PdfImage } from './pdf';

/** JPEG quality for PDF pages: at 300 DPI its artefacts are far too small to see or print. */
const JPEG_QUALITY = 0.92;

/**
 * Prepares a rendered image for a PDF page: its colour as a JPEG, which keeps a page to a
 * megabyte or two where a PNG takes several, and its opacity if any of it is see-through.
 */
export async function pdfImage(image: ImageData): Promise<PdfImage> {
  const { width, height } = image;
  const { color, alpha } = splitAlpha(image.data);
  const jpeg = await encodeImage(new ImageData(color, width, height), 'image/jpeg', JPEG_QUALITY);
  const page: PdfImage = { width, height, jpeg: new Uint8Array(await jpeg.arrayBuffer()) };
  if (alpha) page.alpha = await deflate(alpha);
  return page;
}

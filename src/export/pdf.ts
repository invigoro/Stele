/**
 * A small PDF writer for handouts: each page shows one image at its real size. Pages are
 * pictures only, with no text layer, so the words that damage hides can't be selected
 * or searched for.
 */

/** An image for a PDF page. */
export interface PdfImage {
  width: number;
  height: number;
  /** The colour as a baseline JPEG. Where the image is see-through, blended over white. */
  jpeg: Uint8Array;
  /** Opacity, one byte per pixel from the top row down, zlib-compressed; none if opaque. */
  alpha?: Uint8Array;
}

export interface PdfPage {
  image: PdfImage;
  /** The page's real size, mm; the image fills it. */
  widthMm: number;
  heightMm: number;
}

/**
 * Splits straight-alpha RGBA pixels into opaque colour for the JPEG, blended over white
 * where they're see-through (as the mask's Matte says), and their opacity, which is null
 * when every pixel is opaque.
 */
export function splitAlpha(pixels: Uint8ClampedArray): { color: Uint8ClampedArray<ArrayBuffer>; alpha: Uint8Array<ArrayBuffer> | null } {
  const color = new Uint8ClampedArray(pixels.length);
  const alpha = new Uint8Array(pixels.length / 4);
  let seeThrough = false;
  for (let i = 0; i < alpha.length; i++) {
    const a = pixels[4 * i + 3];
    const white = 255 - a;
    for (let c = 0; c < 3; c++) color[4 * i + c] = (pixels[4 * i + c] * a + 255 * white) / 255;
    color[4 * i + 3] = 255;
    alpha[i] = a;
    if (a < 255) seeThrough = true;
  }
  return { color, alpha: seeThrough ? alpha : null };
}

/** zlib-compresses bytes, as a PDF's FlateDecode filter expects. */
export async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const POINTS_PER_MM = 72 / 25.4;

/** The area both A4 and US Letter paper can print, allowing 10 mm margins, mm. */
const PRINTABLE_MM = [190, 259] as const;

/** Whether a page fits on A4 and Letter paper at its real size, either way round. */
export function fitsOnPaper(page: { widthMm: number; heightMm: number }): boolean {
  const short = Math.min(page.widthMm, page.heightMm);
  const long = Math.max(page.widthMm, page.heightMm);
  return short <= PRINTABLE_MM[0] && long <= PRINTABLE_MM[1];
}

/**
 * A PDF of the given pages. When every page fits on the paper, it asks viewers to print
 * at actual size rather than scaling pages up to fill the sheet.
 */
export function pdf(pages: readonly PdfPage[], title = 'Stele handout'): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [];
  const add = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? latin1(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, dictionary: string, stream?: Uint8Array) => {
    offsets[id] = length;
    add(`${id} 0 obj\n${dictionary}\n`);
    if (stream) {
      add('stream\n');
      add(stream);
      add('\nendstream\n');
    }
    add('endobj\n');
  };

  // Objects 1–3 are the catalogue, the page tree and the document's details; then each
  // page has its page, contents and image objects, and a mask if the image has one.
  let next = 4;
  const ids = pages.map((page) => ({ page: next++, contents: next++, image: next++, alpha: page.image.alpha ? next++ : 0 }));

  add('%PDF-1.6\n%âãÏÓ\n'); // the second line marks the file as binary
  const actualSize = pages.length > 0 && pages.every(fitsOnPaper);
  const preferences = actualSize ? ' /ViewerPreferences << /PrintScaling /None >>' : '';
  object(1, `<< /Type /Catalog /Pages 2 0 R${preferences} >>`);
  object(2, `<< /Type /Pages /Kids [${ids.map((id) => `${id.page} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  object(3, `<< /Title ${textString(title)} /Producer (Stele) >>`);
  pages.forEach(({ image, widthMm, heightMm }, i) => {
    const id = ids[i];
    const width = number(widthMm * POINTS_PER_MM);
    const height = number(heightMm * POINTS_PER_MM);
    object(
      id.page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /XObject << /Im ${id.image} 0 R >> >> /Contents ${id.contents} 0 R >>`,
    );
    const contents = latin1(`q ${width} 0 0 ${height} 0 0 cm /Im Do Q`);
    object(id.contents, `<< /Length ${contents.length} >>`, contents);
    const size = `/Width ${image.width} /Height ${image.height} /BitsPerComponent 8`;
    const mask = image.alpha ? ` /SMask ${id.alpha} 0 R` : '';
    object(
      id.image,
      `<< /Type /XObject /Subtype /Image ${size} /ColorSpace /DeviceRGB /Filter /DCTDecode${mask} /Length ${image.jpeg.length} >>`,
      image.jpeg,
    );
    if (image.alpha) {
      // Matte tells viewers the colour was blended over white, so they can undo it.
      object(
        id.alpha,
        `<< /Type /XObject /Subtype /Image ${size} /ColorSpace /DeviceGray /Filter /FlateDecode /Matte [1 1 1] /Length ${image.alpha.length} >>`,
        image.alpha,
      );
    }
  });

  const xref = length;
  add(`xref\n0 ${next}\n0000000000 65535 f \n`);
  for (let id = 1; id < next; id++) add(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size ${next} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** One byte per character: PDF syntax is ASCII, apart from the binary marker. */
function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

/** A number as PDF writes it: no exponent, to a thousandth of a point. */
function number(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** A text string, such as a title, as UTF-16 (with a byte-order mark) in hex. */
function textString(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

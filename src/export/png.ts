const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | null = null;

/** CRC-32 as used by PNG chunks (and zip). */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface PngChunk {
  type: string;
  data: Uint8Array;
}

/** Splits a PNG file into its chunks. */
export function readChunks(png: Uint8Array): PngChunk[] {
  if (!SIGNATURE.every((byte, i) => png[i] === byte)) throw new Error('Not a PNG file');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: PngChunk[] = [];
  for (let offset = 8; offset + 12 <= png.length; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

/** Joins chunks back into a PNG file, computing each chunk's CRC. */
export function writeChunks(chunks: readonly PngChunk[]): Uint8Array<ArrayBuffer> {
  const size = 8 + chunks.reduce((total, chunk) => total + 12 + chunk.data.length, 0);
  const png = new Uint8Array(size);
  const view = new DataView(png.buffer);
  png.set(SIGNATURE);
  let offset = 8;
  for (const { type, data } of chunks) {
    view.setUint32(offset, data.length);
    const typeAndData = new Uint8Array(4 + data.length);
    typeAndData.set([...type].map((c) => c.charCodeAt(0)));
    typeAndData.set(data, 4);
    png.set(typeAndData, offset + 4);
    view.setUint32(offset + 8 + data.length, crc32(typeAndData));
    offset += 12 + data.length;
  }
  return png;
}

/**
 * Records the print resolution in a PNG (its pHYs chunk), so image editors and
 * print dialogs know the intended physical size.
 */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  const pixelsPerMetre = Math.round(dpi / 0.0254);
  const phys = new Uint8Array(9);
  const view = new DataView(phys.buffer);
  view.setUint32(0, pixelsPerMetre);
  view.setUint32(4, pixelsPerMetre);
  phys[8] = 1; // unit: metre
  // pHYs must come before the image data; put it straight after the header.
  const chunks = readChunks(png).filter((chunk) => chunk.type !== 'pHYs');
  const header = chunks.findIndex((chunk) => chunk.type === 'IHDR');
  chunks.splice(header + 1, 0, { type: 'pHYs', data: phys });
  return writeChunks(chunks);
}

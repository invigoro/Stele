import { describe, expect, it } from 'vitest';
import { crc32, readChunks, setPngDpi, writeChunks } from './png';

const bytes = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

// A minimal PNG-shaped file: header, some image data and the end marker.
const png = writeChunks([
  { type: 'IHDR', data: new Uint8Array(13).fill(1) },
  { type: 'IDAT', data: new Uint8Array([1, 2, 3]) },
  { type: 'IEND', data: new Uint8Array(0) },
]);

describe('crc32', () => {
  it('matches the standard check values', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    // Every PNG ends with an IEND chunk whose CRC is AE 42 60 82.
    expect(crc32(bytes('IEND'))).toBe(0xae426082);
  });
});

describe('PNG chunks', () => {
  it('round-trip through read and write', () => {
    expect(readChunks(png).map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(writeChunks(readChunks(png))).toEqual(png);
  });

  it('rejects files that are not PNGs', () => {
    expect(() => readChunks(new Uint8Array(20))).toThrow('Not a PNG');
  });
});

describe('setPngDpi', () => {
  it('adds a pHYs chunk right after the header', () => {
    const chunks = readChunks(setPngDpi(png, 300));
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    const phys = new DataView(chunks[1].data.buffer, chunks[1].data.byteOffset, 9);
    // 300 DPI is 11811 pixels per metre.
    expect([phys.getUint32(0), phys.getUint32(4), phys.getUint8(8)]).toEqual([11811, 11811, 1]);
  });

  it('replaces an existing pHYs chunk', () => {
    const twice = setPngDpi(setPngDpi(png, 72), 300);
    const physChunks = readChunks(twice).filter((chunk) => chunk.type === 'pHYs');
    expect(physChunks).toHaveLength(1);
    expect(new DataView(physChunks[0].data.buffer, physChunks[0].data.byteOffset).getUint32(0)).toBe(11811);
  });

  it('writes valid chunk CRCs', () => {
    const file = setPngDpi(png, 300);
    const view = new DataView(file.buffer);
    let offset = 8;
    while (offset < file.length) {
      const length = view.getUint32(offset);
      expect(view.getUint32(offset + 8 + length)).toBe(crc32(file.subarray(offset + 4, offset + 8 + length)));
      offset += 12 + length;
    }
  });
});

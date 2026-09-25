import { describe, expect, it } from 'vitest';
import { deflate, fitsOnPaper, pdf, splitAlpha, type PdfPage } from './pdf';

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

/** The objects of a PDF, found through its cross-reference table as a viewer would. */
function objects(file: Uint8Array): Map<number, string> {
  const source = text(file);
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(source)?.[1]);
  expect(source.startsWith('xref\n', startxref)).toBe(true);
  const [, first, count] = /^xref\n(\d+) (\d+)\n/.exec(source.slice(startxref)) ?? [];
  expect(Number(first)).toBe(0);
  const table = startxref + source.slice(startxref).indexOf('\n', 5) + 1;
  const found = new Map<number, string>();
  for (let id = 1; id < Number(count); id++) {
    const entry = source.slice(table + 20 * id, table + 20 * id + 20);
    expect(entry).toMatch(/^\d{10} 00000 n \n$/);
    const offset = Number(entry.slice(0, 10));
    expect(source.startsWith(`${id} 0 obj\n`, offset)).toBe(true);
    found.set(id, source.slice(offset, source.indexOf('endobj\n', offset)));
  }
  expect(source).toContain(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>`);
  return found;
}

/** The data of a stream object, checked against the length its dictionary gives. */
function streamOf(object: string): string {
  const length = Number(/\/Length (\d+)/.exec(object)?.[1]);
  const start = object.indexOf('stream\n') + 7;
  expect(object.slice(start + length)).toBe('\nendstream\n');
  return object.slice(start, start + length);
}

const fakeJpeg = Uint8Array.from([0xff, 0xd8, 0x00, 0x0a, 0xff, 0xd9]);
const page = (widthMm: number, heightMm: number, alpha?: Uint8Array): PdfPage => ({
  image: { width: 4, height: 3, jpeg: fakeJpeg, ...(alpha ? { alpha } : {}) },
  widthMm,
  heightMm,
});

describe('pdf', () => {
  it('writes pages at their real size, each showing its image', () => {
    const file = pdf([page(156, 218), page(100, 50, Uint8Array.from([1, 2, 3]))]);
    expect(text(file.subarray(0, 9))).toBe('%PDF-1.6\n');
    const all = objects(file);
    expect(all.get(2)).toContain('/Kids [4 0 R 7 0 R] /Count 2');
    // 156 mm is 442.205 pt.
    expect(all.get(4)).toContain('/MediaBox [0 0 442.205 617.953]');
    expect(streamOf(all.get(5)!)).toBe('q 442.205 0 0 617.953 0 0 cm /Im Do Q');
    const image = all.get(6)!;
    expect(image).toContain('/Width 4 /Height 3');
    expect(image).toContain('/Filter /DCTDecode');
    expect(image).not.toContain('/SMask');
    expect(streamOf(image)).toBe(text(fakeJpeg));
  });

  it('gives see-through images a soft mask, blended over white', () => {
    const all = objects(pdf([page(100, 50, Uint8Array.from([1, 2, 3]))]));
    expect(all.get(6)).toContain('/SMask 7 0 R');
    const mask = all.get(7)!;
    expect(mask).toContain('/ColorSpace /DeviceGray /Filter /FlateDecode /Matte [1 1 1]');
    expect(streamOf(mask)).toBe('\u0001\u0002\u0003');
  });

  it('asks for printing at actual size only when every page fits the paper', () => {
    expect(objects(pdf([page(156, 218), page(250, 180)])).get(1)).toContain('/PrintScaling /None');
    expect(objects(pdf([page(156, 218), page(200, 300)])).get(1)).not.toContain('PrintScaling');
  });

  it('writes the title as UTF-16', () => {
    expect(objects(pdf([page(10, 10)], 'Stèle')).get(3)).toContain('/Title <FEFF0053007400E8006C0065>');
  });

  it('has no text, so hidden words can’t be selected or searched for', () => {
    const all = [...objects(pdf([page(156, 218)])).values()].join('');
    expect(all).not.toMatch(/\bBT\b|\/Font/);
  });
});

describe('fitsOnPaper', () => {
  it('fits pages within A4 and Letter less margins, either way round', () => {
    expect(fitsOnPaper({ widthMm: 156, heightMm: 218 })).toBe(true);
    expect(fitsOnPaper({ widthMm: 259, heightMm: 190 })).toBe(true);
    expect(fitsOnPaper({ widthMm: 191, heightMm: 200 })).toBe(false);
    expect(fitsOnPaper({ widthMm: 150, heightMm: 270 })).toBe(false);
  });
});

describe('splitAlpha', () => {
  it('leaves opaque images without a mask', () => {
    const pixels = Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 255]);
    const { color, alpha } = splitAlpha(pixels);
    expect([...color]).toEqual([...pixels]);
    expect(alpha).toBeNull();
  });

  it('blends see-through pixels over white and keeps their opacity', () => {
    const { color, alpha } = splitAlpha(Uint8ClampedArray.from([255, 0, 0, 128, 0, 0, 0, 0]));
    expect([...color]).toEqual([255, 127, 127, 255, 255, 255, 255, 255]);
    expect([...alpha!]).toEqual([128, 0]);
  });
});

describe('deflate', () => {
  it('makes a zlib stream that inflates back to the input', async () => {
    const input = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 256);
    const packed = await deflate(input);
    expect(packed[0]).toBe(0x78); // zlib header, as FlateDecode expects
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate'));
    expect(new Uint8Array(await new Response(stream).arrayBuffer())).toEqual(input);
  });
});

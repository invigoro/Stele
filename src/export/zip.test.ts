import { describe, expect, it } from 'vitest';
import { zip } from './zip';

/** CRC-32 computed bit by bit: an independent check on the table-driven one the ZIP uses. */
function referenceCrc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

/** Reads a stored-only ZIP back through its central directory. */
function unzip(archive: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(archive.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const localName = view.getUint16(local + 26, true);
    const dataStart = local + 30 + localName + view.getUint16(local + 28, true);
    files.push({ name, crc, data: archive.subarray(dataStart, dataStart + size) });
    at += 46 + nameLength;
  }
  return files;
}

describe('zip', () => {
  it('stores files so they read back byte for byte, with correct CRCs', () => {
    const a = new TextEncoder().encode('first page');
    const b = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37) & 0xff);
    const files = unzip(zip([
      { name: 'page-1.png', data: a },
      { name: 'päge-2.png', data: b },
    ]));
    expect(files.map((f) => f.name)).toEqual(['page-1.png', 'päge-2.png']);
    expect(files[0].data).toEqual(a);
    expect(files[1].data).toEqual(b);
    expect(files[0].crc).toBe(referenceCrc32(a));
    expect(files[1].crc).toBe(referenceCrc32(b));
  });

  it('makes a valid empty archive', () => {
    const empty = zip([]);
    expect(empty).toHaveLength(22);
    expect(unzip(empty)).toEqual([]);
  });
});

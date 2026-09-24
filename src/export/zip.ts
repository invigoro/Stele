import { crc32 } from './png';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** 1 January 1980, the earliest date a ZIP can record, in MS-DOS format. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
/** Names are UTF-8 (general-purpose flag bit 11). */
const UTF8 = 0x0800;

/**
 * A ZIP archive of the given files, stored without compression: the PNGs it's used for
 * are compressed already.
 */
export function zip(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const files = entries.map((entry) => ({ ...entry, nameBytes: encoder.encode(entry.name), crc: crc32(entry.data) }));
  const localSize = files.reduce((sum, f) => sum + 30 + f.nameBytes.length + f.data.length, 0);
  const centralSize = files.reduce((sum, f) => sum + 46 + f.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (value: number) => {
    view.setUint16(at, value, true);
    at += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(at, value, true);
    at += 4;
  };
  const bytes = (data: Uint8Array) => {
    out.set(data, at);
    at += data.length;
  };

  const offsets: number[] = [];
  for (const f of files) {
    offsets.push(at);
    u32(0x04034b50); // local file header
    u16(20); // version needed: 2.0
    u16(UTF8);
    u16(0); // stored
    u16(0); // time
    u16(DOS_DATE);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.nameBytes.length);
    u16(0); // no extra field
    bytes(f.nameBytes);
    bytes(f.data);
  }
  const centralStart = at;
  files.forEach((f, i) => {
    u32(0x02014b50); // central directory header
    u16(20); // made by: 2.0
    u16(20); // needed: 2.0
    u16(UTF8);
    u16(0);
    u16(0);
    u16(DOS_DATE);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.nameBytes.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i]);
    bytes(f.nameBytes);
  });
  u32(0x06054b50); // end of central directory
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(at - centralStart); // central directory size
  u32(centralStart);
  u16(0); // comment
  return out;
}

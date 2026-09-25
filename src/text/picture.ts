/**
 * Pictures written on the medium instead of text: loaded from an upload or a link,
 * and turned into coverage (how much of each pixel is "writing") for the text mask, so
 * a picture is carved, inked or cast exactly as letters are.
 */

/** Which parts of the picture are written: everything opaque, the dark parts, or the light parts. */
export type PictureUse = 'opaque' | 'dark' | 'light';

export interface PictureSettings {
  /** An http(s) link, or `upload:` and the id of a picture stored in this browser. */
  src: string;
  use: PictureUse;
  /** For dark or light parts: how dark (or light) a pixel must be to count, 0–1. */
  threshold: number;
}

export const PICTURE_USES: Record<PictureUse, string> = {
  opaque: 'Everything not transparent',
  dark: 'The dark parts (a drawing on white)',
  light: 'The light parts (white on dark)',
};

export const UPLOAD = 'upload:';

/** Longest side pictures are kept at, px: plenty for 300 DPI across a handout's text area. */
const MAX_SIDE = 2048;

/** How much of each pixel counts as writing, 0–255, from straight-alpha RGBA pixels. */
export function coverageValues(pixels: Uint8ClampedArray, use: PictureUse, threshold: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length / 4);
  // A narrow soft band around the threshold keeps edges smooth.
  const t = use === 'opaque' ? 0.5 : threshold;
  const [low, high] = [t - 0.08, t + 0.08];
  for (let i = 0; i < out.length; i++) {
    const alpha = pixels[4 * i + 3] / 255;
    const light = (0.2126 * pixels[4 * i] + 0.7152 * pixels[4 * i + 1] + 0.0722 * pixels[4 * i + 2]) / 255;
    const value = use === 'opaque' ? alpha : (use === 'dark' ? 1 - light : light) * alpha;
    const x = Math.min(1, Math.max(0, (value - low) / (high - low)));
    out[i] = Math.round(x * x * (3 - 2 * x) * 255);
  }
  return out;
}

/** Whether a picture has a see-through background worth keeping (more than 1% of it). */
export function hasTransparency(pixels: Uint8ClampedArray): boolean {
  let clear = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 250) clear++;
  return clear > 0.01 * (pixels.length / 4);
}

// Loaded pictures, by src: pending loads, and the pixels once they're in.
const loading = new Map<string, Promise<ImageData>>();
const loaded = new Map<string, ImageData>();

/** Loads a picture's pixels (once; later calls share the result). */
export function loadPicture(src: string): Promise<ImageData> {
  let promise = loading.get(src);
  if (!promise) {
    promise = fetchPicture(src).then(decode);
    promise.then((image) => loaded.set(src, image)).catch(() => loading.delete(src)); // allow a retry
    loading.set(src, promise);
  }
  return promise;
}

/** A loaded picture's pixels, if it has loaded. */
export function loadedPicture(src: string): ImageData | undefined {
  return loaded.get(src);
}

/** Stores an uploaded or pasted picture in this browser and returns its src. */
export async function saveUpload(blob: Blob): Promise<string> {
  if (!blob.type.startsWith('image/')) throw new Error('That file isn’t a picture.');
  const image = await decode(blob);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const src = UPLOAD + id;
  try {
    // Encode first: a transaction closes if it's left waiting.
    const png = await pngOf(image);
    await store('readwrite', (pictures) => pictures.put(png, id));
  } catch {
    // Private browsing or storage full: it still works until the page is reloaded.
  }
  loaded.set(src, image);
  loading.set(src, Promise.resolve(image));
  void pruneUploads(id);
  return src;
}

const coverages = new Map<string, HTMLCanvasElement>();

/**
 * A loaded picture's coverage as an image for the text mask: red is coverage, on
 * black. Null if the picture hasn't loaded.
 */
export function pictureCoverage(picture: PictureSettings): HTMLCanvasElement | null {
  const image = loaded.get(picture.src);
  if (!image) return null;
  const key = `${picture.src}|${picture.use}|${picture.threshold}`;
  let canvas = coverages.get(key);
  if (!canvas) {
    const values = coverageValues(image.data, picture.use, picture.threshold);
    const pixels = new Uint8ClampedArray(image.data.length);
    for (let i = 0; i < values.length; i++) {
      pixels[4 * i] = values[i];
      pixels[4 * i + 3] = 255;
    }
    canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')?.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
    // Only the settings in use are worth keeping.
    for (const old of coverages.keys()) if (old.startsWith(`${picture.src}|`)) coverages.delete(old);
    coverages.set(key, canvas);
  }
  return canvas;
}

async function fetchPicture(src: string): Promise<Blob> {
  if (src.startsWith(UPLOAD)) {
    const blob = await store('readonly', (pictures) => pictures.get(src.slice(UPLOAD.length))).catch(() => undefined);
    if (!(blob instanceof Blob)) {
      throw new Error('This handout’s picture was added in another browser or on another device. Add it again to see it here.');
    }
    return blob;
  }
  let response: Response;
  try {
    response = await fetch(src, { mode: 'cors' });
  } catch {
    throw new Error('Couldn’t load that picture: the site may not let other pages use it. Save it and upload it instead.');
  }
  if (!response.ok) throw new Error(`Couldn’t load that picture (the site answered ${response.status}).`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('That link isn’t to a picture.');
  return blob;
}

/** Decodes a picture, shrinking it to MAX_SIDE, into straight-alpha pixels. */
async function decode(blob: Blob): Promise<ImageData> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error('That picture couldn’t be read. Try a PNG, JPEG, WebP, GIF or SVG.');
    });
    // An SVG without a size of its own gets a generous one.
    const [w0, h0] = image.naturalWidth && image.naturalHeight ? [image.naturalWidth, image.naturalHeight] : [MAX_SIDE, MAX_SIDE];
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const width = Math.max(1, Math.round(w0 * scale));
    const height = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pngOf(image: ImageData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')?.putImageData(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not store the picture'))), 'image/png'),
  );
}

// Uploads live in IndexedDB, which (unlike localStorage) has room for pictures.

const DATABASE = 'stele';
const PICTURES = 'pictures';
/** Uploads kept, newest first; older ones are deleted. */
const KEEP = 5;

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(PICTURES);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store<T>(mode: IDBTransactionMode, work: (pictures: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = work(db.transaction(PICTURES, mode).objectStore(PICTURES));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function pruneUploads(newest: string): Promise<void> {
  try {
    const ids = (await store('readonly', (pictures) => pictures.getAllKeys())).map(String).sort().reverse();
    for (const id of ids.slice(KEEP)) if (id !== newest) await store('readwrite', (pictures) => pictures.delete(id));
  } catch {
    // Nothing to tidy.
  }
}

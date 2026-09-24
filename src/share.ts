import { isMediumId, MEDIA, type MediumDef } from './media/media';
import type { ShapeId } from './media/shapes';
import type { MethodId } from './media/writing';
import { defaultSettings, randomSeeds, type Seeds, type Settings } from './settings';
import { isFontId } from './text/fonts';

/** Bumped when the stored shape of settings changes incompatibly. */
const VERSION = 1;
/** Longest text kept from a link, so a pasted novel can't make a link unusable. */
const MAX_TEXT = 4000;

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/**
 * Turns anything (a decoded link, stored settings from an older version) into valid
 * settings: unknown or out-of-range values fall back to the medium's defaults. Returns
 * null if not even the medium is recognisable.
 */
export function sanitizeSettings(data: unknown): Settings | null {
  if (!data || typeof data !== 'object') return null;
  const input = data as Record<string, unknown>;
  if (typeof input.medium !== 'string' || !isMediumId(input.medium)) return null;
  const medium: MediumDef = MEDIA[input.medium];

  const seedsIn = (input.seeds ?? {}) as Record<string, unknown>;
  const fresh = randomSeeds();
  const seeds = Object.fromEntries(
    (Object.keys(fresh) as (keyof Seeds)[]).map((key) => {
      const value = seedsIn[key];
      return [key, typeof value === 'number' && Number.isInteger(value) ? value >>> 0 : fresh[key]];
    }),
  ) as unknown as Seeds;

  const base = defaultSettings(input.medium, seeds);
  const mixIn = (input.damageMix ?? {}) as Record<string, unknown>;
  const lightIn = input.light as Record<string, unknown> | null | undefined;

  return {
    ...base,
    variant: typeof input.variant === 'string' && input.variant in medium.variants ? input.variant : base.variant,
    method: medium.methods.includes(input.method as MethodId) ? (input.method as MethodId) : base.method,
    shape: medium.shapes.includes(input.shape as ShapeId) ? (input.shape as ShapeId) : base.shape,
    text: typeof input.text === 'string' ? input.text.slice(0, MAX_TEXT) : base.text,
    textEdited: typeof input.textEdited === 'boolean' ? input.textEdited : typeof input.text === 'string',
    font: typeof input.font === 'string' && isFontId(input.font) ? input.font : base.font,
    align: input.align === 'left' || input.align === 'center' || input.align === 'right' ? input.align : base.align,
    textScale: clamp(input.textScale, 0.3, 1, base.textScale),
    roman: typeof input.roman === 'boolean' ? input.roman : base.roman,
    objectScale: clamp(input.objectScale, 0.5, 1.5, base.objectScale),
    transparent: typeof input.transparent === 'boolean' ? input.transparent : base.transparent,
    damage: clamp(input.damage, 0, 1, base.damage),
    damageMix: Object.fromEntries(
      Object.entries(base.damageMix).map(([id, weight]) => [id, clamp(mixIn[id], 0, 1, weight ?? 0)]),
    ),
    fade: clamp(input.fade, 0, 1, base.fade),
    light:
      lightIn && typeof lightIn === 'object'
        ? {
            azimuth: clamp(lightIn.azimuth, 0, 360, medium.light.azimuth),
            elevation: clamp(lightIn.elevation, 8, 80, medium.light.elevation),
          }
        : null,
  };
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, transform: CompressionStream | DecompressionStream) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Settings as a compact, URL-safe string. */
export async function encodeSettings(settings: Settings): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ v: VERSION, ...settings }));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** The settings in a string from encodeSettings, or null if it isn't one. */
export async function decodeSettings(encoded: string): Promise<Settings | null> {
  try {
    const json = await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw'));
    return sanitizeSettings(JSON.parse(new TextDecoder().decode(json)));
  } catch {
    return null;
  }
}

const HASH_PREFIX = '#s=';
const STORAGE_KEY = 'stele:settings';

/** Settings from the page's URL, if it carries any. */
export async function settingsFromUrl(hash: string): Promise<Settings | null> {
  return hash.startsWith(HASH_PREFIX) ? decodeSettings(hash.slice(HASH_PREFIX.length)) : null;
}

export async function urlHashFor(settings: Settings): Promise<string> {
  return HASH_PREFIX + (await encodeSettings(settings));
}

/** The last settings used in this browser, if any were saved. */
export function loadSaved(): Settings | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? sanitizeSettings(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

export function save(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, ...settings }));
  } catch {
    // Storage can be full or blocked (private windows); autosave is only a convenience.
  }
}

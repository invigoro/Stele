import { MAX_BLOCKS, newBlockId, normalizeAngle, type Block, type BlockRole, type Frame } from './blocks';
import { MAX_POINTS, MAX_STROKES, PAINT_KINDS, quantizeFor, type Stroke, type StrokeKind } from './damage/paint';
import { isMediumId, MEDIA, type MediumDef, type MediumId } from './media/media';
import type { ShapeId } from './media/shapes';
import type { MethodId } from './media/writing';
import { defaultSettings, randomSeeds, templateText, withText, type Seeds, type Settings, type TextPatch } from './settings';
import type { Align } from './text/layout';
import { isFontId } from './text/fonts';
import { PICTURE_USES, type PictureSettings, type PictureUse } from './text/picture';
import { isScriptId } from './text/scripts';

/** Bumped when the stored shape of settings changes incompatibly. */
const VERSION = 1;
/** Longest text kept from a link, so a pasted novel can't make a link unusable. */
const MAX_TEXT = 4000;
/** Longest signature kept. */
const MAX_SIGNATURE = 120;

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Valid strokes from untrusted data; anything malformed is dropped. */
const STROKE_KINDS: readonly StrokeKind[] = [...PAINT_KINDS, 'pen'];

/** A valid picture from untrusted data: a web link or a stored upload, or null. */
function sanitizePicture(data: unknown): PictureSettings | null {
  if (!data || typeof data !== 'object') return null;
  const { src, use, threshold } = data as Record<string, unknown>;
  if (typeof src !== 'string' || src.length > 2000) return null;
  if (!/^https?:\/\/\S+$/i.test(src) && !/^upload:[a-z0-9]{1,40}$/i.test(src)) return null;
  return {
    src,
    use: typeof use === 'string' && use in PICTURE_USES ? (use as PictureUse) : 'opaque',
    threshold: clamp(threshold, 0.05, 0.95, 0.5),
  };
}

function sanitizeStrokes(data: unknown): Stroke[] {
  if (!Array.isArray(data)) return [];
  const strokes: Stroke[] = [];
  for (const item of data.slice(0, MAX_STROKES)) {
    if (!item || typeof item !== 'object') continue;
    const { kind, radius, points, page } = item as Record<string, unknown>;
    if (!STROKE_KINDS.includes(kind as StrokeKind) || !Array.isArray(points)) continue;
    const round = quantizeFor(kind as StrokeKind);
    // Damage in fractions of the object, pen lines in shorter sides from its centre.
    const [low, high] = kind === 'pen' ? [-4, 4] : [-1, 2];
    const valid = points
      .slice(0, MAX_POINTS)
      .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)))
      .map(([u, v]): [number, number] => [round(Math.min(high, Math.max(low, u))), round(Math.min(high, Math.max(low, v)))]);
    if (valid.length === 0) continue;
    strokes.push({
      kind: kind as StrokeKind,
      radius: clamp(radius, 0.0003, 0.5, 0.03),
      points: valid,
      page: Math.round(clamp(page, 0, 99, 0)),
    });
  }
  return strokes;
}

const isAlign = (value: unknown): value is Align => value === 'left' || value === 'center' || value === 'right';

/** A valid frame, or null for a block arranged with the template. */
function sanitizeFrame(data: unknown): Frame | null {
  if (!data || typeof data !== 'object') return null;
  const { cx, cy, w, h, angle } = data as Record<string, unknown>;
  if (![cx, cy, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return {
    cx: clamp(cx, -0.5, 1.5, 0.5),
    cy: clamp(cy, -0.5, 1.5, 0.5),
    w: clamp(w, 0.01, 4, 0.5),
    h: clamp(h, 0.01, 4, 0.5),
    angle: typeof angle === 'number' && Number.isFinite(angle) ? normalizeAngle(angle) : 0,
  };
}

/** Valid blocks from untrusted data; anything malformed is dropped. */
function sanitizeBlocks(data: unknown[], medium: MediumId): Block[] {
  const template = templateText(medium);
  const ids = new Set<string>();
  const blocks: Block[] = [];
  let flowing = false;
  for (const item of data.slice(0, MAX_BLOCKS)) {
    if (!item || typeof item !== 'object') continue;
    const input = item as Record<string, unknown>;
    let id = typeof input.id === 'string' && /^[a-z0-9_-]{1,24}$/i.test(input.id) ? input.id : newBlockId();
    while (ids.has(id)) id = newBlockId();
    const common = {
      id,
      frame: sanitizeFrame(input.frame),
      page: Math.round(clamp(input.page, 0, 99, 0)),
      ...(input.role === 'main' || input.role === 'signature' ? { role: input.role as BlockRole } : {}),
      align: isAlign(input.align) ? input.align : template.align,
    };
    if (input.kind === 'picture') {
      const picture = sanitizePicture(input);
      if (!picture) continue;
      blocks.push({ ...common, ...picture, kind: 'picture', size: clamp(input.size, 0.05, 1, 1) });
    } else if (input.kind === 'text') {
      // Only the first block that runs on to more pages does.
      const flow: boolean = input.flow === true && !flowing;
      flowing ||= flow;
      blocks.push({
        ...common,
        kind: 'text',
        text: typeof input.text === 'string' ? input.text.slice(0, MAX_TEXT) : '',
        font: typeof input.font === 'string' && isFontId(input.font) ? input.font : template.font,
        script: isScriptId(input.script) ? input.script : 'latin',
        roman: input.roman === true,
        size: clamp(input.size, 0.3, 1, 1),
        flow,
        byHand: input.byHand === true,
      });
    } else {
      continue;
    }
    ids.add(id);
  }
  return blocks;
}

/** Writing saved before blocks existed (one text, a signature, a picture), checked. */
function legacyText(input: Record<string, unknown>): TextPatch {
  const patch: TextPatch = {};
  if (typeof input.text === 'string') patch.text = input.text.slice(0, MAX_TEXT);
  if (typeof input.font === 'string' && isFontId(input.font)) patch.font = input.font;
  if (isAlign(input.align)) patch.align = input.align;
  if (typeof input.textScale === 'number') patch.textScale = clamp(input.textScale, 0.3, 1, 1);
  if (input.pages === 'fit' || input.pages === 'flow') patch.pages = input.pages;
  if (typeof input.roman === 'boolean') patch.roman = input.roman;
  // Handouts saved before scripts existed were all in Latin letters.
  patch.script = isScriptId(input.script) ? input.script : 'latin';
  if (typeof input.signature === 'string') patch.signature = input.signature.replace(/\s+/g, ' ').trim().slice(0, MAX_SIGNATURE);
  if (typeof input.signatureFont === 'string' && isFontId(input.signatureFont)) patch.signatureFont = input.signatureFont;
  const picture = sanitizePicture(input.picture);
  if (input.writing === 'picture' && picture) {
    patch.writing = 'picture';
    patch.picture = picture;
  }
  return patch;
}

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
  // A saved mix lists every damage type its medium had at the time. Types added since
  // start at nothing, so an old handout comes back as it was.
  const mixIn = input.damageMix && typeof input.damageMix === 'object' ? (input.damageMix as Record<string, unknown>) : null;
  const lightIn = input.light as Record<string, unknown> | null | undefined;

  const settings: Settings = {
    ...base,
    variant: typeof input.variant === 'string' && input.variant in medium.variants ? input.variant : base.variant,
    method: medium.methods.includes(input.method as MethodId) ? (input.method as MethodId) : base.method,
    shape: medium.shapes.includes(input.shape as ShapeId) ? (input.shape as ShapeId) : base.shape,
    blocks: Array.isArray(input.blocks) ? sanitizeBlocks(input.blocks, input.medium) : base.blocks,
    textEdited: typeof input.textEdited === 'boolean' ? input.textEdited : typeof input.text === 'string',
    objectScale: clamp(input.objectScale, 0.5, 1.5, base.objectScale),
    transparent: typeof input.transparent === 'boolean' ? input.transparent : base.transparent,
    damage: clamp(input.damage, 0, 1, base.damage),
    damageMix: Object.fromEntries(
      Object.entries(base.damageMix).map(([id, weight]) => [id, mixIn ? clamp(mixIn[id], 0, 1, 0) : (weight ?? 0)]),
    ),
    fade: clamp(input.fade, 0, 1, base.fade),
    strokes: sanitizeStrokes(input.strokes),
    light:
      lightIn && typeof lightIn === 'object'
        ? {
            azimuth: clamp(lightIn.azimuth, 0, 360, medium.light.azimuth),
            elevation: clamp(lightIn.elevation, 8, 80, medium.light.elevation),
          }
        : null,
  };
  return Array.isArray(input.blocks) ? settings : withText(settings, legacyText(input));
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

/** A block without the fields that say what their absence means anyway, to keep links short. */
function compactBlock(block: Block): Partial<Block> {
  const compact: Record<string, unknown> = { ...block };
  const defaults: Record<string, unknown> = { frame: null, page: 0, script: 'latin', roman: false, byHand: false, size: 1 };
  for (const [key, value] of Object.entries(defaults)) if (compact[key] === value) delete compact[key];
  return compact as Partial<Block>;
}

/** Settings as a compact, URL-safe string. */
export async function encodeSettings(settings: Settings): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ v: VERSION, ...settings, blocks: settings.blocks.map(compactBlock) }));
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

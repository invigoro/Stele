import { mainBlock, type Block, type PictureBlock, type TextBlock } from './blocks';
import type { Stroke } from './damage/paint';
import type { DamageMix } from './damage/types';
import { MEDIA, type MediumDef, type MediumId } from './media/media';
import type { ShapeId } from './media/shapes';
import { METHODS, type MethodDef, type MethodId } from './media/writing';
import type { FontId } from './text/fonts';
import type { Align } from './text/layout';
import type { PageMode } from './text/pages';
import type { PictureSettings } from './text/picture';
import { SCRIPTS, type ScriptId } from './text/scripts';
import { randomSeed } from './util/rng';

/** One seed per random aspect, so rerolling one leaves the others alone. */
export interface Seeds {
  /** Marble veins, paper fibres, and the like. */
  material: number;
  /** Irregularity of the writing. */
  hand: number;
  damage: number;
  fade: number;
}

export interface Settings {
  medium: MediumId;
  /** Key into the medium's variants (colour or kind of stone, wood, paper…). */
  variant: string;
  method: MethodId;
  shape: ShapeId;
  /** What's written: blocks of text and pictures, in order (later ones on top). */
  blocks: Block[];
  /** False until the main text is edited, so switching medium can swap in its sample text. */
  textEdited: boolean;
  /** Size of the object relative to the medium's usual size (0.5–1.5). */
  objectScale: number;
  /** Download PNGs with a transparent background instead of white. */
  transparent: boolean;
  /** Overall damage, 0–1; `damageMix` weights each type. */
  damage: number;
  damageMix: DamageMix;
  /** 0–1. */
  fade: number;
  /** Damage painted by hand, and lines drawn with the pen. */
  strokes: Stroke[];
  /** Replaces the medium's light direction; null uses the medium's own. */
  light: { azimuth: number; elevation: number } | null;
  seeds: Seeds;
}

export const MAIN_ID = 'main';
export const SIGNATURE_ID = 'signature';
/** The typeface signatures are written in unless another is chosen. */
export const SIGNATURE_FONT: FontId = 'mrs-saint-delafield';

export function randomSeeds(): Seeds {
  return { material: randomSeed(), hand: randomSeed(), damage: randomSeed(), fade: randomSeed() };
}

/** The typeface a medium uses for a script: the script's own, or the medium's for Latin. */
function usualFont(medium: MediumId, script: ScriptId): FontId {
  return SCRIPTS[script].font ?? MEDIA[medium].font;
}

/** A medium's template text block, with its sample text. */
export function templateText(medium: MediumId): TextBlock {
  const def: MediumDef = MEDIA[medium];
  const script = def.script ?? 'latin';
  return {
    id: MAIN_ID,
    kind: 'text',
    role: 'main',
    frame: null,
    page: 0,
    text: def.text,
    font: usualFont(medium, script),
    script,
    roman: false,
    align: def.align,
    size: 1,
    // Letters run on to more sheets; inscriptions shrink to fit their stone or board.
    flow: def.family === 'sheet',
    byHand: false,
  };
}

/** A text block of the given kind, for adding to a handout. */
export function newTextBlock(id: string, medium: MediumId, patch: Partial<TextBlock> = {}): TextBlock {
  return { ...templateText(medium), id, role: undefined, text: 'New text', flow: false, ...patch };
}

/** A signature, signed below the block before it. */
export function newSignature(id: string, medium: MediumId, text: string, font: FontId = SIGNATURE_FONT): TextBlock {
  return { ...templateText(medium), id, role: 'signature', text, font, script: 'latin', flow: false, byHand: true, align: 'right' };
}

export function defaultSettings(medium: MediumId, seeds: Seeds = randomSeeds()): Settings {
  const def: MediumDef = MEDIA[medium];
  return {
    medium,
    variant: Object.keys(def.variants)[0],
    method: def.methods[0],
    shape: def.shapes[0],
    blocks: [templateText(medium)],
    textEdited: false,
    objectScale: 1,
    transparent: false,
    damage: 0.3,
    damageMix: { ...def.damage },
    fade: 0.2,
    strokes: [],
    light: null,
    seeds,
  };
}

/**
 * Settings for the handout's writing in the shape older versions kept them: one text,
 * a signature and a picture. Presets are written this way, and handouts saved before
 * blocks existed are read this way.
 */
export interface TextPatch {
  text?: string;
  font?: FontId;
  script?: ScriptId;
  roman?: boolean;
  align?: Align;
  textScale?: number;
  pages?: PageMode;
  /** Empty for none. */
  signature?: string;
  signatureFont?: FontId;
  /** A picture in place of the text. */
  writing?: 'text' | 'picture';
  picture?: PictureSettings | null;
}

export const TEXT_PATCH_KEYS = [
  'text', 'font', 'script', 'roman', 'align', 'textScale', 'pages', 'signature', 'signatureFont', 'writing', 'picture',
] as const satisfies readonly (keyof TextPatch)[];

/** Splits settings written the older way into the rest and their writing. */
export function splitTextPatch<T extends object>(input: T): { rest: Omit<T, keyof TextPatch>; patch: TextPatch } {
  const rest = { ...input } as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of TEXT_PATCH_KEYS) {
    if (key in rest) {
      patch[key] = rest[key];
      delete rest[key];
    }
  }
  return { rest: rest as Omit<T, keyof TextPatch>, patch: patch as TextPatch };
}

/** Applies writing given the older way to the main block (and the signature). */
export function withText(settings: Settings, patch: TextPatch): Settings {
  let blocks = [...settings.blocks];
  const index = blocks.findIndex((block) => block === mainBlock(blocks));
  const current = index >= 0 ? blocks[index] : undefined;
  let main: TextBlock = current?.kind === 'text' ? current : templateText(settings.medium);
  main = {
    ...main,
    ...(patch.text !== undefined ? { text: patch.text } : {}),
    ...(patch.font !== undefined ? { font: patch.font } : {}),
    ...(patch.script !== undefined ? { script: patch.script } : {}),
    ...(patch.roman !== undefined ? { roman: patch.roman } : {}),
    ...(patch.align !== undefined ? { align: patch.align } : {}),
    ...(patch.textScale !== undefined ? { size: patch.textScale } : {}),
    ...(patch.pages !== undefined ? { flow: patch.pages === 'flow' } : {}),
  };
  let written: Block = main;
  if (patch.writing === 'picture' && patch.picture) {
    const picture: PictureBlock = {
      ...patch.picture,
      id: MAIN_ID,
      kind: 'picture',
      role: 'main',
      frame: null,
      page: 0,
      align: main.align,
      size: Math.min(1, Math.max(0.05, patch.textScale ?? 1)),
    };
    written = picture;
  }
  if (index >= 0) blocks[index] = written;
  else blocks.unshift(written);

  if (patch.signature !== undefined || patch.signatureFont !== undefined) {
    const existing = blocks.find((block): block is TextBlock => block.kind === 'text' && block.role === 'signature');
    blocks = blocks.filter((block) => block !== existing);
    const text = patch.signature ?? existing?.text ?? '';
    const font = patch.signatureFont ?? existing?.font ?? SIGNATURE_FONT;
    if (text.trim()) {
      const signed = existing ? { ...existing, text, font } : newSignature(SIGNATURE_ID, settings.medium, text, font);
      blocks.splice(blocks.indexOf(written) + 1, 0, signed);
    }
  }
  return { ...settings, blocks };
}

/** Replaces one block (by id) with the result of `change`. */
export function updateBlock(settings: Settings, id: string, change: (block: Block) => Block): Settings {
  return { ...settings, blocks: settings.blocks.map((block) => (block.id === id ? change(block) : block)) };
}

/**
 * Switches writing method. A method with a typeface of its own (a typewriter's) brings
 * it along for every block not written by hand, and switching away from it restores the
 * usual one, unless another typeface has been chosen since.
 */
export function changeMethod(settings: Settings, method: MethodId): Settings {
  const before: MethodDef = METHODS[settings.method];
  const after: MethodDef = METHODS[method];
  const blocks = settings.blocks.map((block) => {
    if (block.kind !== 'text' || block.byHand) return block;
    let font = block.font;
    if (after.font) font = after.font;
    else if (before.font && block.font === before.font) font = usualFont(settings.medium, block.script);
    return { ...block, font };
  });
  return { ...settings, method, blocks };
}

/**
 * Switches a text block's script. A script brings its typeface along (runes need a runic
 * one), and switching back to Latin restores the usual one, unless another has been
 * chosen since.
 */
export function changeScript(settings: Settings, id: string, script: ScriptId): Settings {
  return updateBlock(settings, id, (block) => {
    if (block.kind !== 'text') return block;
    const before = SCRIPTS[block.script].font;
    const after = SCRIPTS[script].font;
    let font = block.font;
    if (after) font = after;
    else if (before && block.font === before) font = (METHODS[settings.method] as MethodDef).font ?? MEDIA[settings.medium].font;
    return { ...block, script, font };
  });
}

/**
 * Switches medium, taking its defaults. The main text takes the new medium's sample
 * text (unless it was edited), typeface and layout; every other block stays as it was,
 * as do the wear and the output choices.
 */
export function changeMedium(settings: Settings, medium: MediumId): Settings {
  const next = defaultSettings(medium, settings.seeds);
  const template = templateText(medium);
  const current: MediumDef = MEDIA[settings.medium];
  const main = mainBlock(settings.blocks);
  const blocks = settings.blocks.map((block) => {
    if (block !== main || block.kind !== 'text') return block;
    // A script chosen on purpose carries over; a medium's own (cuneiform on clay) doesn't.
    const script = block.script === (current.script ?? 'latin') ? template.script : block.script;
    return {
      ...block,
      text: settings.textEdited ? block.text : template.text,
      script,
      font: usualFont(medium, script),
      align: template.align,
      flow: template.flow,
    };
  });
  return {
    ...next,
    blocks,
    textEdited: settings.textEdited,
    objectScale: settings.objectScale,
    transparent: settings.transparent,
    damage: settings.damage,
    fade: settings.fade,
    strokes: settings.strokes,
  };
}

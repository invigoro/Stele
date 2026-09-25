import type { Stroke } from './damage/paint';
import type { DamageMix } from './damage/types';
import { MEDIA, type MediumDef, type MediumId } from './media/media';
import type { ShapeId } from './media/shapes';
import { METHODS, type MethodDef, type MethodId } from './media/writing';
import type { FontId } from './text/fonts';
import type { Align } from './text/layout';
import type { PageMode } from './text/pages';
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
  text: string;
  /** False until the text is edited, so switching medium can swap in its sample text. */
  textEdited: boolean;
  font: FontId;
  align: Align;
  /** Fraction (0.3–1) of the largest text size that fits. */
  textScale: number;
  /** Shrink long text onto one page, or continue it onto more pages. */
  pages: PageMode;
  /** Classical Roman letter forms: capitals, V for U, I for J, dots between words. */
  roman: boolean;
  /** Size of the object relative to the medium's usual size (0.5–1.5). */
  objectScale: number;
  /** Download PNGs with a transparent background instead of white. */
  transparent: boolean;
  /** Overall damage, 0–1; `damageMix` weights each type. */
  damage: number;
  damageMix: DamageMix;
  /** 0–1. */
  fade: number;
  /** Damage painted by hand. */
  strokes: Stroke[];
  /** Replaces the medium's light direction; null uses the medium's own. */
  light: { azimuth: number; elevation: number } | null;
  seeds: Seeds;
}

export function randomSeeds(): Seeds {
  return { material: randomSeed(), hand: randomSeed(), damage: randomSeed(), fade: randomSeed() };
}

export function defaultSettings(medium: MediumId, seeds: Seeds = randomSeeds()): Settings {
  const def: MediumDef = MEDIA[medium];
  return {
    medium,
    variant: Object.keys(def.variants)[0],
    method: def.methods[0],
    shape: def.shapes[0],
    text: def.text,
    textEdited: false,
    font: def.font,
    align: def.align,
    textScale: 1,
    // Letters run on to more sheets; inscriptions shrink to fit their stone or board.
    pages: def.family === 'sheet' ? 'flow' : 'fit',
    roman: false,
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
 * Switches writing method. A method with a typeface of its own (a typewriter's) brings
 * it along, and switching away from it restores the medium's usual one, unless another
 * typeface has been chosen since.
 */
export function changeMethod(settings: Settings, method: MethodId): Settings {
  const before: MethodDef = METHODS[settings.method];
  const after: MethodDef = METHODS[method];
  let font = settings.font;
  if (after.font) font = after.font;
  else if (before.font && settings.font === before.font) font = MEDIA[settings.medium].font;
  return { ...settings, method, font };
}

/**
 * Switches medium, taking its defaults; keeps the text if it was edited, the wear, and
 * the output choices.
 */
export function changeMedium(settings: Settings, medium: MediumId): Settings {
  const next = defaultSettings(medium, settings.seeds);
  return {
    ...next,
    text: settings.textEdited ? settings.text : next.text,
    textEdited: settings.textEdited,
    roman: settings.roman,
    objectScale: settings.objectScale,
    transparent: settings.transparent,
    damage: settings.damage,
    fade: settings.fade,
    strokes: settings.strokes,
  };
}

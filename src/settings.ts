import type { DamageMix } from './damage/types';
import { MEDIA, type MediumDef, type MediumId } from './media/media';
import type { ShapeId } from './media/shapes';
import type { MethodId } from './media/writing';
import type { FontId } from './text/fonts';
import type { Align } from './text/layout';
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
  /** Overall damage, 0–1; `damageMix` weights each type. */
  damage: number;
  damageMix: DamageMix;
  /** 0–1. */
  fade: number;
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
    damage: 0.3,
    damageMix: { ...def.damage },
    fade: 0.2,
    light: null,
    seeds,
  };
}

/** Switches medium, taking its defaults; keeps the text if it was edited, and the wear. */
export function changeMedium(settings: Settings, medium: MediumId): Settings {
  const next = defaultSettings(medium, settings.seeds);
  return {
    ...next,
    text: settings.textEdited ? settings.text : next.text,
    textEdited: settings.textEdited,
    damage: settings.damage,
    fade: settings.fade,
  };
}

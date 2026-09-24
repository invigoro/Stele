import { MEDIA, type MediumId } from './media/media';
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
  text: string;
  /** False until the text is edited, so switching medium can swap in its sample text. */
  textEdited: boolean;
  font: FontId;
  align: Align;
  /** Fraction (0.3–1) of the largest text size that fits. */
  textScale: number;
  /** 0–1. */
  damage: number;
  /** 0–1. */
  fade: number;
  seeds: Seeds;
}

export function randomSeeds(): Seeds {
  return { material: randomSeed(), hand: randomSeed(), damage: randomSeed(), fade: randomSeed() };
}

export function defaultSettings(medium: MediumId, seeds: Seeds = randomSeeds()): Settings {
  const def = MEDIA[medium];
  return {
    medium,
    text: def.text,
    textEdited: false,
    font: def.font,
    align: def.align,
    textScale: 1,
    damage: 0.25,
    fade: 0.2,
    seeds,
  };
}

/** Switches medium, taking its font and layout; keeps the text if it was edited. */
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

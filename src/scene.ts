import { generateBurns, type Burn } from './damage/burns';
import { generateBreaks, generateChips, type Chip } from './damage/chips';
import { generateCracks, type Crack } from './damage/cracks';
import { generateHoles, type Hole } from './damage/holes';
import {
  generateFolds,
  generateFragmentCuts,
  generateSmudges,
  generateTears,
  type Cut,
  type Fold,
  type Smudge,
} from './damage/sheetDamage';
import { generateStains, type Stain } from './damage/stains';
import { damageAmounts, type DamageId } from './damage/types';
import { MEDIA, type Light, type MediumDef } from './media/media';
import { textBox, type ShapeId } from './media/shapes';
import { METHODS, type MethodDef, type Rgb } from './media/writing';
import type { Settings } from './settings';
import { FONTS, type FontDef } from './text/fonts';
import { drawText, type Drawing } from './text/hand';
import { layoutText, type Box, type Measure } from './text/layout';
import { mulberry32 } from './util/rng';

/** Blank space around the object in the rendered image, mm. */
export const MARGIN_MM = 4;

/** Damage placed as individual features (see damage/features.ts). */
export interface Features {
  chips: Chip[];
  stains: Stain[];
  holes: Hole[];
  burns: Burn[];
  tears: Cut[];
  folds: Fold[];
  smudges: Smudge[];
  /** Big breaks that make a stone into a fragment. */
  cuts: Cut[];
}

/** Damage computed across the whole surface in the shaders, by amount (0–1). */
export interface FieldDamage {
  soot: number;
  lichen: number;
  pitting: number;
  flaking: number;
  rot: number;
  foxing: number;
  fraying: number;
  darkening: number;
}

/** Everything the renderer needs for one image, in millimetres. */
export interface Scene {
  medium: MediumDef;
  font: FontDef;
  method: MethodDef;
  shape: ShapeId;
  palette: readonly Rgb[];
  width: number;
  height: number;
  margin: number;
  textBox: Box;
  drawing: Drawing;
  features: Features;
  cracks: Crack[];
  fields: FieldDamage;
  fade: number;
  damage: number;
  light: Light;
  /** Offsets into noise space for each random aspect. */
  offsets: {
    material: [number, number];
    fade: [number, number];
    damage: [number, number];
  };
}

function noiseOffset(seed: number): [number, number] {
  const random = mulberry32(seed);
  return [random() * 100 - 50, random() * 100 - 50];
}

/** A seed for one damage type, derived from the damage seed so each type varies independently. */
function seedFor(seed: number, type: string): number {
  let hash = 0x811c9dc5;
  for (const char of type) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return (seed ^ hash) >>> 0;
}

/** Lays out the text and places the damage for `settings`, measuring with `measure`. */
export function buildScene(settings: Settings, measure: Measure): Scene {
  const medium: MediumDef = MEDIA[settings.medium];
  const font: FontDef = FONTS[settings.font];
  const method: MethodDef = METHODS[settings.method];
  const variant = medium.variants[settings.variant] ?? Object.values(medium.variants)[0];
  const { width, height, thickness } = medium;
  const box = textBox(settings.shape, width, height, medium.padding);

  const layout = layoutText(
    {
      text: settings.text,
      box,
      align: settings.align,
      verticalAlign: medium.verticalAlign,
      wrap: medium.wrap,
      lineHeight: font.lineHeight,
      letterSpacing: font.letterSpacing,
      scale: settings.textScale,
      maxSize: medium.maxTextSize,
    },
    measure,
  );
  const hand = { ...medium.hand, perGlyph: medium.hand.perGlyph && !font.connected };

  const amounts = damageAmounts(settings.damage, settings.damageMix);
  const amount = (id: DamageId) => (id in medium.damage ? (amounts[id] ?? 0) : 0);
  const seed = (id: string) => seedFor(settings.seeds.damage, id);
  const grain = medium.grain;

  const features: Features = {
    chips: [
      ...generateChips(amount('chips'), width, height, seed('chips')),
      ...generateBreaks(amount('breaks'), width, height, thickness, seed('breaks')),
      ...generateChips(amount('gouges'), width, height, seed('gouges'), { grain }),
    ],
    stains: generateStains(amount('water'), width, height, seed('water')),
    holes: generateHoles(medium.holes ?? 'worm', amount('holes'), width, height, seed('holes')),
    burns: generateBurns(amount('burns'), width, height, seed('burns')),
    tears: generateTears(amount('tears'), width, height, seed('tears')),
    folds: generateFolds(amount('folds'), width, height, seed('folds')),
    smudges: generateSmudges(amount('smudges'), box, seed('smudges')),
    cuts: settings.shape === 'fragment' ? generateFragmentCuts(width, height, seed('fragment')) : [],
  };
  const cracks = [
    ...generateCracks(amount('cracks'), width, height, seed('cracks')),
    ...(grain !== undefined ? generateCracks(amount('splits'), width, height, seed('splits'), { grain }) : []),
  ];

  return {
    medium,
    font,
    method,
    shape: settings.shape,
    palette: variant.palette,
    width,
    height,
    margin: MARGIN_MM,
    textBox: box,
    drawing: drawText(layout, measure, hand, settings.seeds.hand),
    features,
    cracks,
    fields: {
      soot: amount('stains'),
      lichen: amount('lichen'),
      pitting: amount('pitting'),
      flaking: amount('flaking'),
      rot: amount('rot'),
      foxing: amount('foxing'),
      fraying: amount('fraying'),
      darkening: amount('darkening'),
    },
    fade: settings.fade,
    damage: settings.damage,
    light: { ...medium.light, ...(settings.light ?? {}) },
    offsets: {
      material: noiseOffset(settings.seeds.material),
      fade: noiseOffset(settings.seeds.fade),
      damage: noiseOffset(settings.seeds.damage),
    },
  };
}

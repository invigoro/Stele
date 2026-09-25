import { generateBurns, type Burn } from './damage/burns';
import { generateBreaks, generateChips, type Chip } from './damage/chips';
import { generateCracks, type Crack } from './damage/cracks';
import { generateHoles, type Hole } from './damage/holes';
import { markedAreas, obliterate, protectAreas } from './damage/marks';
import { generateDents, generateScratches } from './damage/metalDamage';
import type { Stroke } from './damage/paint';
import {
  generateBlots,
  generateFolds,
  generateFragmentCuts,
  generateSmudges,
  generateTears,
  type Blot,
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
import { normalizeText, parseMarkup } from './text/markup';
import { paginate } from './text/pages';
import { romanize } from './text/roman';
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
  /** Ink blots, dropped at random or over words marked [[like this]]. */
  blots: Blot[];
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
  verdigris: number;
}

/** Everything the renderer needs for one image (one page), in millimetres. */
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
  /** Areas kept clear of spread-out damage: words marked {{like this}}. */
  protect: Box[];
  /** Damage painted by hand on this page. */
  strokes: Stroke[];
  /** Which page this is (from 0), and how many there are. */
  page: number;
  pageCount: number;
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

/** A page's own version of a seed; page 0 keeps the original, so one-page handouts don't change. */
function pageSeed(seed: number, page: number): number {
  return page === 0 ? seed : (seed ^ Math.imul(page, 0x9e3779b1)) >>> 0;
}

/**
 * Lays out the text and places the damage for `settings`, measuring with `measure`:
 * one scene per page. Each page gets its own sheet, hand and damage.
 */
export function buildScenes(settings: Settings, measure: Measure): Scene[] {
  const medium: MediumDef = MEDIA[settings.medium];
  const font: FontDef = FONTS[settings.font];
  const method: MethodDef = METHODS[settings.method];
  const variant = medium.variants[settings.variant] ?? Object.values(medium.variants)[0];
  const scale = Math.min(1.5, Math.max(0.5, settings.objectScale));
  const width = medium.width * scale;
  const height = medium.height * scale;
  const padding = { x: medium.padding.x * scale, y: medium.padding.y * scale };
  const box = textBox(settings.shape, width, height, padding);

  const source = normalizeText(settings.roman ? romanize(settings.text) : settings.text);
  const { text, spans } = parseMarkup(source);
  const layoutOptions = {
    box,
    align: settings.align,
    verticalAlign: medium.verticalAlign,
    wrap: medium.wrap,
    lineHeight: font.lineHeight,
    letterSpacing: font.letterSpacing,
    scale: settings.textScale,
    maxSize: Math.min(medium.maxTextSize, method.maxTextSize ?? Infinity) * scale,
  };
  const { pages, size } = paginate(text, settings.pages, layoutOptions, measure);
  const baseHand = method.hand ?? medium.hand;
  const hand = { ...baseHand, perGlyph: baseHand.perGlyph && !font.connected };
  const amounts = damageAmounts(settings.damage, settings.damageMix);
  const amount = (id: DamageId) => (id in medium.damage ? (amounts[id] ?? 0) : 0);
  const { grain, thickness } = medium;

  return pages.map((pageText, page) => {
    const seeds = {
      material: pageSeed(settings.seeds.material, page),
      hand: pageSeed(settings.seeds.hand, page),
      damage: pageSeed(settings.seeds.damage, page),
      fade: pageSeed(settings.seeds.fade, page),
    };
    // Every page shares one text size, already scaled by the Size slider.
    const layout = layoutText({ ...layoutOptions, text: pageText.text, scale: 1, maxSize: size }, measure);
    const drawing = drawText(layout, measure, hand, seeds.hand, settings.seeds.hand);
    const pageEnd = pageText.start + pageText.text.length;
    const pageSpans = spans
      .filter((span) => span.end > pageText.start && span.start < pageEnd)
      .map((span) => ({ ...span, start: span.start - pageText.start, end: span.end - pageText.start }));
    const marks = markedAreas(drawing, pageSpans, measure);
    const seed = (id: string) => seedFor(seeds.damage, id);
    // Points in the middle of the writing, where a pen would have dropped its blots.
    const written = drawing.runs.map((run): [number, number] => [
      run.x + 0.5 * measure.width(run.text) * drawing.size * run.scale,
      run.y - 0.3 * drawing.size * run.scale,
    ]);

    const random: Features = {
      chips: [
        ...generateChips(amount('chips'), width, height, seed('chips')),
        ...generateBreaks(amount('breaks'), width, height, thickness, seed('breaks')),
        ...generateChips(amount('gouges'), width, height, seed('gouges'), { grain }),
        ...generateDents(amount('dents'), width, height, seed('dents')),
      ],
      stains: generateStains(amount('water'), width, height, seed('water')),
      holes: generateHoles(medium.holes ?? 'worm', amount('holes'), width, height, seed('holes')),
      burns: generateBurns(amount('burns'), width, height, seed('burns')),
      tears: generateTears(amount('tears'), width, height, seed('tears')),
      folds: generateFolds(amount('folds'), width, height, seed('folds')),
      smudges: generateSmudges(amount('smudges'), box, seed('smudges')),
      cuts: settings.shape === 'fragment' ? generateFragmentCuts(width, height, seed('fragment')) : [],
      blots: generateBlots(amount('blots'), box, written, seed('blots')),
    };
    const randomCracks = [
      ...generateCracks(amount('cracks'), width, height, seed('cracks')),
      ...(grain !== undefined ? generateCracks(amount('splits'), width, height, seed('splits'), { grain }) : []),
      ...generateScratches(amount('scratches'), width, height, seed('scratches')),
    ];

    // Keep random damage off protected words, then make sure marked ones are destroyed.
    const { features, cracks } = protectAreas(random, randomCracks, marks.protect, [width / 2, height / 2]);
    const destroyed = obliterate(marks.destroy, method.obliterate ?? medium.obliterate, drawing.size);
    features.chips.push(...destroyed.chips);
    features.blots.push(...destroyed.blots);
    features.holes.push(...destroyed.holes);

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
      drawing,
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
        verdigris: amount('verdigris'),
      },
      protect: marks.protect,
      strokes: settings.strokes.filter((stroke) => stroke.page === page),
      page,
      pageCount: pages.length,
      fade: settings.fade,
      damage: settings.damage,
      light: { ...medium.light, ...(settings.light ?? {}) },
      offsets: {
        material: noiseOffset(seeds.material),
        fade: noiseOffset(seeds.fade),
        damage: noiseOffset(seeds.damage),
      },
    };
  });
}

/** One page of the handout (the last one if `page` is past the end). */
export function buildScene(settings: Settings, measure: Measure, page = 0): Scene {
  const scenes = buildScenes(settings, measure);
  return scenes[Math.min(Math.max(0, page), scenes.length - 1)];
}

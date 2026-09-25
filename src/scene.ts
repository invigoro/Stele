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
import { drawText, type Drawing, type Rule, type Run } from './text/hand';
import { layoutText, lineWidth, type Align, type Box, type Measure, type TextLayout, type VerticalAlign } from './text/layout';
import { normalizeText, parseMarkup } from './text/markup';
import { paginate } from './text/pages';
import { romanize } from './text/roman';
import { transliterate } from './text/scripts';
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

/** A signature's size, as a multiple of the text's: people sign larger than they write. */
const SIGNATURE_SCALE = 1.35;

/** Things the scenes need that load separately: the signature's font, and the picture's size (px). */
export interface SceneResources {
  signatureMeasure?: Measure;
  picture?: { width: number; height: number };
}

/**
 * Lays out the text (or the picture) and places the damage for `settings`, measuring
 * with `measure`: one scene per page. Each page gets its own sheet, hand and damage.
 */
export function buildScenes(settings: Settings, measure: Measure, resources: SceneResources = {}): Scene[] {
  const { signatureMeasure = measure } = resources;
  const medium: MediumDef = MEDIA[settings.medium];
  const font: FontDef = FONTS[settings.font];
  const method: MethodDef = METHODS[settings.method];
  const variant = medium.variants[settings.variant] ?? Object.values(medium.variants)[0];
  const scale = Math.min(1.5, Math.max(0.5, settings.objectScale));
  const width = medium.width * scale;
  const height = medium.height * scale;
  const padding = { x: medium.padding.x * scale, y: medium.padding.y * scale };
  const box = textBox(settings.shape, width, height, padding);

  const inScript =
    settings.script === 'latin' ? (settings.roman ? romanize(settings.text) : settings.text) : transliterate(settings.text, settings.script);
  // A picture takes the text's place (the text is kept, for switching back).
  const picturing = settings.writing === 'picture';
  const pictureSize = picturing && settings.picture ? resources.picture : undefined;
  const body = picturing ? { text: '', spans: [] } : parseMarkup(normalizeText(inScript));
  // The signature stays in Latin letters, in a hand of its own. Two blank lines are
  // left for it under the text, so fitting and paging make room.
  const signature = parseMarkup(normalizeText(settings.signature).replace(/\n/g, ' '));
  const text = signature.text ? `${body.text}\n\n` : body.text;
  const { spans } = body;
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
  // Lines drawn by hand, and a picture, are treated as writing of half the largest text
  // size: that sets how deep they're cut and how their ink wears.
  const drawnSize = layoutOptions.maxSize * 0.5;
  const short = Math.min(width, height);

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
    // Cuneiform tablets were ruled: a line pressed in between each line of signs.
    if (settings.script === 'cuneiform') drawing.rules = rulesBetween(layout, measure, box, seeds.hand);
    const pageEnd = pageText.start + pageText.text.length;
    const pageSpans = spans
      .filter((span) => span.end > pageText.start && span.start < pageEnd)
      .map((span) => ({ ...span, start: span.start - pageText.start, end: span.end - pageText.start }));
    const lines = settings.strokes.filter((stroke) => stroke.kind === 'pen' && stroke.page === page);
    if (lines.length > 0) {
      drawing.lines = lines.map((line) => ({
        points: line.points.map(([u, v]): [number, number] => [width / 2 + u * short, height / 2 + v * short]),
        width: 2 * line.radius * short,
      }));
    }
    // The picture fills the text area as far as its shape allows, leaving room below
    // for a signature.
    let signatureTop: number | undefined;
    if (pictureSize && settings.picture) {
      const room = signature.text ? Math.min(0.4 * box.height, 2.6 * drawnSize) : 0;
      const area = { ...box, height: box.height - room };
      const place = fitPicture(pictureSize, area, settings.textScale, settings.align, medium.verticalAlign);
      drawing.picture = { ...settings.picture, ...place };
      signatureTop = place.y + place.height + 0.4 * drawnSize;
    }
    if (drawing.size === 0 && (drawing.lines || drawing.picture)) drawing.size = drawnSize;
    if (signature.text && page === pages.length - 1) {
      // Its runs and marks are numbered on from the end of the page's text.
      const from = pageText.text.length + 1;
      const runs = signRuns(signature.text, settings, {
        medium,
        layout,
        measure,
        signatureMeasure,
        box,
        size: picturing ? drawnSize : size,
        from,
        seed: seeds.hand,
        top: signatureTop,
      });
      if (drawing.size === 0) drawing.size = size;
      for (const run of runs) run.scale *= runs.size / drawing.size;
      drawing.runs.push(...runs);
      pageSpans.push(...signature.spans.map((span) => ({ ...span, start: span.start + from, end: span.end + from })));
    }
    const marks = markedAreas(drawing, pageSpans, measure, signatureMeasure);
    const seed = (id: string) => seedFor(seeds.damage, id);
    // Points in the middle of the writing, where a pen would have dropped its blots.
    const written = drawing.runs.map((run): [number, number] => [
      run.x + 0.5 * (run.font ? signatureMeasure : measure).width(run.text) * drawing.size * run.scale,
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
      strokes: settings.strokes.filter((stroke) => stroke.page === page && stroke.kind !== 'pen'),
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

/**
 * A signature's runs, below the last line of text: at the right, or in the middle under
 * centred text; larger than the text if it fits. Written with the medium's own hand
 * (a pen even on a typed page). `size` is the text's size; the runs are drawn at
 * `runs.size`, and number their characters on from `from`.
 */
function signRuns(
  text: string,
  settings: Settings,
  where: {
    medium: MediumDef;
    layout: TextLayout;
    measure: Measure;
    signatureMeasure: Measure;
    box: Box;
    size: number;
    from: number;
    seed: number;
    /** Where the signature's top goes, if not under the last line of text. */
    top?: number;
  },
): Run[] & { size: number } {
  const { medium, layout, measure, signatureMeasure, box, size, from, seed } = where;
  const font = FONTS[settings.signatureFont];
  const width1 = lineWidth(text, 1, signatureMeasure, font.letterSpacing);
  // Match the size of its small letters to the text's, then go larger: scripts draw
  // their letters at very different sizes for the same font size.
  const xHeight = (m: Measure) => m.xHeight ?? 0.5 * m.ascent;
  const matched = (size * xHeight(measure)) / Math.max(xHeight(signatureMeasure), 1e-6);
  const sigSize = Math.min(SIGNATURE_SCALE * matched, (0.96 * box.width) / Math.max(width1, 1e-6));
  const width = width1 * sigSize;
  const last = layout.lines.findLast((line) => line.text.trim());
  const top = where.top ?? (last ? last.baseline + (measure.descent + 0.5) * size : box.y);
  const baseline = top + signatureMeasure.ascent * sigSize;
  const x = settings.align === 'center' ? box.x + (box.width - width) / 2 : box.x + box.width - width;
  const hand = { ...medium.hand, perGlyph: medium.hand.perGlyph && !font.connected };
  const signed = drawText(
    { size: sigSize, letterSpacing: font.letterSpacing, lines: [{ text, start: 0, x, baseline, width }] },
    signatureMeasure,
    hand,
    seed ^ 0x51c2,
  );
  const runs = signed.runs.map((run) => ({ ...run, source: run.source + from, font: settings.signatureFont, handwritten: true }));
  return Object.assign(runs, { size: sigSize });
}

/**
 * Where a picture goes: as large as fits the area, keeping its shape, times `scale`,
 * and placed the way text would be.
 */
export function fitPicture(
  picture: { width: number; height: number },
  area: Box,
  scale: number,
  align: Align,
  verticalAlign: VerticalAlign,
): Box {
  const fit = Math.min(area.width / picture.width, area.height / picture.height) * Math.min(1, Math.max(0.05, scale));
  const width = picture.width * fit;
  const height = picture.height * fit;
  const x = align === 'left' ? area.x : align === 'right' ? area.x + area.width - width : area.x + (area.width - width) / 2;
  const y = verticalAlign === 'top' ? area.y : area.y + (area.height - height) / 2;
  return { x, y, width, height };
}

/** Ruled lines between each pair of lines of text, across the text area, not quite level. */
function rulesBetween(layout: TextLayout, measure: Measure, box: Box, seed: number): Rule[] {
  const random = mulberry32(seed ^ 0x5eed);
  const lines = layout.lines.filter((line) => line.text.trim());
  return lines.slice(1).map((line, i) => {
    const y = (lines[i].baseline + measure.descent * layout.size + line.baseline - measure.ascent * layout.size) / 2;
    const tilt = (random() - 0.5) * 0.004 * box.width;
    return { x0: box.x, y0: y - tilt, x1: box.x + box.width, y1: y + tilt };
  });
}

/** One page of the handout (the last one if `page` is past the end). */
export function buildScene(settings: Settings, measure: Measure, page = 0): Scene {
  const scenes = buildScenes(settings, measure);
  return scenes[Math.min(Math.max(0, page), scenes.length - 1)];
}

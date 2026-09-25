import { generateBurns, type Burn } from './damage/burns';
import { generateBreaks, generateChips, type Chip } from './damage/chips';
import { generateCracks, type Crack } from './damage/cracks';
import { generateHoles, type Hole } from './damage/holes';
import { boundingBox, centre, frameBox, turn, type Block, type PictureBlock, type TextBlock } from './blocks';
import { markedAreas, obliterate, protectAreas, type Marks } from './damage/marks';
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
import { FONTS, type FontDef, type FontId } from './text/fonts';
import { drawText, type Drawing, type Hand, type PlacedPicture, type Rule, type Run } from './text/hand';
import { layoutText, lineWidth, type Align, type Box, type Measure, type TextLayout, type VerticalAlign } from './text/layout';
import { normalizeText, parseMarkup, type Span } from './text/markup';
import { paginate, type PageText } from './text/pages';
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
  /** Where each block on this page went. */
  placed: PlacedBlock[];
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

/** Where a block ended up on a page, for arranging it on the preview. */
export interface PlacedBlock {
  id: string;
  kind: Block['kind'];
  /** Its box, mm, before turning, and how far it's turned about its centre (radians). */
  box: Box;
  angle: number;
  /** Arranged by the template rather than placed by hand. */
  auto: boolean;
}

/** Things the scenes need that load separately: each picture's size in pixels, by src. */
export interface SceneResources {
  pictures?: Readonly<Record<string, { width: number; height: number }>>;
}

/** How text is measured: one measure for every typeface (as in tests), or one per typeface. */
export type MeasureFor = Measure | ((font: FontId) => Measure);

/** A block of text laid out in its own area, over one or more pages. */
interface TextPlan {
  kind: 'text';
  block: TextBlock;
  font: FontDef;
  measure: Measure;
  spans: Span[];
  pages: PageText[];
  size: number;
  area: Box;
  angle: number;
  verticalAlign: VerticalAlign;
  hand: Hand;
  salt: number;
  first: number;
}

/** A signature (or any text) the template signs below the block before it. */
interface TrailPlan {
  kind: 'trail';
  block: TextBlock;
  font: FontDef;
  measure: Measure;
  text: string;
  spans: Span[];
  hand: Hand;
  salt: number;
  leader: number | null;
  first: number;
}

interface PicturePlan {
  kind: 'picture';
  block: PictureBlock;
  size: { width: number; height: number } | undefined;
  area: Box;
  angle: number;
  first: number;
}

type Plan = TextPlan | TrailPlan | PicturePlan;

/** Where a block's writing ended on a page, for signing below it; in its own (unturned) terms. */
interface End {
  bottom: number;
  area: Box;
  angle: number;
  align: Align;
  size: number;
  measure?: Measure;
}

/** A per-block seed offset: none for the main text and the signature's own, so older handouts don't change. */
function saltFor(block: Block): number {
  if (block.role === 'main') return 0;
  if (block.role === 'signature') return 0x51c2;
  return seedFor(0, block.id);
}

/**
 * Lays out the writing (text blocks and pictures) and places the damage for `settings`:
 * one scene per page. Each page gets its own sheet, hand and damage.
 */
export function buildScenes(settings: Settings, measureFor: MeasureFor, resources: SceneResources = {}): Scene[] {
  const medium: MediumDef = MEDIA[settings.medium];
  const method: MethodDef = METHODS[settings.method];
  const variant = medium.variants[settings.variant] ?? Object.values(medium.variants)[0];
  const scale = Math.min(1.5, Math.max(0.5, settings.objectScale));
  const width = medium.width * scale;
  const height = medium.height * scale;
  const padding = { x: medium.padding.x * scale, y: medium.padding.y * scale };
  const box = textBox(settings.shape, width, height, padding);
  const measureOf = (font: FontId) => (typeof measureFor === 'function' ? measureFor(font) : measureFor);
  const maxSize = Math.min(medium.maxTextSize, method.maxTextSize ?? Infinity) * scale;
  // Lines drawn by hand, and pictures, are treated as writing of half the largest text
  // size: that sets how deep they're cut and how their ink wears.
  const drawnSize = maxSize * 0.5;
  const short = Math.min(width, height);
  const amounts = damageAmounts(settings.damage, settings.damageMix);
  const amount = (id: DamageId) => (id in medium.damage ? (amounts[id] ?? 0) : 0);
  const { grain, thickness } = medium;

  // Signatures arranged by the template follow the block before them.
  const blocks = settings.blocks;
  const trailing = (block: Block) => block.kind === 'text' && block.role === 'signature' && block.frame === null;
  const leaderOf = (index: number): number | null => {
    for (let j = index - 1; j >= 0; j--) if (!trailing(blocks[j])) return j;
    return null;
  };
  const leaders = new Set(blocks.flatMap((block, i) => (trailing(block) ? [leaderOf(i)] : [])).filter((j) => j !== null));
  const flowing = blocks.find((block) => block.kind === 'text' && block.flow);

  const plans: Plan[] = [];
  blocks.forEach((block, index) => {
    const placed = block.frame ? frameBox(block.frame, width, height) : { box, angle: 0 };
    if (block.kind === 'picture') {
      let area = placed.box;
      if (leaders.has(index) && !block.frame) area = { ...area, height: area.height - Math.min(0.4 * area.height, 2.6 * drawnSize) };
      plans.push({ kind: 'picture', block, size: resources.pictures?.[block.src], area, angle: placed.angle, first: block.page });
      return;
    }
    const font: FontDef = FONTS[block.font];
    const measure = measureOf(block.font);
    const baseHand = block.byHand ? medium.hand : (method.hand ?? medium.hand);
    const hand = { ...baseHand, perGlyph: baseHand.perGlyph && !font.connected };
    const inScript =
      block.script === 'latin' ? (block.roman ? romanize(block.text) : block.text) : transliterate(block.text, block.script);
    if (trailing(block)) {
      // Signed on one line, in Latin letters as written.
      const { text, spans } = parseMarkup(normalizeText(block.text).replace(/\n/g, ' '));
      plans.push({ kind: 'trail', block, font, measure, text, spans, hand, salt: saltFor(block), leader: leaderOf(index), first: 0 });
      return;
    }
    const parsed = parseMarkup(normalizeText(inScript));
    // Two blank lines are left under text for a signature that follows it, so fitting
    // and paging make room.
    const text = leaders.has(index) && parsed.text ? `${parsed.text}\n\n` : parsed.text;
    const flow = block === flowing;
    const auto = block.frame === null;
    const verticalAlign: VerticalAlign = auto ? medium.verticalAlign : flow ? 'top' : 'middle';
    const { pages, size } = paginate(
      text,
      flow ? 'flow' : 'fit',
      {
        box: placed.box,
        align: block.align,
        verticalAlign,
        wrap: medium.wrap,
        lineHeight: font.lineHeight,
        letterSpacing: font.letterSpacing,
        scale: block.size,
        // Placed by hand, text grows to fill its frame.
        maxSize: auto || flow ? maxSize : Infinity,
      },
      measure,
    );
    plans.push({
      kind: 'text',
      block,
      font,
      measure,
      spans: parsed.spans,
      pages,
      size: Number.isFinite(size) ? size : maxSize,
      area: placed.box,
      angle: placed.angle,
      verticalAlign,
      hand,
      salt: saltFor(block),
      first: block.page,
    });
  });
  // A signature goes on the page where the block it follows ends.
  const lastPage = (plan: Plan) => plan.first + (plan.kind === 'text' ? plan.pages.length - 1 : 0);
  for (const plan of plans) {
    if (plan.kind === 'trail') plan.first = plan.leader !== null ? lastPage(plans[plan.leader]) : plan.block.page;
  }
  const pageCount = Math.max(1, ...plans.map((plan) => lastPage(plan) + 1));
  const firstText = settings.blocks.find((block): block is TextBlock => block.kind === 'text');
  const sceneFont: FontDef = FONTS[firstText?.font ?? medium.font];

  return Array.from({ length: pageCount }, (_, page) => {
    const seeds = {
      material: pageSeed(settings.seeds.material, page),
      hand: pageSeed(settings.seeds.hand, page),
      damage: pageSeed(settings.seeds.damage, page),
      fade: pageSeed(settings.seeds.fade, page),
    };
    const drawing: Drawing = { size: 0, runs: [] };
    const pieces: { runs: Run[]; size: number }[] = [];
    const rules: Rule[] = [];
    const pictures: PlacedPicture[] = [];
    const placed: PlacedBlock[] = [];
    const marks: Marks = { destroy: [], protect: [] };
    // Points in the middle of the writing, where a pen would have dropped its blots.
    const written: [number, number][] = [];
    const ends = new Map<number, End>();

    /** Adds a block's runs and marks, laid out in `area` and turned by `angle` about its centre. */
    const addText = (runs: Run[], size: number, measure: Measure, spans: Span[], area: Box, angle: number, byHand: boolean, font: FontId) => {
      const middle = centre(area);
      const place = (point: [number, number]) => turn(point, middle, angle);
      const local = markedAreas({ size, runs }, spans, measure);
      for (const kind of ['destroy', 'protect'] as const) {
        for (const mark of local[kind]) {
          const [cx, cy] = place(centre(mark));
          marks[kind].push({ x: cx - mark.width / 2, y: cy - mark.height / 2, width: mark.width, height: mark.height, angle });
        }
      }
      for (const run of runs) {
        written.push(place([run.x + 0.5 * measure.width(run.text) * size * run.scale, run.y - 0.3 * size * run.scale]));
        [run.x, run.y] = place([run.x, run.y]);
        run.rotation += angle;
        run.font = font;
        if (byHand) run.handwritten = true;
      }
      if (runs.length > 0) pieces.push({ runs, size });
    };

    plans.forEach((plan, index) => {
      if (plan.kind === 'picture') {
        if (page !== plan.first || !plan.size) return;
        const auto = plan.block.frame === null;
        const spot = auto
          ? fitPicture(plan.size, plan.area, plan.block.size, plan.block.align, medium.verticalAlign)
          : fitPicture(plan.size, plan.area, 1, 'center', 'middle');
        const [cx, cy] = turn(centre(spot), centre(plan.area), plan.angle);
        const { src, use, threshold } = plan.block;
        pictures.push({ src, use, threshold, x: cx - spot.width / 2, y: cy - spot.height / 2, width: spot.width, height: spot.height, angle: plan.angle });
        placed.push({ id: plan.block.id, kind: 'picture', box: auto ? spot : plan.area, angle: plan.angle, auto });
        ends.set(index, { bottom: spot.y + spot.height + 0.4 * drawnSize, area: plan.area, angle: plan.angle, align: plan.block.align, size: drawnSize });
        return;
      }

      if (plan.kind === 'trail') {
        if (page !== plan.first) return;
        const end = plan.leader !== null ? ends.get(plan.leader) : undefined;
        const area = end?.area ?? box;
        const { measure, font } = plan;
        const width1 = lineWidth(plan.text, 1, measure, font.letterSpacing);
        // Match the size of its small letters to the writing's, then go larger: scripts
        // draw their letters at very different sizes for the same font size.
        const xHeight = (m: Measure) => m.xHeight ?? 0.5 * m.ascent;
        const leadSize = end?.size ?? drawnSize;
        const matched = (leadSize * xHeight(end?.measure ?? measure)) / Math.max(xHeight(measure), 1e-6);
        const size = Math.min(SIGNATURE_SCALE * matched, (0.96 * area.width) / Math.max(width1, 1e-6));
        const lineHeight = (measure.ascent + measure.descent) * size;
        const top = end ? end.bottom : area.y + area.height - lineHeight;
        const lineWidthMm = width1 * size;
        // At the right, or in the middle under centred writing.
        const x = end?.align === 'center' ? area.x + (area.width - lineWidthMm) / 2 : area.x + area.width - lineWidthMm;
        const signed = drawText(
          { size, letterSpacing: font.letterSpacing, lines: [{ text: plan.text, start: 0, x, baseline: top + measure.ascent * size, width: lineWidthMm }] },
          measure,
          plan.hand,
          (seeds.hand ^ plan.salt) >>> 0,
          settings.seeds.hand,
        );
        const angle = end?.angle ?? 0;
        addText(signed.runs, size, measure, plan.spans, area, angle, plan.block.byHand, plan.block.font);
        const extent = { x, y: top, width: lineWidthMm, height: lineHeight };
        const [cx, cy] = turn(centre(extent), centre(area), angle);
        placed.push({ id: plan.block.id, kind: 'text', box: { ...extent, x: cx - extent.width / 2, y: cy - extent.height / 2 }, angle, auto: true });
        ends.set(index, { bottom: top + lineHeight + 0.3 * size, area, angle, align: end?.align ?? 'right', size, measure });
        return;
      }

      const chunk = plan.pages[page - plan.first];
      if (!chunk) return;
      const { block, font, measure } = plan;
      const layout = layoutText(
        {
          box: plan.area,
          align: block.align,
          verticalAlign: plan.verticalAlign,
          wrap: medium.wrap,
          lineHeight: font.lineHeight,
          letterSpacing: font.letterSpacing,
          text: chunk.text,
          // Every page shares one text size, already scaled by the Size slider.
          scale: 1,
          maxSize: plan.size,
        },
        measure,
      );
      const drawn = drawText(layout, measure, plan.hand, (seeds.hand ^ plan.salt) >>> 0, settings.seeds.hand);
      const chunkEnd = chunk.start + chunk.text.length;
      const spans = plan.spans
        .filter((span) => span.end > chunk.start && span.start < chunkEnd)
        .map((span) => ({ ...span, start: span.start - chunk.start, end: span.end - chunk.start }));
      addText(drawn.runs, plan.size, measure, spans, plan.area, plan.angle, block.byHand, block.font);
      // Cuneiform tablets were ruled: a line pressed in between each line of signs.
      if (block.script === 'cuneiform') {
        const middle = centre(plan.area);
        for (const rule of rulesBetween(layout, measure, plan.area, seeds.hand ^ plan.salt)) {
          const [x0, y0] = turn([rule.x0, rule.y0], middle, plan.angle);
          const [x1, y1] = turn([rule.x1, rule.y1], middle, plan.angle);
          rules.push({ x0, y0, x1, y1 });
        }
      }
      placed.push({ id: block.id, kind: 'text', box: plan.area, angle: plan.angle, auto: block.frame === null });
      const last = layout.lines.findLast((line) => line.text.trim());
      const bottom = last ? last.baseline + (measure.descent + 0.5) * plan.size : plan.area.y;
      ends.set(index, { bottom, area: plan.area, angle: plan.angle, align: block.align, size: plan.size, measure });
    });

    // One size for the whole drawing (the first text's): each block's letters are scaled to it.
    const lines = settings.strokes.filter((stroke) => stroke.kind === 'pen' && stroke.page === page);
    drawing.size = pieces[0]?.size ?? (lines.length > 0 || pictures.length > 0 ? drawnSize : 0);
    for (const piece of pieces) {
      for (const run of piece.runs) run.scale *= piece.size / drawing.size;
      drawing.runs.push(...piece.runs);
    }
    if (rules.length > 0) drawing.rules = rules;
    if (pictures.length > 0) drawing.pictures = pictures;
    if (lines.length > 0) {
      drawing.lines = lines.map((line) => ({
        points: line.points.map(([u, v]): [number, number] => [width / 2 + u * short, height / 2 + v * short]),
        width: 2 * line.radius * short,
      }));
    }

    const seed = (id: string) => seedFor(seeds.damage, id);
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
    const protect = marks.protect.map((mark) => boundingBox(mark, mark.angle ?? 0));
    const { features, cracks } = protectAreas(random, randomCracks, protect, [width / 2, height / 2]);
    const destroyed = obliterate(marks.destroy, method.obliterate ?? medium.obliterate, drawing.size);
    features.chips.push(...destroyed.chips);
    features.blots.push(...destroyed.blots);
    features.holes.push(...destroyed.holes);

    return {
      medium,
      font: sceneFont,
      method,
      shape: settings.shape,
      palette: variant.palette,
      width,
      height,
      margin: MARGIN_MM,
      textBox: box,
      drawing,
      placed,
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
      protect,
      strokes: settings.strokes.filter((stroke) => stroke.page === page && stroke.kind !== 'pen'),
      page,
      pageCount,
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
export function buildScene(settings: Settings, measure: MeasureFor, page = 0, resources: SceneResources = {}): Scene {
  const scenes = buildScenes(settings, measure, resources);
  return scenes[Math.min(Math.max(0, page), scenes.length - 1)];
}

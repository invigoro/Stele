import { generateChips, type Chip } from './damage/chips';
import { generateStains, type Stain } from './damage/stains';
import { MEDIA, type MediumDef } from './media/media';
import type { Settings } from './settings';
import { FONTS, type FontDef } from './text/fonts';
import { drawText, type Drawing } from './text/hand';
import { layoutText, type Measure } from './text/layout';
import { mulberry32 } from './util/rng';

/** Blank space around the object in the rendered image, mm. */
export const MARGIN_MM = 4;

/** Everything the renderer needs for one image, in millimetres. */
export interface Scene {
  medium: MediumDef;
  font: FontDef;
  width: number;
  height: number;
  margin: number;
  drawing: Drawing;
  chips: Chip[];
  stains: Stain[];
  fade: number;
  damage: number;
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

/** Lays out the text and places the damage for `settings`, measuring with `measure`. */
export function buildScene(settings: Settings, measure: Measure): Scene {
  const medium: MediumDef = MEDIA[settings.medium];
  const font: FontDef = FONTS[settings.font];
  const { width, height, padding } = medium;

  const layout = layoutText(
    {
      text: settings.text,
      box: { x: padding.x, y: padding.y, width: width - 2 * padding.x, height: height - 2 * padding.y },
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
  const { seeds } = settings;

  return {
    medium,
    font,
    width,
    height,
    margin: MARGIN_MM,
    drawing: drawText(layout, measure, hand, seeds.hand),
    chips: medium.damage === 'chips' ? generateChips(settings.damage, width, height, medium.thickness, seeds.damage) : [],
    stains: medium.damage === 'water' ? generateStains(settings.damage, width, height, seeds.damage) : [],
    fade: settings.fade,
    damage: settings.damage,
    offsets: {
      material: noiseOffset(seeds.material),
      fade: noiseOffset(seeds.fade),
      damage: noiseOffset(seeds.damage),
    },
  };
}

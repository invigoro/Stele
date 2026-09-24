import type { FontId } from '../text/fonts';
import type { Hand } from '../text/hand';
import type { Align, VerticalAlign, Wrap } from '../text/layout';

export interface Light {
  /**
   * Direction the light comes from, in degrees clockwise from the right-hand side of
   * the image: 180 is from the left, 270 from the top, 225 from the upper left.
   */
  azimuth: number;
  /** Height of the light above the surface, in degrees; low light rakes across it. */
  elevation: number;
  ambient: number;
  diffuse: number;
  specular: number;
  shininess: number;
}

export type DamageKind = 'chips' | 'water';

export interface MediumDef {
  label: string;
  /** File in render/shaders/media/ that defines buildSurface(). */
  shader: string;
  /** Object size, mm. */
  width: number;
  height: number;
  /** Clear space between the object's edge and the text, mm. */
  padding: { x: number; y: number };
  /** Slab thickness, mm; chips deeper than this break through the edge. */
  thickness: number;
  text: string;
  font: FontId;
  align: Align;
  verticalAlign: VerticalAlign;
  wrap: Wrap;
  /** Largest font size, mm, so a short text doesn't fill the whole object. */
  maxTextSize: number;
  hand: Hand;
  light: Light;
  damage: DamageKind;
}

export const MEDIA = {
  marble: {
    label: 'Marble',
    shader: 'marble',
    width: 240,
    height: 160,
    padding: { x: 22, y: 20 },
    thickness: 25,
    text: 'DIS MANIBVS\nGAIO IVLIO FELICI\nVIXIT ANNOS XXXV\nH · S · E',
    font: 'cinzel',
    align: 'center',
    verticalAlign: 'middle',
    wrap: 'word',
    maxTextSize: 30,
    hand: { perGlyph: true, rotation: 0.5, baseline: 0.012, spacing: 0.012, scale: 0.012, lineSlope: 0.15, dipPen: false },
    light: { azimuth: 225, elevation: 25, ambient: 0.3, diffuse: 0.8, specular: 0.25, shininess: 40 },
    damage: 'chips',
  },
  paper: {
    label: 'Paper',
    shader: 'paper',
    width: 148,
    height: 210,
    padding: { x: 16, y: 18 },
    thickness: 0.1,
    text:
      'Dear Madame,\n\nI regret to inform you that your husband did not return from the northern pass. ' +
      'We recovered only his journal, and this letter, which he meant for you.\n\n' +
      'With my deepest sympathy,\nCapt. H. Aldous',
    font: 'cedarville-cursive',
    align: 'left',
    verticalAlign: 'top',
    wrap: 'word',
    maxTextSize: 7,
    hand: { perGlyph: true, rotation: 1.2, baseline: 0.03, spacing: 0.04, scale: 0.03, lineSlope: 0.6, dipPen: true },
    light: { azimuth: 225, elevation: 65, ambient: 0.7, diffuse: 0.35, specular: 0.02, shininess: 10 },
    damage: 'water',
  },
} satisfies Record<string, MediumDef>;

export type MediumId = keyof typeof MEDIA;

export function isMediumId(value: string): value is MediumId {
  return value in MEDIA;
}

/** Unit vector toward the light, in image space (x right, y down, z toward the viewer). */
export function lightDirection(light: Light): [number, number, number] {
  const azimuth = (light.azimuth * Math.PI) / 180;
  const elevation = (light.elevation * Math.PI) / 180;
  return [Math.cos(azimuth) * Math.cos(elevation), Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation)];
}

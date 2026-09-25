import type { Obliteration } from '../damage/marks';
import type { FontId } from '../text/fonts';
import type { Hand } from '../text/hand';

export type Rgb = readonly [number, number, number];

/** How the writing was made; each kind has its own shader code. */
export type WritingKind = 'carve' | 'paint' | 'burn' | 'ink' | 'relief' | 'impress';

export interface MethodDef {
  label: string;
  kind: WritingKind;
  /** Carving: flat-bottomed grooves with steep walls instead of a V-cut. */
  flat?: boolean;
  /** Carving: paint or gold laid into the grooves. */
  fill?: boolean;
  gilt?: boolean;
  /** sRGB colour of the paint, gold or ink. */
  color?: Rgb;
  /** Ink: its colour once it has aged. */
  aged?: Rgb;
  /** Ink: struck through a typewriter ribbon rather than written with a pen. */
  typed?: boolean;
  /** The typeface that goes with the method; choosing the method switches to it. */
  font?: FontId;
  /** Overrides the medium's hand. */
  hand?: Hand;
  /** Largest font size, mm, if smaller than the medium's. */
  maxTextSize?: number;
  /** Overrides how the medium destroys a word marked [[like this]]. */
  obliterate?: Obliteration;
}

/** A typewriter: type in fixed columns, struck with uneven force, some keys a little out of true. */
const TYPEWRITER: Hand = {
  perGlyph: true,
  rotation: 0.3,
  baseline: 0.012,
  spacing: 0.008,
  scale: 0,
  lineSlope: 0.1,
  dipPen: false,
  strike: 0.3,
  typebars: 0.06,
};

export const METHODS = {
  carved: { label: 'Carved (V-cut)', kind: 'carve' },
  'carved-flat': { label: 'Carved (flat-bottomed)', kind: 'carve', flat: true },
  'filled-red': { label: 'Carved, painted red', kind: 'carve', fill: true, color: [0.6, 0.15, 0.1] },
  'filled-black': { label: 'Carved, painted black', kind: 'carve', fill: true, color: [0.07, 0.07, 0.07] },
  gilt: { label: 'Carved and gilded', kind: 'carve', fill: true, gilt: true, color: [0.85, 0.66, 0.3] },
  'painted-white': { label: 'Painted white', kind: 'paint', color: [0.92, 0.9, 0.84] },
  'painted-black': { label: 'Painted black', kind: 'paint', color: [0.08, 0.08, 0.08] },
  'painted-red': { label: 'Painted red', kind: 'paint', color: [0.58, 0.13, 0.09] },
  burned: { label: 'Burned in', kind: 'burn', color: [0.12, 0.07, 0.04] },
  'iron-gall': { label: 'Iron-gall ink', kind: 'ink', color: [0.1, 0.09, 0.13], aged: [0.5, 0.36, 0.22] },
  'carbon-ink': { label: 'Carbon ink', kind: 'ink', color: [0.06, 0.06, 0.06], aged: [0.3, 0.29, 0.27] },
  'red-ink': { label: 'Red ink', kind: 'ink', color: [0.62, 0.14, 0.1], aged: [0.68, 0.38, 0.3] },
  typewriter: {
    label: 'Typewriter',
    kind: 'ink',
    typed: true,
    color: [0.1, 0.1, 0.12],
    aged: [0.36, 0.33, 0.36],
    font: 'courier-prime',
    hand: TYPEWRITER,
    maxTextSize: 4.2, // 12-point pica
    obliterate: 'redact',
  },
  cast: { label: 'Cast in relief', kind: 'relief' },
  impressed: { label: 'Pressed in with a stylus', kind: 'impress' },
  engraved: { label: 'Engraved', kind: 'carve' },
  'engraved-filled': { label: 'Engraved, filled black', kind: 'carve', fill: true, color: [0.05, 0.05, 0.05] },
} satisfies Record<string, MethodDef>;

export type MethodId = keyof typeof METHODS;

/** Shader codes for each kind (WRITING_* in surface/common.glsl). */
export const WRITING_CODES: Record<WritingKind, number> = { carve: 0, paint: 1, burn: 2, ink: 3, relief: 4, impress: 5 };

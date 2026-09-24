import type { DamageMix } from '../damage/types';
import type { FontId } from '../text/fonts';
import type { Hand } from '../text/hand';
import type { Align, VerticalAlign, Wrap } from '../text/layout';
import type { ShapeId } from './shapes';
import type { MethodId, Rgb } from './writing';

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

/**
 * Media that share most of their shader code: stone (carving, chips, lichen…),
 * wood (grain, carving or paint or burning) and sheets (ink on paper, parchment…).
 */
export type Family = 'stone' | 'wood' | 'sheet';

export interface Variant {
  label: string;
  /** Four sRGB colours; what each one means is up to the medium's shader. */
  palette: readonly [Rgb, Rgb, Rgb, Rgb];
}

export interface MediumDef {
  label: string;
  family: Family;
  /** File in render/shaders/media/ that defines buildSurface(). */
  shader: string;
  /** Object size, mm. */
  width: number;
  height: number;
  /** Clear space between the object's edge and the text, mm. */
  padding: { x: number; y: number };
  /** Slab or board thickness, mm; breaks show a broken face this deep at most. */
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
  /** The first of each is the default. */
  variants: Record<string, Variant>;
  methods: MethodId[];
  shapes: ShapeId[];
  /** Damage types this medium can show, with their default weights. */
  damage: DamageMix;
  /** Direction of the grain or fibres, radians (wood, papyrus). */
  grain?: number;
  /** What the "Holes" damage type makes on this medium. */
  holes?: 'worm' | 'nail' | 'lacuna';
}

const CHISEL: Hand = { perGlyph: true, rotation: 0.5, baseline: 0.012, spacing: 0.012, scale: 0.012, lineSlope: 0.15, dipPen: false };
const PEN: Hand = { perGlyph: true, rotation: 1.2, baseline: 0.03, spacing: 0.04, scale: 0.03, lineSlope: 0.6, dipPen: true };
const REED: Hand = { perGlyph: true, rotation: 1.6, baseline: 0.04, spacing: 0.05, scale: 0.05, lineSlope: 0.8, dipPen: true };
const RAKING: Light = { azimuth: 225, elevation: 25, ambient: 0.3, diffuse: 0.8, specular: 0.25, shininess: 40 };
const SCANNER: Light = { azimuth: 225, elevation: 65, ambient: 0.7, diffuse: 0.35, specular: 0.02, shininess: 10 };
const STONE_METHODS: MethodId[] = ['carved', 'carved-flat', 'filled-red', 'filled-black', 'gilt', 'painted-black'];
const STONE_SHAPES: ShapeId[] = ['rectangle', 'stele', 'tabula', 'fragment'];

export const MEDIA = {
  marble: {
    label: 'Marble',
    family: 'stone',
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
    hand: CHISEL,
    light: RAKING,
    variants: {
      carrara: { label: 'Carrara white', palette: [[0.94, 0.935, 0.915], [0.87, 0.865, 0.85], [0.8, 0.8, 0.82], [0.58, 0.59, 0.63]] },
      pentelic: { label: 'Pentelic cream', palette: [[0.95, 0.92, 0.86], [0.9, 0.86, 0.78], [0.86, 0.8, 0.7], [0.7, 0.6, 0.45]] },
      rosso: { label: 'Rosso red', palette: [[0.66, 0.33, 0.28], [0.55, 0.25, 0.22], [0.76, 0.52, 0.46], [0.92, 0.86, 0.82]] },
      nero: { label: 'Nero black', palette: [[0.16, 0.16, 0.17], [0.1, 0.1, 0.11], [0.3, 0.3, 0.31], [0.88, 0.88, 0.86]] },
      verde: { label: 'Verde green', palette: [[0.3, 0.42, 0.34], [0.2, 0.3, 0.24], [0.45, 0.55, 0.48], [0.8, 0.85, 0.8]] },
    },
    methods: STONE_METHODS,
    shapes: STONE_SHAPES,
    damage: { chips: 0.8, breaks: 0.6, cracks: 0.4, stains: 0.4, lichen: 0.2 },
  },
  sandstone: {
    label: 'Sandstone',
    family: 'stone',
    shader: 'sandstone',
    width: 200,
    height: 260,
    padding: { x: 22, y: 26 },
    thickness: 60,
    text: 'HERE ENDS\nTHE KING’S ROAD\n\nTURN BACK\nTRAVELLER',
    font: 'marcellus',
    align: 'center',
    verticalAlign: 'middle',
    wrap: 'word',
    maxTextSize: 26,
    hand: { ...CHISEL, rotation: 0.9, baseline: 0.02, spacing: 0.02, scale: 0.02, lineSlope: 0.4 },
    light: RAKING,
    variants: {
      buff: { label: 'Buff', palette: [[0.8, 0.7, 0.55], [0.62, 0.52, 0.4], [0.9, 0.84, 0.72], [0.72, 0.55, 0.38]] },
      red: { label: 'Red', palette: [[0.66, 0.38, 0.3], [0.5, 0.27, 0.21], [0.78, 0.52, 0.42], [0.55, 0.3, 0.22]] },
      yellow: { label: 'Yellow', palette: [[0.84, 0.74, 0.5], [0.66, 0.56, 0.36], [0.92, 0.86, 0.66], [0.76, 0.58, 0.32]] },
    },
    methods: ['carved', 'carved-flat', 'filled-red', 'painted-black'],
    shapes: ['stele', 'rectangle', 'fragment', 'tabula'],
    damage: { chips: 0.6, breaks: 0.7, cracks: 0.3, pitting: 0.7, flaking: 0.5, lichen: 0.4 },
  },
  granite: {
    label: 'Granite',
    family: 'stone',
    shader: 'granite',
    width: 240,
    height: 170,
    padding: { x: 22, y: 22 },
    thickness: 80,
    text: 'IN MEMORY OF\nELARA THORNE\n1302 – 1347\nSHE HELD THE PASS',
    font: 'cinzel',
    align: 'center',
    verticalAlign: 'middle',
    wrap: 'word',
    maxTextSize: 26,
    hand: CHISEL,
    light: { ...RAKING, specular: 0.4, shininess: 60 },
    variants: {
      grey: { label: 'Grey', palette: [[0.62, 0.62, 0.62], [0.75, 0.74, 0.72], [0.88, 0.88, 0.87], [0.12, 0.12, 0.13]] },
      pink: { label: 'Pink', palette: [[0.66, 0.56, 0.54], [0.8, 0.55, 0.5], [0.9, 0.86, 0.84], [0.15, 0.13, 0.13]] },
      black: { label: 'Black', palette: [[0.09, 0.09, 0.1], [0.14, 0.14, 0.15], [0.22, 0.22, 0.23], [0.05, 0.05, 0.05]] },
    },
    methods: ['carved', 'carved-flat', 'gilt', 'filled-black'],
    shapes: ['rectangle', 'stele', 'fragment'],
    damage: { chips: 0.5, breaks: 0.5, cracks: 0.4, lichen: 0.4, stains: 0.3 },
  },
  slate: {
    label: 'Slate',
    family: 'stone',
    shader: 'slate',
    width: 190,
    height: 250,
    padding: { x: 20, y: 24 },
    thickness: 30,
    text:
      'Here lies the Body of\nMr. Josiah Crane\nwho departed this Life\nMarch the 3d 1789\nin the 64th Year\nof his Age',
    font: 'im-fell-english',
    align: 'center',
    verticalAlign: 'middle',
    wrap: 'word',
    maxTextSize: 16,
    hand: CHISEL,
    light: { ...RAKING, specular: 0.2, shininess: 30 },
    variants: {
      blue: { label: 'Blue-grey', palette: [[0.3, 0.33, 0.37], [0.26, 0.28, 0.32], [0.55, 0.4, 0.28], [0.58, 0.61, 0.65]] },
      green: { label: 'Green-grey', palette: [[0.32, 0.36, 0.33], [0.27, 0.31, 0.28], [0.55, 0.42, 0.3], [0.58, 0.62, 0.58]] },
    },
    methods: ['carved', 'carved-flat', 'gilt', 'painted-white'],
    shapes: ['stele', 'rectangle', 'fragment'],
    damage: { chips: 0.4, breaks: 0.5, cracks: 0.5, flaking: 0.7, lichen: 0.4 },
  },
  wood: {
    label: 'Wood',
    family: 'wood',
    shader: 'wood',
    width: 280,
    height: 130,
    padding: { x: 24, y: 18 },
    thickness: 30,
    text: 'THE GILDED FLAGON\nALES · WINES · ROOMS',
    font: 'marcellus',
    align: 'center',
    verticalAlign: 'middle',
    wrap: 'word',
    maxTextSize: 34,
    hand: { ...CHISEL, rotation: 0.8, baseline: 0.02, spacing: 0.02, scale: 0.02, lineSlope: 0.3 },
    light: { ...RAKING, elevation: 30, specular: 0.1, shininess: 20 },
    variants: {
      walnut: { label: 'Walnut', palette: [[0.42, 0.29, 0.19], [0.3, 0.19, 0.12], [0.2, 0.12, 0.08], [0.5, 0.47, 0.44]] },
      oak: { label: 'Oak', palette: [[0.68, 0.52, 0.34], [0.52, 0.37, 0.22], [0.36, 0.24, 0.14], [0.58, 0.56, 0.52]] },
      pine: { label: 'Pine', palette: [[0.84, 0.7, 0.48], [0.7, 0.5, 0.28], [0.52, 0.32, 0.16], [0.62, 0.6, 0.56]] },
      weathered: { label: 'Weathered grey', palette: [[0.6, 0.57, 0.52], [0.46, 0.43, 0.4], [0.34, 0.31, 0.28], [0.66, 0.64, 0.6]] },
    },
    methods: ['gilt', 'carved', 'carved-flat', 'filled-black', 'painted-white', 'painted-black', 'painted-red', 'burned'],
    shapes: ['rectangle', 'fragment'],
    damage: { splits: 0.7, gouges: 0.5, rot: 0.4, holes: 0.5, burns: 0.3 },
    grain: 0,
    holes: 'worm',
  },
  paper: {
    label: 'Paper',
    family: 'sheet',
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
    hand: PEN,
    light: SCANNER,
    variants: {
      cream: { label: 'Cream', palette: [[0.945, 0.915, 0.845], [0.84, 0.76, 0.62], [0.9, 0.84, 0.72], [0.74, 0.62, 0.47]] },
      white: { label: 'White', palette: [[0.965, 0.96, 0.94], [0.88, 0.85, 0.78], [0.92, 0.89, 0.82], [0.76, 0.68, 0.56]] },
      aged: { label: 'Aged', palette: [[0.88, 0.8, 0.64], [0.72, 0.6, 0.42], [0.82, 0.72, 0.55], [0.62, 0.48, 0.32]] },
    },
    methods: ['iron-gall', 'carbon-ink', 'red-ink'],
    shapes: ['sheet', 'torn'],
    damage: { water: 0.7, tears: 0.4, burns: 0.3, folds: 0.6, smudges: 0.35, foxing: 0.5 },
  },
  parchment: {
    label: 'Parchment',
    family: 'sheet',
    shader: 'parchment',
    width: 180,
    height: 240,
    padding: { x: 22, y: 26 },
    thickness: 0.3,
    text:
      'By order of the Crown,\nall persons found upon the King’s road after dusk shall be detained ' +
      'and brought before the Reeve.\n\nGiven under our hand and seal.',
    font: 'uncial-antiqua',
    align: 'center',
    verticalAlign: 'top',
    wrap: 'word',
    maxTextSize: 10,
    hand: { ...PEN, lineSlope: 0.3 },
    light: { ...SCANNER, elevation: 55, ambient: 0.62, diffuse: 0.45, specular: 0.05 },
    variants: {
      natural: { label: 'Natural', palette: [[0.9, 0.83, 0.68], [0.8, 0.7, 0.52], [0.62, 0.52, 0.4], [0.7, 0.58, 0.42]] },
      dark: { label: 'Dark', palette: [[0.78, 0.66, 0.48], [0.66, 0.54, 0.36], [0.5, 0.4, 0.28], [0.56, 0.44, 0.3]] },
    },
    methods: ['iron-gall', 'carbon-ink', 'red-ink'],
    shapes: ['sheet', 'torn'],
    damage: { water: 0.5, tears: 0.3, burns: 0.3, folds: 0.4, holes: 0.3, foxing: 0.4 },
    holes: 'worm',
  },
  papyrus: {
    label: 'Papyrus',
    family: 'sheet',
    shader: 'papyrus',
    width: 170,
    height: 230,
    padding: { x: 18, y: 20 },
    thickness: 0.2,
    text:
      'AND THE SEAL OF THE SEVENTH TOMB LIES BENEATH THE EYE OF THE JACKAL, WHICH OPENS ONLY ' +
      'WHEN THE RIVER RUNS RED',
    font: 'uncial-antiqua',
    align: 'left',
    verticalAlign: 'top',
    wrap: 'word',
    maxTextSize: 9,
    hand: REED,
    light: { ...SCANNER, elevation: 50, ambient: 0.6, diffuse: 0.5 },
    variants: {
      light: { label: 'Light', palette: [[0.86, 0.76, 0.56], [0.76, 0.64, 0.44], [0.66, 0.54, 0.36], [0.62, 0.5, 0.34]] },
      dark: { label: 'Dark', palette: [[0.72, 0.58, 0.38], [0.6, 0.47, 0.3], [0.5, 0.38, 0.24], [0.48, 0.36, 0.22]] },
    },
    methods: ['carbon-ink', 'red-ink'],
    shapes: ['torn', 'sheet'],
    damage: { holes: 0.7, fraying: 0.7, tears: 0.5, darkening: 0.5, water: 0.2 },
    grain: 0,
    holes: 'lacuna',
  },
} satisfies Record<string, MediumDef>;

export type MediumId = keyof typeof MEDIA;

export function isMediumId(value: string): value is MediumId {
  return value in MEDIA;
}

/** Unit vector toward the light, in image space (x right, y down, z toward the viewer). */
export function lightDirection(light: Pick<Light, 'azimuth' | 'elevation'>): [number, number, number] {
  const azimuth = (light.azimuth * Math.PI) / 180;
  const elevation = (light.elevation * Math.PI) / 180;
  return [Math.cos(azimuth) * Math.cos(elevation), Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation)];
}

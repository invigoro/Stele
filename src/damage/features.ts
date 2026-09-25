import type { Features } from '../scene';

/** Most features of one kind the shaders read (MAX_FEATURES in the GLSL). */
export const MAX_FEATURES = 64;

/**
 * Texture rows for each kind of feature, two texels per feature. Must match the
 * *_ROW constants in surface/common.glsl.
 */
export const FEATURE_LAYOUT = {
  chips: 0,
  stains: 2,
  holes: 4,
  burns: 6,
  tears: 8,
  folds: 10,
  smudges: 12,
  cuts: 14,
  blots: 16,
} as const satisfies Record<keyof Features, number>;

export const FEATURE_ROWS = 18;

export interface PackedFeatures {
  /** RGBA float texels, MAX_FEATURES wide and FEATURE_ROWS tall. */
  data: Float32Array;
  counts: Record<keyof Features, number>;
}

/** Two texels (eight numbers) per feature, as the shaders read them. */
const encoders: { [K in keyof Features]: (feature: Features[K][number]) => number[] } = {
  chips: (c) => [c.x, c.y, c.radius, c.depth, c.seed, c.breaks ? 1 : 0, c.angle, c.aspect],
  stains: (s) => [s.x, s.y, s.radius, s.strength, s.seed, 0, 0, 0],
  holes: (h) => [h.x, h.y, h.rx, h.ry, h.seed, h.angle, 0, 0],
  burns: (b) => [b.x, b.y, b.radius, b.strength, b.seed, 0, 0, 0],
  tears: (t) => [t.ax, t.ay, t.bx, t.by, t.seed, 0, 0, 0],
  folds: (f) => [f.ax, f.ay, f.bx, f.by, f.seed, f.strength, 0, 0],
  smudges: (s) => [s.x, s.y, s.radius, s.angle, s.seed, s.strength, s.length, 0],
  cuts: (c) => [c.ax, c.ay, c.bx, c.by, c.seed, 0, 0, 0],
  blots: (b) => [b.x, b.y, b.rx, b.ry, b.seed, b.round ? 1 : 0, b.spatter, b.angle],
};

/** Lays damage features out as texels for the surface shaders (see damage/*.glsl). */
export function packFeatures(features: Features): PackedFeatures {
  const data = new Float32Array(MAX_FEATURES * FEATURE_ROWS * 4);
  const counts = {} as Record<keyof Features, number>;
  for (const kind of Object.keys(FEATURE_LAYOUT) as (keyof Features)[]) {
    const row = FEATURE_LAYOUT[kind];
    const list = features[kind].slice(0, MAX_FEATURES);
    const encode = encoders[kind] as (feature: unknown) => number[];
    list.forEach((feature, column) => {
      const values = encode(feature);
      data.set(values.slice(0, 4), (row * MAX_FEATURES + column) * 4);
      data.set(values.slice(4, 8), ((row + 1) * MAX_FEATURES + column) * 4);
    });
    counts[kind] = list.length;
  }
  return { data, counts };
}

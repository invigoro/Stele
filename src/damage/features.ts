import type { Chip } from './chips';
import type { Stain } from './stains';

/** Most features of one kind the shaders read (MAX_CHIPS / MAX_STAINS in the GLSL). */
export const MAX_FEATURES = 64;
/** Texture rows: 0–1 chips, 2–3 stains. */
export const FEATURE_ROWS = 4;

export interface PackedFeatures {
  /** RGBA float texels, MAX_FEATURES wide and FEATURE_ROWS tall. */
  data: Float32Array;
  chipCount: number;
  stainCount: number;
}

/** Lays damage features out as texels for the surface shaders (see damage/*.glsl). */
export function packFeatures(chips: readonly Chip[], stains: readonly Stain[]): PackedFeatures {
  const data = new Float32Array(MAX_FEATURES * FEATURE_ROWS * 4);
  const put = (row: number, column: number, values: number[]) =>
    data.set(values, (row * MAX_FEATURES + column) * 4);

  const chipCount = Math.min(chips.length, MAX_FEATURES);
  chips.slice(0, chipCount).forEach((chip, i) => {
    put(0, i, [chip.x, chip.y, chip.radius, chip.depth]);
    put(1, i, [chip.seed, chip.breaks ? 1 : 0, chip.angle, chip.aspect]);
  });
  const stainCount = Math.min(stains.length, MAX_FEATURES);
  stains.slice(0, stainCount).forEach((stain, i) => {
    put(2, i, [stain.x, stain.y, stain.radius, stain.strength]);
    put(3, i, [stain.seed, 0, 0, 0]);
  });
  return { data, chipCount, stainCount };
}

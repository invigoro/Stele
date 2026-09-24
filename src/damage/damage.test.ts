import { describe, expect, it } from 'vitest';
import { generateChips } from './chips';
import { FEATURE_ROWS, MAX_FEATURES, packFeatures } from './features';
import { generateStains } from './stains';

describe('generateChips', () => {
  const chips = (amount: number, seed = 1) => generateChips(amount, 240, 160, 25, seed);

  it('makes none without damage', () => {
    expect(chips(0)).toEqual([]);
  });

  it('makes more and bigger chips as damage grows', () => {
    const light = chips(0.2);
    const heavy = chips(1);
    expect(heavy.length).toBeGreaterThan(light.length);
    expect(Math.max(...heavy.map((c) => c.radius))).toBeGreaterThan(Math.max(...light.map((c) => c.radius)));
    expect(heavy.length).toBeLessThanOrEqual(MAX_FEATURES);
  });

  it('is repeatable for a seed', () => {
    expect(chips(0.7, 5)).toEqual(chips(0.7, 5));
    expect(chips(0.7, 5)).not.toEqual(chips(0.7, 6));
  });

  it('centres breaks on the outline so they open onto it, and keeps spalls on the face', () => {
    const all = [9, 10, 11].flatMap((seed) => chips(1, seed));
    expect(all.some((chip) => chip.breaks)).toBe(true);
    for (const chip of all) {
      expect(chip.depth).toBeLessThanOrEqual(7.2);
      // Signed distance from the outline: negative beyond the edge.
      const edgeDistance = Math.min(chip.x, chip.y, 240 - chip.x, 160 - chip.y);
      if (chip.breaks) {
        expect(edgeDistance).toBeLessThanOrEqual(0);
        expect(edgeDistance).toBeGreaterThanOrEqual(-0.3 * chip.radius);
      } else {
        expect(edgeDistance).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('clusters toward the edges', () => {
    const all = [1, 2, 3, 4, 5].flatMap((seed) => chips(1, seed));
    const nearEdge = all.filter((c) => Math.min(c.x, c.y, 240 - c.x, 160 - c.y) < 20).length;
    // A uniform spread would put about 38% of chips within 20 mm of an edge.
    expect(nearEdge / all.length).toBeGreaterThan(0.6);
  });
});

describe('generateStains', () => {
  it('makes one to three stains, growing with damage', () => {
    expect(generateStains(0, 150, 210, 1)).toEqual([]);
    const light = generateStains(0.1, 150, 210, 1);
    const heavy = generateStains(1, 150, 210, 1);
    expect(light.length).toBe(1);
    expect(heavy.length).toBe(3);
    expect(heavy[0].radius).toBeGreaterThan(light[0].radius);
    for (const stain of heavy) {
      expect(stain.strength).toBeGreaterThan(0);
      expect(stain.strength).toBeLessThanOrEqual(1);
    }
  });

  it('is repeatable for a seed', () => {
    expect(generateStains(0.5, 150, 210, 3)).toEqual(generateStains(0.5, 150, 210, 3));
  });
});

describe('packFeatures', () => {
  it('writes chips and stains into their own rows', () => {
    const packed = packFeatures(
      [{ x: 1, y: 2, radius: 3, depth: 4, breaks: true, angle: 0.5, aspect: 1.5, seed: 5 }],
      [
        { x: 6, y: 7, radius: 8, strength: 0.9, seed: 10 },
        { x: 11, y: 12, radius: 13, strength: 0.5, seed: 15 },
      ],
    );
    expect(packed.data.length).toBe(MAX_FEATURES * FEATURE_ROWS * 4);
    expect(packed.chipCount).toBe(1);
    expect(packed.stainCount).toBe(2);
    const texel = (row: number, column: number) =>
      Array.from(packed.data.slice((row * MAX_FEATURES + column) * 4, (row * MAX_FEATURES + column) * 4 + 4));
    expect(texel(0, 0)).toEqual([1, 2, 3, 4]);
    expect(texel(1, 0)).toEqual([5, 1, 0.5, 1.5]);
    expect(texel(2, 1)).toEqual([11, 12, 13, 0.5]);
    expect(texel(3, 1)).toEqual([15, 0, 0, 0]);
  });

  it('drops features beyond the shader limit', () => {
    const many = Array.from({ length: MAX_FEATURES + 10 }, (_, i) => ({
      x: i,
      y: 0,
      radius: 1,
      depth: 1,
      breaks: false,
      angle: 0,
      aspect: 1,
      seed: 0,
    }));
    expect(packFeatures(many, []).chipCount).toBe(MAX_FEATURES);
  });
});

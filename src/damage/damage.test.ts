import { describe, expect, it } from 'vitest';
import type { Features } from '../scene';
import { generateBurns } from './burns';
import { generateBreaks, generateChips } from './chips';
import { generateCracks } from './cracks';
import { FEATURE_LAYOUT, FEATURE_ROWS, MAX_FEATURES, packFeatures } from './features';
import { generateHoles } from './holes';
import { generateFolds, generateFragmentCuts, generateSmudges, generateTears } from './sheetDamage';
import { generateStains } from './stains';
import { damageAmounts } from './types';

const W = 240;
const H = 160;
const edgeDistance = (x: number, y: number) => Math.min(x, y, W - x, H - y);

describe('generateChips', () => {
  const chips = (amount: number, seed = 1) => generateChips(amount, W, H, seed);

  it('makes none without damage, and more and bigger ones as damage grows', () => {
    expect(chips(0)).toEqual([]);
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

  it('keeps spalls on the face, never breaking through', () => {
    for (const chip of [1, 2, 3].flatMap((seed) => chips(1, seed))) {
      expect(chip.breaks).toBe(false);
      expect(edgeDistance(chip.x, chip.y)).toBeGreaterThanOrEqual(0);
      expect(chip.depth).toBeLessThanOrEqual(4);
    }
  });

  it('stretches gouges along the grain', () => {
    for (const gouge of generateChips(1, W, H, 4, { grain: 0 })) {
      expect(Math.abs(gouge.angle)).toBeLessThanOrEqual(0.1);
      expect(gouge.aspect).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('generateBreaks', () => {
  it('centres every break on or just beyond the outline, so it opens onto it', () => {
    const breaks = [9, 10, 11].flatMap((seed) => generateBreaks(1, W, H, 25, seed));
    expect(breaks.length).toBeGreaterThan(3);
    for (const piece of breaks) {
      expect(piece.breaks).toBe(true);
      const distance = edgeDistance(piece.x, piece.y); // negative beyond the edge
      expect(distance).toBeLessThanOrEqual(0);
      expect(distance).toBeGreaterThanOrEqual(-0.3 * piece.radius);
    }
  });

  it('makes none without damage', () => {
    expect(generateBreaks(0, W, H, 25, 1)).toEqual([]);
  });
});

describe('generateCracks', () => {
  it('starts cracks on the outline and makes more and longer ones with damage', () => {
    const light = generateCracks(0.1, W, H, 3);
    const heavy = generateCracks(1, W, H, 3);
    const length = (cracks: typeof heavy) =>
      cracks.reduce((sum, crack) => sum + crack.points.length, 0);
    expect(length(heavy)).toBeGreaterThan(length(light));
    for (const crack of heavy) {
      expect(crack.points.length).toBeGreaterThan(1);
      expect(crack.endWidth).toBeLessThan(crack.startWidth);
    }
    // Trunks (not branches) start exactly on the outline.
    expect(heavy.some((crack) => edgeDistance(...crack.points[0]) === 0)).toBe(true);
  });

  it('runs splits along the grain', () => {
    for (const split of generateCracks(1, W, H, 5, { grain: 0 })) {
      const [x0, y0] = split.points[0];
      const [x1, y1] = split.points.at(-1)!;
      // Mostly horizontal: far more travel along x than across.
      expect(Math.abs(x1 - x0)).toBeGreaterThan(4 * Math.abs(y1 - y0));
    }
  });
});

describe('generateHoles', () => {
  it('puts nail holes near the corners', () => {
    const nails = generateHoles('nail', 1, W, H, 1);
    expect(nails).toHaveLength(4);
    for (const nail of nails) expect(edgeDistance(nail.x, nail.y)).toBeLessThan(15);
  });

  it('clusters worm holes and stretches papyrus gaps along the fibres', () => {
    expect(generateHoles('worm', 0.8, W, H, 2).length).toBeGreaterThan(4);
    for (const gap of generateHoles('lacuna', 1, W, H, 3)) expect(gap.rx).toBeGreaterThan(gap.ry);
    expect(generateHoles('worm', 0, W, H, 2)).toEqual([]);
  });
});

describe('generateBurns', () => {
  it('makes more burns with damage, mostly caught at an edge', () => {
    expect(generateBurns(0, W, H, 1)).toEqual([]);
    const burns = [1, 2, 3, 4].flatMap((seed) => generateBurns(1, W, H, seed));
    const outside = burns.filter((b) => edgeDistance(b.x, b.y) < 0).length;
    expect(outside / burns.length).toBeGreaterThan(0.4);
    for (const burn of burns) expect(burn.strength).toBeLessThanOrEqual(1);
  });
});

describe('sheet damage', () => {
  it('tears between two points on the outline', () => {
    for (const tear of [1, 2, 3].flatMap((seed) => generateTears(1, 148, 210, seed))) {
      expect(Number.isFinite(tear.ax + tear.ay + tear.bx + tear.by)).toBe(true);
      expect(Math.hypot(tear.bx - tear.ax, tear.by - tear.ay)).toBeGreaterThan(1);
    }
    expect(generateTears(0, 148, 210, 1)).toEqual([]);
  });

  it('cuts fragments across the corners', () => {
    const cuts = generateFragmentCuts(W, H, 7);
    expect(cuts.length).toBeGreaterThanOrEqual(1);
    expect(cuts.length).toBeLessThanOrEqual(3);
    for (const cut of cuts) {
      // Both ends lie on the outline.
      expect(edgeDistance(cut.ax, cut.ay)).toBeCloseTo(0, 6);
      expect(edgeDistance(cut.bx, cut.by)).toBeCloseTo(0, 6);
    }
  });

  it('folds in half, then thirds, then crosswise as damage grows', () => {
    expect(generateFolds(0.2, 148, 210, 1)).toHaveLength(1);
    expect(generateFolds(0.5, 148, 210, 1)).toHaveLength(2);
    expect(generateFolds(0.9, 148, 210, 1)).toHaveLength(3);
  });

  it('places smudges over the writing', () => {
    const area = { x: 16, y: 18, width: 116, height: 100 };
    for (const smudge of generateSmudges(1, area, 4)) {
      expect(smudge.x).toBeGreaterThanOrEqual(area.x);
      expect(smudge.x).toBeLessThanOrEqual(area.x + area.width);
      expect(smudge.y).toBeGreaterThanOrEqual(area.y);
      expect(smudge.y).toBeLessThanOrEqual(area.y + area.height);
    }
  });

  it('makes water stains, growing with damage', () => {
    expect(generateStains(0, 148, 210, 1)).toEqual([]);
    expect(generateStains(1, 148, 210, 1)[0].radius).toBeGreaterThan(generateStains(0.1, 148, 210, 1)[0].radius);
  });
});

describe('damageAmounts', () => {
  it('scales each type by the overall amount, within 0–1', () => {
    expect(damageAmounts(0.5, { chips: 0.8, lichen: 0 })).toEqual({ chips: 0.4, lichen: 0 });
    expect(damageAmounts(1, { chips: 2 })).toEqual({ chips: 1 });
  });
});

describe('packFeatures', () => {
  const empty: Features = { chips: [], stains: [], holes: [], burns: [], tears: [], folds: [], smudges: [], cuts: [] };

  it('writes each kind into its own pair of rows', () => {
    const packed = packFeatures({
      ...empty,
      chips: [{ x: 1, y: 2, radius: 3, depth: 4, breaks: true, angle: 0.5, aspect: 1.5, seed: 5 }],
      folds: [
        { ax: 0, ay: 1, bx: 2, by: 3, strength: 0.5, seed: 7 },
        { ax: 4, ay: 5, bx: 6, by: 7, strength: 0.25, seed: 9 },
      ],
    });
    expect(packed.data.length).toBe(MAX_FEATURES * FEATURE_ROWS * 4);
    expect(packed.counts).toMatchObject({ chips: 1, folds: 2, stains: 0 });
    const texel = (row: number, column: number) =>
      Array.from(packed.data.slice((row * MAX_FEATURES + column) * 4, (row * MAX_FEATURES + column) * 4 + 4));
    expect(texel(FEATURE_LAYOUT.chips, 0)).toEqual([1, 2, 3, 4]);
    expect(texel(FEATURE_LAYOUT.chips + 1, 0)).toEqual([5, 1, 0.5, 1.5]);
    expect(texel(FEATURE_LAYOUT.folds, 1)).toEqual([4, 5, 6, 7]);
    expect(texel(FEATURE_LAYOUT.folds + 1, 1)).toEqual([9, 0.25, 0, 0]);
  });

  it('drops features beyond the shader limit', () => {
    const chip = { x: 0, y: 0, radius: 1, depth: 1, breaks: false, angle: 0, aspect: 1, seed: 0 };
    const packed = packFeatures({ ...empty, chips: Array.from({ length: MAX_FEATURES + 10 }, () => chip) });
    expect(packed.counts.chips).toBe(MAX_FEATURES);
  });
});

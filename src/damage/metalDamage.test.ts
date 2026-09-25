import { describe, expect, it } from 'vitest';
import { generateDents, generateScratches } from './metalDamage';

const W = 250;
const H = 170;

describe('generateDents', () => {
  it('makes none without damage, and more and deeper ones as damage grows', () => {
    expect(generateDents(0, W, H, 1)).toEqual([]);
    const light = generateDents(0.1, W, H, 1);
    const heavy = generateDents(1, W, H, 1);
    expect(heavy.length).toBeGreaterThan(light.length);
    expect(Math.max(...heavy.map((d) => d.depth))).toBeGreaterThan(Math.max(...light.map((d) => d.depth)));
  });

  it('keeps every dent on the face, as a smooth hollow rather than a break', () => {
    for (const dent of [1, 2, 3, 4].flatMap((seed) => generateDents(1, W, H, seed))) {
      expect(dent.x - dent.radius).toBeGreaterThanOrEqual(0);
      expect(dent.x + dent.radius).toBeLessThanOrEqual(W);
      expect(dent.y - dent.radius).toBeGreaterThanOrEqual(0);
      expect(dent.y + dent.radius).toBeLessThanOrEqual(H);
      expect(dent.breaks).toBe(false);
    }
  });

  it('is repeatable for a seed', () => {
    expect(generateDents(0.6, W, H, 9)).toEqual(generateDents(0.6, W, H, 9));
  });
});

describe('generateScratches', () => {
  it('makes none without damage, and more as damage grows', () => {
    expect(generateScratches(0, W, H, 1)).toEqual([]);
    const count = (amount: number) => [1, 2, 3].flatMap((seed) => generateScratches(amount, W, H, seed)).length;
    expect(count(1)).toBeGreaterThan(count(0.1));
  });

  it('scores thin, nearly straight lines', () => {
    for (const scratch of [1, 2, 3].flatMap((seed) => generateScratches(1, W, H, seed))) {
      expect(scratch.startWidth).toBeLessThanOrEqual(0.4);
      const [first, last] = [scratch.points[0], scratch.points.at(-1)!];
      const straight = Math.hypot(last[0] - first[0], last[1] - first[1]);
      let travelled = 0;
      for (let i = 1; i < scratch.points.length; i++) {
        travelled += Math.hypot(scratch.points[i][0] - scratch.points[i - 1][0], scratch.points[i][1] - scratch.points[i - 1][1]);
      }
      expect(straight / travelled).toBeGreaterThan(0.95);
    }
  });
});

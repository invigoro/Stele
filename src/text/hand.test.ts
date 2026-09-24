import { describe, expect, it } from 'vitest';
import { drawText, type Hand } from './hand';
import type { Measure, TextLayout } from './layout';

const mono: Measure = { width: (text) => [...text].length * 0.5, ascent: 0.7, descent: 0.3 };

const steady: Hand = { perGlyph: true, rotation: 0, baseline: 0, spacing: 0, scale: 0, lineSlope: 0, dipPen: false };

const layout: TextLayout = {
  size: 10,
  letterSpacing: 0.1,
  lines: [
    { text: 'AB CD', x: 5, baseline: 20, width: 0 },
    { text: 'EFG', x: 5, baseline: 35, width: 0 },
  ],
};

describe('drawText', () => {
  it('places each letter at its measured offset, skipping spaces', () => {
    const { runs } = drawText(layout, mono, steady, 1);
    expect(runs.map((run) => run.text)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    // Each character advances 0.5 em plus 0.1 em of letter spacing: 6 mm at size 10.
    expect(runs.map((run) => run.x)).toEqual([5, 11, 23, 29, 5, 11, 17]);
    expect(runs.every((run) => run.rotation === 0 && run.scale === 1)).toBe(true);
    expect(runs.slice(0, 4).every((run) => run.y === 20)).toBe(true);
  });

  it('draws whole words for joined scripts', () => {
    const { runs } = drawText(layout, mono, { ...steady, perGlyph: false }, 1);
    expect(runs.map((run) => [run.text, run.x])).toEqual([
      ['AB', 5],
      ['CD', 23],
      ['EFG', 5],
    ]);
  });

  it('is repeatable for a seed and varies between seeds', () => {
    const shaky: Hand = { ...steady, rotation: 2, baseline: 0.05, spacing: 0.05, scale: 0.05, lineSlope: 1 };
    expect(drawText(layout, mono, shaky, 7)).toEqual(drawText(layout, mono, shaky, 7));
    expect(drawText(layout, mono, shaky, 7)).not.toEqual(drawText(layout, mono, shaky, 8));
  });

  it('keeps jitter within the hand’s limits', () => {
    const shaky: Hand = { ...steady, rotation: 2, baseline: 0.05, scale: 0.05 };
    for (const run of drawText(layout, mono, shaky, 3).runs) {
      expect(Math.abs(run.rotation)).toBeLessThanOrEqual((2 * Math.PI) / 180);
      expect(Math.abs(run.scale - 1)).toBeLessThanOrEqual(0.05);
    }
  });

  it('thins the ink between dips of the pen', () => {
    const long: TextLayout = { size: 5, letterSpacing: 0, lines: [{ text: 'word '.repeat(40), x: 0, baseline: 5, width: 0 }] };
    const densities = drawText(long, mono, { ...steady, perGlyph: false, dipPen: true }, 11).runs.map((run) => run.density);
    expect(densities[0]).toBe(1);
    expect(Math.min(...densities)).toBeGreaterThanOrEqual(0.3);
    expect(Math.min(...densities)).toBeLessThan(0.7);
    // The pen gets re-dipped: density jumps back up to 1 at least once after the start.
    expect(densities.slice(1).filter((d) => d === 1).length).toBeGreaterThan(0);
  });
});

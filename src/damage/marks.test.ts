import { describe, expect, it } from 'vitest';
import type { Features } from '../scene';
import type { Drawing } from '../text/hand';
import type { Box, Measure } from '../text/layout';
import { distanceToBox, markedAreas, obliterate, protectAreas } from './marks';

const mono: Measure = { width: (text) => [...text].length * 0.5, ascent: 0.7, descent: 0.3 };

// "AB CD" on one line and "EF" on the next, drawn a letter at a time at size 10.
const drawing: Drawing = {
  size: 10,
  runs: [
    { text: 'A', x: 0, y: 20, rotation: 0, scale: 1, density: 1, source: 0, length: 1 },
    { text: 'B', x: 5, y: 20, rotation: 0, scale: 1, density: 1, source: 1, length: 1 },
    { text: 'C', x: 15, y: 20, rotation: 0, scale: 1, density: 1, source: 3, length: 1 },
    { text: 'D', x: 20, y: 20, rotation: 0, scale: 1, density: 1, source: 4, length: 1 },
    { text: 'E', x: 0, y: 35, rotation: 0, scale: 1, density: 1, source: 6, length: 1 },
    { text: 'F', x: 5, y: 35, rotation: 0, scale: 1, density: 1, source: 7, length: 1 },
  ],
};

const none: Features = { chips: [], stains: [], holes: [], burns: [], tears: [], folds: [], smudges: [], cuts: [], blots: [] };

describe('markedAreas', () => {
  it('boxes the runs a span covers', () => {
    const marks = markedAreas(drawing, [{ start: 3, end: 5, kind: 'destroy' }], mono);
    // "CD": from x 15 to 20 + 5, and from 7 above the baseline to 3 below.
    expect(marks.destroy).toEqual([{ x: 15, y: 13, width: 10, height: 10 }]);
    expect(marks.protect).toEqual([]);
  });

  it('makes one box per line when a span wraps', () => {
    const marks = markedAreas(drawing, [{ start: 3, end: 8, kind: 'protect' }], mono);
    expect(marks.protect).toHaveLength(2);
    expect(marks.protect[1]).toEqual({ x: 0, y: 28, width: 10, height: 10 });
  });
});

describe('protectAreas', () => {
  const box: Box = { x: 100, y: 100, width: 40, height: 10 };
  const center: [number, number] = [120, 100];

  it('drops damage that would reach a protected box and keeps the rest', () => {
    const chip = (x: number, y: number) => ({ x, y, radius: 5, depth: 1, breaks: false, angle: 0, aspect: 1, seed: 0 });
    const result = protectAreas(
      {
        ...none,
        chips: [chip(120, 105), chip(20, 20)],
        stains: [{ x: 110, y: 130, radius: 30, strength: 1, seed: 0 }],
        folds: [
          { ax: 0, ay: 104, bx: 240, by: 104, strength: 1, seed: 0 },
          { ax: 0, ay: 50, bx: 240, by: 50, strength: 1, seed: 0 },
        ],
      },
      [{ points: [[0, 0], [110, 102]], startWidth: 1, endWidth: 0.2 }, { points: [[0, 0], [10, 10]], startWidth: 1, endWidth: 0.2 }],
      [box],
      center,
    );
    expect(result.features.chips.map((c) => c.x)).toEqual([20]);
    expect(result.features.stains).toEqual([]);
    expect(result.features.folds.map((f) => f.ay)).toEqual([50]);
    expect(result.cracks).toHaveLength(1);
  });

  it('keeps ink blots, droplets and all, off protected words', () => {
    const blot = (x: number, spatter: number) => ({ x, y: 105, rx: 4, ry: 4, angle: 0, round: true, spatter, seed: 0 });
    // 10 mm from the box: clear of a tidy blot, but not of one that splashed far.
    const result = protectAreas({ ...none, blots: [blot(150, 0.2), blot(150, 1), blot(300, 1)] }, [], [box], center);
    expect(result.features.blots.map((b) => [b.x, b.spatter])).toEqual([[150, 0.2], [300, 1]]);
  });

  it('drops cuts that would remove the box, and keeps ones on the far side', () => {
    const result = protectAreas(
      {
        ...none,
        cuts: [
          // Removes everything above y = 102: that takes the box's top edge.
          { ax: 0, ay: 102, bx: 240, by: 102, seed: 0 },
          // Removes everything above y = 20: far from the box.
          { ax: 0, ay: 20, bx: 240, by: 20, seed: 0 },
        ],
      },
      [],
      [box],
      [120, 150],
    );
    expect(result.features.cuts.map((c) => c.ay)).toEqual([20]);
  });
});

describe('obliterate', () => {
  const box: Box = { x: 50, y: 40, width: 60, height: 20 };

  it('covers the box with a chip deep enough to erase the carving', () => {
    const [chip] = obliterate([box], 'chip', 20).chips;
    expect([chip.x, chip.y]).toEqual([80, 50]);
    // Even its narrowest reach (0.65 of the radius, less along the short axis) covers the box.
    expect(0.65 * chip.radius).toBeGreaterThanOrEqual(box.width / 2);
    expect((0.65 * chip.radius) / chip.aspect).toBeGreaterThanOrEqual(box.height / 2);
    expect(chip.depth).toBeGreaterThan(0.15 * 20);
  });

  it('drops a blot or opens a hole big enough for the box', () => {
    const [blot] = obliterate([box], 'blot', 6).blots;
    expect(blot.rx).toBeGreaterThan(box.width / 2);
    expect(blot.ry).toBeGreaterThan(box.height / 2);
    expect(blot.round).toBe(false); // squarish, to cover the word's corners
    const [hole] = obliterate([box], 'hole', 6).holes;
    expect(distanceToBox(hole.x, hole.y, box)).toBe(0);
    expect(hole.rx).toBeGreaterThan(box.width / 2);
    // The hole's ellipse contains the corners of the box.
    expect((box.width / 2 / hole.rx) ** 2 + (box.height / 2 / hole.ry) ** 2).toBeLessThan(1);
  });
});

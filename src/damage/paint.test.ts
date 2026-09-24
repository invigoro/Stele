import { describe, expect, it } from 'vitest';
import { extendStroke, MAX_POINTS, PAINT_KINDS, PAINT_LABELS, quantize, type Stroke } from './paint';

const stroke = (points: [number, number][] = [], radius = 0.03): Stroke => ({ kind: 'break', radius, points, page: 0 });

describe('extendStroke', () => {
  it('adds points that are far enough apart, rounded to a thousandth', () => {
    const s = extendStroke(stroke(), [0.12345, 0.5], 1);
    expect(s.points).toEqual([[0.123, 0.5]]);
    const t = extendStroke(s, [0.2, 0.5], 1);
    expect(t.points).toHaveLength(2);
  });

  it('skips points closer than a third of the radius', () => {
    const s = stroke([[0.5, 0.5]], 0.03);
    expect(extendStroke(s, [0.505, 0.5], 1)).toBe(s);
    expect(extendStroke(s, [0.52, 0.5], 1).points).toHaveLength(2);
  });

  it('measures spacing in units of the shorter side', () => {
    // On a sheet twice as wide as it is tall, a step of 0.006 across is 0.012 of the height.
    const s = stroke([[0.5, 0.5]], 0.03);
    expect(extendStroke(s, [0.506, 0.5], 2).points).toHaveLength(2);
    expect(extendStroke(s, [0.506, 0.5], 1)).toBe(s);
  });

  it('stops growing at the point limit', () => {
    const full = stroke(Array.from({ length: MAX_POINTS }, (_, i) => [i / MAX_POINTS, 0] as [number, number]));
    expect(extendStroke(full, [0.9, 0.9], 1)).toBe(full);
  });
});

describe('paint kinds', () => {
  it('has a label for every kind on every family of media', () => {
    for (const labels of Object.values(PAINT_LABELS)) {
      expect(Object.keys(labels).sort()).toEqual([...PAINT_KINDS].sort());
    }
  });

  it('rounds coordinates for compact links', () => {
    expect(quantize(0.123456)).toBe(0.123);
    expect(quantize(1)).toBe(1);
  });
});

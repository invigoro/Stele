import { describe, expect, it } from 'vitest';
import { MEDIA } from '../media/media';
import { extendStroke, MAX_POINTS, PAINT_KINDS, PAINT_LABELS, paintKinds, quantize, type Stroke } from './paint';

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
  it('offers the four common kinds on every medium, in order, each with a label', () => {
    for (const medium of Object.values(MEDIA)) {
      expect(paintKinds(medium).slice(0, 4)).toEqual(['break', 'wear', 'stain', 'burn']);
      for (const kind of paintKinds(medium)) expect(PAINT_LABELS[medium.family][kind]).toBeTruthy();
    }
    expect(new Set(Object.values(MEDIA).flatMap((medium) => paintKinds(medium)))).toEqual(new Set(PAINT_KINDS));
  });

  it('offers moss where lichen and moss grow, and ink blots where there are blots', () => {
    for (const medium of Object.values(MEDIA)) {
      expect(paintKinds(medium).includes('growth'), medium.label).toBe('lichen' in medium.damage);
      expect(paintKinds(medium).includes('blot'), medium.label).toBe('blots' in medium.damage);
    }
    expect(PAINT_LABELS.stone.growth).toBe('Moss');
    expect(PAINT_LABELS.sheet.blot).toBe('Ink blot');
  });

  it('rounds coordinates for compact links', () => {
    expect(quantize(0.123456)).toBe(0.123);
    expect(quantize(1)).toBe(1);
  });
});

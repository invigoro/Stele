import { describe, expect, it } from 'vitest';
import { coverageValues, hasTransparency } from './picture';

/** RGBA pixels from [r, g, b, a] tuples. */
const pixels = (...rgba: [number, number, number, number][]) => Uint8ClampedArray.from(rgba.flat());

describe('coverageValues', () => {
  const black = [0, 0, 0, 255] as [number, number, number, number];
  const white = [255, 255, 255, 255] as [number, number, number, number];
  const clear = [0, 0, 0, 0] as [number, number, number, number];
  const grey = [128, 128, 128, 255] as [number, number, number, number];

  it('writes everything opaque, whatever its colour, and nothing transparent', () => {
    expect([...coverageValues(pixels(black, white, clear), 'opaque', 0.5)]).toEqual([255, 255, 0]);
  });

  it('writes the dark parts of a drawing on white, and the light parts of one on black', () => {
    expect([...coverageValues(pixels(black, white, clear), 'dark', 0.5)]).toEqual([255, 0, 0]);
    expect([...coverageValues(pixels(black, white, clear), 'light', 0.5)]).toEqual([0, 255, 0]);
  });

  it('moves the line between written and bare with the threshold', () => {
    expect(coverageValues(pixels(grey), 'dark', 0.3)[0]).toBe(255); // grey counts as dark
    expect(coverageValues(pixels(grey), 'dark', 0.7)[0]).toBe(0); // not dark enough
    const edge = coverageValues(pixels(grey), 'dark', 0.5)[0];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255); // right at the threshold: a soft edge
  });
});

describe('hasTransparency', () => {
  it('notices a see-through background, but not the odd stray pixel', () => {
    const opaque = Array.from({ length: 200 }, () => [10, 10, 10, 255] as [number, number, number, number]);
    expect(hasTransparency(pixels(...opaque))).toBe(false);
    expect(hasTransparency(pixels(...opaque, [0, 0, 0, 0]))).toBe(false);
    expect(hasTransparency(pixels(...opaque, ...Array.from({ length: 20 }, () => [0, 0, 0, 0] as [number, number, number, number])))).toBe(true);
  });
});

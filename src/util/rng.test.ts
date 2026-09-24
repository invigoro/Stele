import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';

describe('mulberry32', () => {
  it('matches the reference implementation', () => {
    // Values from the canonical mulberry32 for seed 12345.
    const next = mulberry32(12345);
    expect([next(), next(), next(), next()]).toEqual([
      0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203,
    ]);
  });

  it('repeats exactly for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it('stays in [0, 1) over many draws', () => {
    const next = mulberry32(7);
    for (let i = 0; i < 100_000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

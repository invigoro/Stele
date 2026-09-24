/**
 * Small, fast, seedable PRNG (mulberry32) returning floats in [0, 1). The same seed
 * gives the same sequence in every browser, which is what makes renders reproducible.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh random 32-bit seed, for "reroll" buttons. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

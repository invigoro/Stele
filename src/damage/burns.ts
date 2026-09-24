import { mulberry32 } from '../util/rng';

/** A burn: charred where it's hottest and burned through in the middle, sizes in mm. */
export interface Burn {
  x: number;
  y: number;
  radius: number;
  /** 0–1: how far it burned; strong burns go right through. */
  strength: number;
  seed: number;
}

/**
 * Burns, sizes in mm: mostly fires that caught an edge or a corner, plus the odd spot
 * where an ember landed. `amount` (0–1) sets how many and how big.
 */
export function generateBurns(amount: number, width: number, height: number, seed: number): Burn[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const short = Math.min(width, height);
  const count = 1 + Math.floor(amount * 3.99);
  const burns: Burn[] = [];
  for (let i = 0; i < count; i++) {
    let x = random() * width;
    let y = random() * height;
    let radius = short * (0.03 + 0.05 * random()) * (0.6 + amount);
    if (random() < 0.7) {
      // Caught at the edge: centred beyond it so the fire eats inward.
      radius = short * (0.12 + 0.18 * random()) * (0.5 + amount);
      const side = Math.floor(random() * 4);
      const beyond = radius * (0.2 + 0.5 * random());
      if (side === 0) y = -beyond;
      else if (side === 1) y = height + beyond;
      else if (side === 2) x = -beyond;
      else x = width + beyond;
    }
    burns.push({ x, y, radius, strength: 0.5 + 0.5 * amount * (0.6 + 0.4 * random()), seed: random() * 100 });
  }
  return burns;
}

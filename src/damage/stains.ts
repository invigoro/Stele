import { mulberry32 } from '../util/rng';

export interface Stain {
  x: number;
  y: number;
  radius: number;
  /** 0–1: how soaked the paper got. */
  strength: number;
  seed: number;
}

/**
 * Water stains on a sheet, sizes in mm. Half of them soak in from an edge or corner,
 * the way a spill or a leak usually reaches paper. `amount` (0–1) sets how many there
 * are, how big and how strong.
 */
export function generateStains(amount: number, width: number, height: number, seed: number): Stain[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const count = 1 + Math.floor(amount * 2.99);
  const short = Math.min(width, height);
  const stains: Stain[] = [];

  for (let i = 0; i < count; i++) {
    const radius = short * (0.12 + 0.2 * random()) * (0.6 + 0.8 * amount);
    let x = random() * width;
    let y = random() * height;
    if (random() < 0.5) {
      // Centred just beyond an edge so the stain creeps in from it.
      const side = Math.floor(random() * 4);
      const beyond = radius * (0.1 + 0.4 * random());
      if (side === 0) y = -beyond;
      else if (side === 1) y = height + beyond;
      else if (side === 2) x = -beyond;
      else x = width + beyond;
    }
    stains.push({ x, y, radius, strength: (0.5 + 0.5 * amount) * (0.7 + 0.3 * random()), seed: random() * 100 });
  }
  return stains;
}

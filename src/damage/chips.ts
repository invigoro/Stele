import { mulberry32 } from '../util/rng';

export interface Chip {
  x: number;
  y: number;
  /** Length of the flake's long half-axis, mm. */
  radius: number;
  /** mm below the face: the floor of a spall, or the foot of a broken face. */
  depth: number;
  /** Broke right through the slab, taking a bite out of its outline. */
  breaks: boolean;
  /** Orientation of the flake's long axis, radians. */
  angle: number;
  /** Long axis over short axis, ≥ 1. */
  aspect: number;
  seed: number;
}

export interface ChipOptions {
  /** Align every flake's long axis to this angle (radians), as wood splinters along its grain. */
  grain?: number;
}

/** Log-uniform sizes from 1.5% of the short side up to 5–15% as damage grows. */
function chipRadius(random: () => number, amount: number, short: number): number {
  const largest = 0.05 + 0.1 * amount;
  return short * 0.015 * Math.pow(largest / 0.015, random());
}

/**
 * Spalls: shallow flakes knocked out of the face, all sizes in mm. Most are small and a
 * few are large; about half sit near the edges, where slabs get knocked. `amount`
 * (0–1) sets how many there are and how big they get.
 */
export function generateChips(
  amount: number,
  width: number,
  height: number,
  seed: number,
  options: ChipOptions = {},
): Chip[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const count = Math.round(amount * amount * 14 + amount * 8);
  const short = Math.min(width, height);
  const chips: Chip[] = [];
  for (let i = 0; i < count; i++) {
    const radius = chipRadius(random, amount, short);
    let x = random() * width;
    let y = random() * height;
    if (random() < 0.45) {
      // Just inside one of the edges.
      const inset = radius * (0.3 + 0.7 * random());
      const side = Math.floor(random() * 4);
      if (side === 0) y = inset;
      else if (side === 1) y = height - inset;
      else if (side === 2) x = inset;
      else x = width - inset;
    }
    const grained = options.grain !== undefined;
    chips.push({
      x,
      y,
      radius: grained ? radius * 1.3 : radius,
      depth: Math.min(4, radius * (0.12 + 0.13 * random())),
      breaks: false,
      angle: grained ? options.grain! + (random() - 0.5) * 0.2 : random() * Math.PI,
      aspect: grained ? 2 + random() * 1.5 : 1 + random() * 1.2,
      seed: random() * 100,
    });
  }
  return chips;
}

/**
 * Breaks: pieces missing from the edges and corners of a slab. Each is centred on or
 * just beyond the outline, so the loss always opens onto it, and leaves a steep,
 * rough broken face. `amount` (0–1) sets how many and how big.
 */
export function generateBreaks(
  amount: number,
  width: number,
  height: number,
  thickness: number,
  seed: number,
): Chip[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const count = Math.round(1 + amount * amount * 6 + amount * 4);
  const short = Math.min(width, height);
  const breaks: Chip[] = [];
  for (let i = 0; i < count; i++) {
    // About half of a break lies beyond the edge, so make it bigger to leave a real bite.
    const radius = chipRadius(random, amount, short) * 1.4;
    const beyond = random() * radius * 0.3;
    let x: number;
    let y: number;
    if (random() < 0.3) {
      x = random() < 0.5 ? -beyond : width + beyond;
      y = random() < 0.5 ? -beyond : height + beyond;
    } else {
      const side = Math.floor(random() * 4);
      const along = random();
      [x, y] =
        side === 0
          ? [along * width, -beyond]
          : side === 1
            ? [along * width, height + beyond]
            : side === 2
              ? [-beyond, along * height]
              : [width + beyond, along * height];
    }
    breaks.push({
      x,
      y,
      radius,
      depth: Math.min(6, 0.25 * thickness) * (0.8 + 0.4 * random()),
      breaks: true,
      angle: random() * Math.PI,
      // Fairly round, so the hole reaches the edge in every direction.
      aspect: 1 + random() * 0.3,
      seed: random() * 100,
    });
  }
  return breaks;
}

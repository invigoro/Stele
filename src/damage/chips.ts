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

/**
 * Chips knocked out of a stone slab, all sizes in mm. Most are small and a few are
 * large; they cluster along the edges and at the corners, where slabs get knocked.
 * Chips at a corner, and some along the edges, break right through; those are centred
 * on or just beyond the edge so the loss always opens onto it. `amount` (0–1) sets
 * how many there are and how big they get.
 */
export function generateChips(
  amount: number,
  width: number,
  height: number,
  thickness: number,
  seed: number,
): Chip[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const count = Math.round(amount * amount * 18 + amount * 10);
  const short = Math.min(width, height);
  const chips: Chip[] = [];

  for (let i = 0; i < count; i++) {
    // Log-uniform sizes from 1.5% of the short side up to 5–15% as damage grows.
    const largest = 0.05 + 0.1 * amount;
    let radius = short * 0.015 * Math.pow(largest / 0.015, random());
    const { x, y, breaks } = placeChip(random, width, height, radius);
    // About half of a break lies beyond the edge, so make it bigger to leave a real bite.
    if (breaks) radius *= 1.4;
    const depth = breaks
      ? Math.min(6, 0.25 * thickness) * (0.8 + 0.4 * random())
      : Math.min(4, radius * (0.12 + 0.13 * random()));
    chips.push({
      x,
      y,
      radius,
      depth,
      breaks,
      angle: random() * Math.PI,
      // Breaks stay fairly round so that their hole reaches the edge in every direction.
      aspect: 1 + random() * (breaks ? 0.3 : 1.2),
      seed: random() * 100,
    });
  }
  return chips;
}

function placeChip(
  random: () => number,
  width: number,
  height: number,
  radius: number,
): { x: number; y: number; breaks: boolean } {
  const kind = random();
  if (kind < 0.15) {
    // A broken corner, centred on it or just beyond.
    const beyond = () => random() * radius * 0.3;
    return {
      x: random() < 0.5 ? -beyond() : width + beyond(),
      y: random() < 0.5 ? -beyond() : height + beyond(),
      breaks: true,
    };
  }
  if (kind < 0.6) {
    // Along one of the four edges: either broken through from beyond the edge, or a
    // spall just inside it.
    const breaks = random() < 0.4;
    const inset = breaks ? -random() * radius * 0.3 : radius * (0.3 + 0.7 * random());
    const side = Math.floor(random() * 4);
    const along = random();
    if (side === 0) return { x: along * width, y: inset, breaks };
    if (side === 1) return { x: along * width, y: height - inset, breaks };
    if (side === 2) return { x: inset, y: along * height, breaks };
    return { x: width - inset, y: along * height, breaks };
  }
  return { x: random() * width, y: random() * height, breaks: false };
}

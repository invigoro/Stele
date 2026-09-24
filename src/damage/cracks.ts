import { mulberry32 } from '../util/rng';

/** A crack as a polyline, with its width (mm) tapering from start to end. */
export interface Crack {
  points: [number, number][];
  startWidth: number;
  endWidth: number;
}

export interface CrackOptions {
  /** Run along this direction (radians) instead of wandering, as wood splits along its grain. */
  grain?: number;
}

/**
 * Cracks that start at the edge of an object and run inward, wandering and branching
 * (or, with a grain, running long and nearly straight along it). Sizes in mm;
 * `amount` (0–1) sets how many there are and how far they reach.
 */
export function generateCracks(
  amount: number,
  width: number,
  height: number,
  seed: number,
  options: CrackOptions = {},
): Crack[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const grained = options.grain !== undefined;
  const count = grained ? 1 + Math.floor(amount * 4) : 1 + Math.floor(amount * 2.5);
  const reach = Math.hypot(width, height) * (0.25 + 0.5 * amount);
  const cracks: Crack[] = [];

  const walk = (x: number, y: number, heading: number, length: number, width0: number, depth: number) => {
    const points: [number, number][] = [[x, y]];
    const step = Math.min(width, height) * 0.02;
    const wander = grained ? 0.04 : 0.35;
    let travelled = 0;
    while (travelled < length) {
      heading += (random() - 0.5) * wander;
      if (grained) {
        // Keep to the grain, pulling toward whichever way along it is nearer.
        const along = options.grain! + Math.PI * Math.round((heading - options.grain!) / Math.PI);
        heading += (along - heading) * 0.2;
      }
      x += Math.cos(heading) * step;
      y += Math.sin(heading) * step;
      travelled += step;
      points.push([x, y]);
      if (x < -step || y < -step || x > width + step || y > height + step) break;
      // Occasionally fork off a thinner, shorter branch.
      if (!grained && depth < 2 && random() < 0.06) {
        const side = random() < 0.5 ? -1 : 1;
        const fraction = 1 - travelled / length;
        walk(x, y, heading + side * (0.4 + 0.5 * random()), length * fraction * 0.6, width0 * fraction * 0.6, depth + 1);
      }
    }
    if (points.length > 1) cracks.push({ points, startWidth: width0, endWidth: width0 * 0.15 });
  };

  for (let i = 0; i < count; i++) {
    // Start on a random edge, heading inward (or, with a grain, from an end of it).
    const side = grained ? (Math.cos(options.grain!) ** 2 > 0.5 ? (random() < 0.5 ? 2 : 3) : random() < 0.5 ? 0 : 1) : Math.floor(random() * 4);
    const along = 0.1 + 0.8 * random();
    const [x, y, inward] =
      side === 0
        ? [along * width, 0, Math.PI / 2]
        : side === 1
          ? [along * width, height, -Math.PI / 2]
          : side === 2
            ? [0, along * height, 0]
            : [width, along * height, Math.PI];
    const heading = grained ? (Math.cos(inward - options.grain!) >= 0 ? options.grain! : options.grain! + Math.PI) : inward + (random() - 0.5) * 1.2;
    const width0 = (grained ? 0.6 + 1.4 * random() : 0.3 + 0.9 * random()) * (0.6 + 0.6 * amount);
    walk(x, y, heading, reach * (0.5 + 0.5 * random()), width0, 0);
  }
  return cracks;
}

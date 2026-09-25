import { mulberry32 } from '../util/rng';
import type { Chip } from './chips';
import type { Crack } from './cracks';

/**
 * Dents from blows: smooth, shallow hollows anywhere on a metal face. They are stored
 * as chips, which the metal shader draws as dents. `amount` (0–1) sets how many and
 * how deep. Sizes in mm.
 */
export function generateDents(amount: number, width: number, height: number, seed: number): Chip[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const count = 1 + Math.floor(amount * 4.99);
  return Array.from({ length: count }, () => {
    // Mostly small knocks, with the odd big one.
    const radius = Math.min((3 + 10 * random() ** 2) * (0.7 + 0.6 * amount), 0.3 * Math.min(width, height));
    return {
      x: radius + random() * (width - 2 * radius),
      y: radius + random() * (height - 2 * radius),
      radius,
      depth: (0.3 + 0.8 * random()) * (0.6 + 0.8 * amount),
      breaks: false,
      angle: random() * Math.PI,
      aspect: 1 + 0.6 * random(),
      seed: random() * 100,
    };
  });
}

/**
 * Scratches scored across a metal face: mostly straight, gently curving lines, some in
 * parallel bunches as if something rough was dragged across. They are stored as
 * cracks, which the metal shader draws as scratches. `amount` (0–1) sets how many and
 * how long. Sizes in mm.
 */
export function generateScratches(amount: number, width: number, height: number, seed: number): Crack[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const scratches: Crack[] = [];
  const groups = 1 + Math.floor(amount * 5.99);
  for (let group = 0; group < groups; group++) {
    const heading = random() * Math.PI;
    const bend = (random() - 0.5) * 0.6; // radians of turn along the whole scratch
    const length = Math.min(width, height) * (0.12 + 0.5 * random()) * (0.6 + 0.6 * amount);
    const [cx, cy] = [width * (0.1 + 0.8 * random()), height * (0.1 + 0.8 * random())];
    const lines = random() < 0.35 ? 2 + Math.floor(random() * 4) : 1;
    let offset = 0;
    for (let line = 0; line < lines; line++) {
      const across = [-Math.sin(heading), Math.cos(heading)];
      const points: [number, number][] = [];
      const steps = 8;
      let [x, y] = [cx - (Math.cos(heading) * length) / 2 + across[0] * offset, cy - (Math.sin(heading) * length) / 2 + across[1] * offset];
      for (let i = 0; i <= steps; i++) {
        points.push([x, y]);
        const direction = heading + bend * (i / steps - 0.5);
        x += (Math.cos(direction) * length) / steps;
        y += (Math.sin(direction) * length) / steps;
      }
      scratches.push({ points, startWidth: 0.12 + 0.28 * random(), endWidth: 0.05 + 0.05 * random() });
      offset += 0.5 + 1.5 * random();
    }
  }
  return scratches;
}

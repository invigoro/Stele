import { mulberry32 } from '../util/rng';

/** An elliptical hole right through the object, sizes in mm. */
export interface Hole {
  x: number;
  y: number;
  /** Half-axes: `rx` along `angle`, `ry` across it. */
  rx: number;
  ry: number;
  angle: number;
  seed: number;
}

/**
 * Holes, sizes in mm, of three kinds:
 * - worm: small round beetle holes, scattered in loose clusters (wood)
 * - nail: one near each corner, as on a board that was nailed up
 * - lacuna: ragged gaps in papyrus, stretched along its horizontal fibres
 */
export function generateHoles(
  kind: 'worm' | 'nail' | 'lacuna',
  amount: number,
  width: number,
  height: number,
  seed: number,
): Hole[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const short = Math.min(width, height);

  if (kind === 'nail') {
    const inset = short * 0.06;
    const corners: [number, number][] = [
      [inset, inset],
      [width - inset, inset],
      [inset, height - inset],
      [width - inset, height - inset],
    ];
    return corners
      .slice(0, amount < 0.5 ? 2 : 4)
      .map(([x, y]) => ({ x, y, rx: 1.6, ry: 1.6, angle: 0, seed: random() * 100 }));
  }

  if (kind === 'worm') {
    const holes: Hole[] = [];
    const clusters = 1 + Math.floor(amount * 3);
    for (let c = 0; c < clusters; c++) {
      const cx = random() * width;
      const cy = random() * height;
      const spread = short * (0.08 + 0.15 * random());
      const count = Math.round(4 + amount * 14 * random());
      for (let i = 0; i < count; i++) {
        const r = 0.5 + random() * 0.9;
        holes.push({
          x: cx + (random() - 0.5) * 2 * spread,
          y: cy + (random() - 0.5) * 2 * spread,
          rx: r,
          ry: r * (0.8 + 0.2 * random()),
          angle: random() * Math.PI,
          seed: random() * 100,
        });
      }
    }
    return holes.slice(0, 64);
  }

  const count = Math.round(1 + amount * 6);
  return Array.from({ length: count }, () => {
    const rx = short * (0.02 + 0.08 * random()) * (0.5 + amount);
    return {
      x: random() * width,
      y: random() * height,
      rx,
      ry: rx * (0.3 + 0.4 * random()),
      angle: (random() - 0.5) * 0.15,
      seed: random() * 100,
    };
  });
}

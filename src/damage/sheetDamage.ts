import { mulberry32 } from '../util/rng';

/**
 * A straight cut across the object from `a` to `b`, removing whatever lies on the far
 * side from the object's centre: a torn-off corner or edge of a sheet, or a missing
 * part of a stone fragment. The shaders make the line ragged. Sizes in mm.
 */
export interface Cut {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  seed: number;
}

/** A fold line across a sheet, sizes in mm. */
export interface Fold {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** 0–1: how worn the crease is. */
  strength: number;
  seed: number;
}

/**
 * Shapes of blot: round, as one dropped from a pen lands; squarish, to cover a word
 * marked [[like this]]; or a bar of marker drawn along the line to redact it.
 */
export type BlotShape = 'round' | 'word' | 'bar';

/** An ink blot, sizes in mm: dropped from the pen, or over a word marked [[like this]]. */
export interface Blot {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Radians. */
  angle: number;
  shape: BlotShape;
  /** 0–1: how many droplets splashed out around it, and how far. */
  spatter: number;
  seed: number;
}

/** How far a blot's droplets can reach from its centre, mm (see blotsAt in damage/blots.glsl). */
export function blotReach(blot: Blot): number {
  return Math.max(blot.rx, blot.ry) * (1.45 + 1.1 * blot.spatter);
}

/** A smear of ink dragged across the writing, sizes in mm. */
export interface Smudge {
  x: number;
  y: number;
  radius: number;
  /** Direction of the smear, radians. */
  angle: number;
  /** How far the ink was dragged, mm. */
  length: number;
  strength: number;
  seed: number;
}

/** Point on the outline of a width × height box at `t` (0–4, one unit per side, clockwise from top-left). */
function outlinePoint(t: number, width: number, height: number): [number, number] {
  const side = Math.floor(t) % 4;
  const f = t - Math.floor(t);
  if (side === 0) return [f * width, 0];
  if (side === 1) return [width, f * height];
  if (side === 2) return [(1 - f) * width, height];
  return [0, (1 - f) * height];
}

/**
 * Tears: pieces torn off a sheet, usually a corner, sometimes a strip of an edge.
 * Each is a cut between two points on the outline. `amount` (0–1) sets how many and
 * how much they take.
 */
export function generateTears(amount: number, width: number, height: number, seed: number): Cut[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const count = 1 + Math.floor(amount * 2.99);
  const tears: Cut[] = [];
  for (let i = 0; i < count; i++) {
    const bite = (0.08 + 0.22 * random()) * (0.5 + amount);
    let a: [number, number];
    let b: [number, number];
    if (random() < 0.65) {
      // A corner: cut between points on its two adjacent sides.
      const corner = Math.floor(random() * 4);
      a = outlinePoint(corner + 1 - bite * (0.5 + random()) * 0.8, width, height);
      b = outlinePoint(corner + 1 + bite * (0.5 + random()) * 0.8, width, height);
    } else {
      // A strip along one edge: a shallow cut between two points on the same side.
      const side = Math.floor(random() * 4);
      const start = side + 0.1 + 0.4 * random();
      a = outlinePoint(start, width, height);
      b = outlinePoint(start + 0.2 + 0.4 * random(), width, height);
      // Push the cut inward so it removes a strip rather than nothing.
      const inward = bite * Math.min(width, height) * 0.4;
      const [nx, ny] = side === 0 ? [0, 1] : side === 1 ? [-1, 0] : side === 2 ? [0, -1] : [1, 0];
      a = [a[0] + nx * inward * random(), a[1] + ny * inward * random()];
      b = [b[0] + nx * inward, b[1] + ny * inward];
    }
    tears.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], seed: random() * 100 });
  }
  return tears;
}

/**
 * Cuts that turn a slab into a broken fragment: one to three big breaks across the
 * corners, each taking up to about 15% of the area. Sizes in mm.
 */
export function generateFragmentCuts(width: number, height: number, seed: number): Cut[] {
  const random = mulberry32(seed);
  const count = 1 + Math.floor(random() * 2.99);
  const cuts: Cut[] = [];
  const corners = [0, 1, 2, 3].sort(() => random() - 0.5);
  for (let i = 0; i < count; i++) {
    const corner = corners[i];
    const a = outlinePoint(corner + 1 - (0.2 + 0.35 * random()), width, height);
    const b = outlinePoint(corner + 1 + (0.2 + 0.35 * random()), width, height);
    cuts.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], seed: random() * 100 });
  }
  return cuts;
}

/**
 * Folds from a letter being folded to fit an envelope: in thirds across, then perhaps
 * in half the other way. `amount` (0–1) sets how many creases and how worn they are.
 */
export function generateFolds(amount: number, width: number, height: number, seed: number): Fold[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const jitter = () => (random() - 0.5) * 0.03;
  const folds: Fold[] = [];
  const strength = 0.4 + 0.6 * amount;
  const across = (f: number) => {
    const y0 = height * (f + jitter());
    const y1 = height * (f + jitter());
    folds.push({ ax: 0, ay: y0, bx: width, by: y1, strength, seed: random() * 100 });
  };
  if (amount < 0.35) {
    across(0.5);
  } else {
    across(1 / 3);
    across(2 / 3);
  }
  if (amount >= 0.6) {
    const x0 = width * (0.5 + jitter());
    folds.push({ ax: x0, ay: 0, bx: width * (0.5 + jitter()), by: height, strength, seed: random() * 100 });
  }
  return folds;
}

/**
 * Ink blots dropped from an overloaded pen: most land on the writing (`written` holds
 * points on it), the rest anywhere in `area`, each splashing droplets around it.
 * `amount` (0–1) sets how many and how big.
 */
export function generateBlots(
  amount: number,
  area: { x: number; y: number; width: number; height: number },
  written: readonly [number, number][],
  seed: number,
): Blot[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const count = 1 + Math.floor(amount * 3.99);
  return Array.from({ length: count }, () => {
    const onWriting = written.length > 0 && random() < 0.75;
    const [x, y] = onWriting
      ? written[Math.floor(random() * written.length)]
      : [area.x + random() * area.width, area.y + random() * area.height];
    // Mostly small drops, with the odd big one.
    const radius = (1.2 + 4.8 * random() ** 2) * (0.6 + 0.8 * amount);
    const stretch = 1 + 0.3 * random();
    return {
      x,
      y,
      rx: radius * stretch,
      ry: radius / stretch,
      angle: random() * Math.PI,
      shape: 'round',
      spatter: 0.2 + 0.8 * random(),
      seed: random() * 100,
    };
  });
}

/**
 * Smudges: ink smeared by a hand or a wet thumb, placed over the writing (inside
 * `area`). `amount` (0–1) sets how many and how strong.
 */
export function generateSmudges(
  amount: number,
  area: { x: number; y: number; width: number; height: number },
  seed: number,
): Smudge[] {
  if (amount <= 0) return [];
  const random = mulberry32(seed);
  const count = 1 + Math.floor(amount * 3.99);
  return Array.from({ length: count }, () => {
    const radius = Math.min(area.width, area.height) * (0.06 + 0.1 * random());
    return {
      x: area.x + random() * area.width,
      y: area.y + random() * area.height,
      radius,
      angle: random() * Math.PI * 2,
      length: radius * (0.5 + random()),
      strength: 0.4 + 0.6 * amount,
      seed: random() * 100,
    };
  });
}

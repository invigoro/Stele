import type { Features } from '../scene';
import type { Drawing } from '../text/hand';
import type { Box, Measure } from '../text/layout';
import type { Span } from '../text/markup';
import type { Crack } from './cracks';
import { blotReach, type Cut } from './sheetDamage';

/** Areas the game master marked in the text, mm: one box per line a span covers. */
export interface Marks {
  destroy: Box[];
  protect: Box[];
}

/** How a medium obliterates a marked word. */
export type Obliteration = 'chip' | 'gouge' | 'blot' | 'hole';

/** The boxes covered by each marked span's runs, split where the span wraps onto another line. */
export function markedAreas(drawing: Drawing, spans: readonly Span[], measure: Measure): Marks {
  const marks: Marks = { destroy: [], protect: [] };
  const { size } = drawing;
  for (const span of spans) {
    let box: { x0: number; y0: number; x1: number; y1: number; line: number } | null = null;
    const flush = () => {
      if (box) marks[span.kind].push({ x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 });
      box = null;
    };
    for (const run of drawing.runs) {
      if (run.source + run.length <= span.start || run.source >= span.end) continue;
      const x1 = run.x + measure.width(run.text) * size * run.scale;
      const y0 = run.y - measure.ascent * size * run.scale;
      const y1 = run.y + measure.descent * size * run.scale;
      if (box && Math.abs(run.y - box.line) > 0.5 * size) flush();
      if (!box) {
        box = { x0: run.x, y0, x1, y1, line: run.y };
      } else {
        box.x0 = Math.min(box.x0, run.x);
        box.x1 = Math.max(box.x1, x1);
        box.y0 = Math.min(box.y0, y0);
        box.y1 = Math.max(box.y1, y1);
      }
    }
    flush();
  }
  return marks;
}

/** Distance from a point to a box, 0 inside it. */
export function distanceToBox(x: number, y: number, box: Box): number {
  const dx = Math.max(box.x - x, 0, x - (box.x + box.width));
  const dy = Math.max(box.y - y, 0, y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

/** Whether a cut (removing the side of its line away from `center`) reaches into a box. */
function cutReaches(cut: Cut, box: Box, center: [number, number], margin: number): boolean {
  const ax = cut.bx - cut.ax;
  const ay = cut.by - cut.ay;
  const length = Math.hypot(ax, ay) || 1;
  let nx = ay / length;
  let ny = -ax / length;
  if ((center[0] - cut.ax) * nx + (center[1] - cut.ay) * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const corners: [number, number][] = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ];
  return corners.some(([x, y]) => (x - cut.ax) * nx + (y - cut.ay) * ny > -margin);
}

/** Whether the infinite line through a and b passes within `margin` of a box. */
function lineNear(ax: number, ay: number, bx: number, by: number, box: Box, margin: number): boolean {
  const length = Math.hypot(bx - ax, by - ay) || 1;
  const nx = (by - ay) / length;
  const ny = -(bx - ax) / length;
  const distances = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([x, y]) => (x - ax) * nx + (y - ay) * ny);
  return Math.min(...distances) < margin && Math.max(...distances) > -margin;
}

/**
 * Drops any damage that would reach a protected box. `center` is the object's centre,
 * which tells a cut which side it removes.
 */
export function protectAreas(
  features: Features,
  cracks: Crack[],
  boxes: readonly Box[],
  center: [number, number],
): { features: Features; cracks: Crack[] } {
  if (boxes.length === 0) return { features, cracks };
  const clear = (x: number, y: number, reach: number) => boxes.every((box) => distanceToBox(x, y, box) > reach);
  return {
    features: {
      chips: features.chips.filter((c) => clear(c.x, c.y, c.radius * 1.15)),
      stains: features.stains.filter((s) => clear(s.x, s.y, s.radius * 1.4)),
      holes: features.holes.filter((h) => clear(h.x, h.y, Math.max(h.rx, h.ry) + 2)),
      burns: features.burns.filter((b) => clear(b.x, b.y, b.radius * 1.6 + 12)),
      tears: features.tears.filter((t) => boxes.every((box) => !cutReaches(t, box, center, 4))),
      folds: features.folds.filter((f) => boxes.every((box) => !lineNear(f.ax, f.ay, f.bx, f.by, box, 3))),
      smudges: features.smudges.filter((s) => clear(s.x, s.y, s.radius + s.length)),
      cuts: features.cuts.filter((c) => boxes.every((box) => !cutReaches(c, box, center, 8))),
      blots: features.blots.filter((b) => clear(b.x, b.y, blotReach(b))),
    },
    cracks: cracks.filter((crack) => crack.points.every(([x, y]) => clear(x, y, 4))),
  };
}

/**
 * Damage that guarantees each box's writing is gone: a deep spall on stone, a gouge
 * along the grain of wood, an ink blot on paper or parchment, a gap in papyrus.
 * `textSize` (mm) sets how deep carving goes, so a spall can go deeper.
 */
export function obliterate(
  boxes: readonly Box[],
  how: Obliteration,
  textSize: number,
): Pick<Features, 'chips' | 'blots' | 'holes'> {
  const result: Pick<Features, 'chips' | 'blots' | 'holes'> = { chips: [], blots: [], holes: [] };
  boxes.forEach((box, i) => {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const halfWidth = box.width / 2 + 0.15 * textSize;
    const halfHeight = box.height / 2 + 0.1 * textSize;
    const seed = 37 * i + 11;
    if (how === 'chip' || how === 'gouge') {
      // The narrowest part of a chip's outline is 0.65 of its radius, so size it to
      // still cover the box there.
      const radius = halfWidth / 0.62;
      result.chips.push({
        x,
        y,
        radius,
        depth: Math.min(12, 0.5 * textSize + 1),
        breaks: false,
        angle: 0,
        aspect: Math.max(1, Math.min(4, (0.95 * halfWidth) / halfHeight)),
        seed,
      });
    } else if (how === 'blot') {
      result.blots.push({ x, y, rx: halfWidth * 1.1 + 1.5, ry: halfHeight * 1.15 + 1.5, angle: 0, round: false, spatter: 0.5, seed });
    } else {
      // An ellipse through the corners of the box is 1.41 times its half-size.
      result.holes.push({ x, y, rx: halfWidth * 1.42 + 1.5, ry: halfHeight * 1.42 + 1.5, angle: 0, seed });
    }
  });
  return result;
}

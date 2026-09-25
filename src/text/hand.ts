import { mulberry32 } from '../util/rng';
import type { FontId } from './fonts';
import type { Box } from './layout';
import type { PictureSettings } from './picture';
import type { Measure, TextLayout } from './layout';

/**
 * How irregular the writing is. Angles are degrees; distances are fractions of the
 * font size. A stone carver's hand is steady; a pen hand wanders.
 */
export interface Hand {
  /** Jitter every letter separately. Off for joined scripts, where it breaks the joins. */
  perGlyph: boolean;
  rotation: number;
  baseline: number;
  spacing: number;
  scale: number;
  /** Random slope of each line. */
  lineSlope: number;
  /** Simulate a dip pen: ink thins over a few words, then goes dark after a re-dip. */
  dipPen: boolean;
  /** Typewriter: how much the force of each keystroke varies, 0–1. Light strikes print paler, and unevenly. */
  strike?: number;
  /**
   * Typewriter: how far some keys' typebars are out of true, as a fraction of the font
   * size. A bent key prints the same way every time it's struck.
   */
  typebars?: number;
}

/** One piece of text to draw: a single letter, or a whole word for joined scripts. */
export interface Run {
  text: string;
  /** Start of the baseline, mm. */
  x: number;
  y: number;
  /** Radians, clockwise (canvas convention). */
  rotation: number;
  scale: number;
  /** Ink density: 1 right after dipping the pen. */
  density: number;
  /** Which characters of the laid-out text this run draws (UTF-16 offset and length). */
  source: number;
  length: number;
  /** Typewriter: the key struck unevenly, printing paler toward `angle` (radians) by `amount` (0–1). */
  shade?: { angle: number; amount: number };
  /** Drawn in this typeface instead of the handout's (a signature's). */
  font?: FontId;
  /** Written by hand, even on a typed page. */
  handwritten?: boolean;
}

/** A ruled line, from (x0, y0) to (x1, y1) in mm. */
export interface Rule {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A line drawn by hand, in mm. */
export interface DrawnLine {
  points: [number, number][];
  width: number;
}

export interface Drawing {
  /**
   * Font size in mm; for lines drawn by hand or a picture without text, the size they're
   * treated as (how deep they're cut, how the ink wears).
   */
  size: number;
  runs: Run[];
  /** Lines ruled between the lines of text, made the same way as the letters. */
  rules?: Rule[];
  /** Lines drawn by hand, made the same way as the letters. */
  lines?: DrawnLine[];
  /** A picture written in place of text, and where it goes (mm). */
  picture?: PictureSettings & Box;
}

/** Whether a drawing has anything to write: letters, lines drawn by hand, or a picture. */
export function hasWriting(drawing: Drawing): boolean {
  return drawing.runs.length > 0 || (drawing.lines?.length ?? 0) > 0 || drawing.picture !== undefined;
}

const DEGREES = Math.PI / 180;

interface Word {
  text: string;
  /** Index of the word's first character within its line, in code points. */
  start: number;
}

function splitWords(line: string): Word[] {
  const words: Word[] = [];
  const chars = [...line];
  let start = -1;
  chars.forEach((char, i) => {
    if (char.trim() === '') {
      if (start >= 0) words.push({ text: chars.slice(start, i).join(''), start });
      start = -1;
    } else if (start < 0) {
      start = i;
    }
  });
  if (start >= 0) words.push({ text: chars.slice(start).join(''), start });
  return words;
}

/**
 * How one key of a typewriter prints: whether its typebar is bent, and which way. It
 * depends only on the key and the machine (`seed`), so the key misprints consistently.
 */
function typebar(char: string, seed: number): { dx: number; dy: number; turn: number } | null {
  const random = mulberry32((seed ^ Math.imul(char.codePointAt(0) ?? 0, 0x9e3779b1)) >>> 0);
  if (random() > 0.3) return null; // most keys are true
  return { dx: random() * 2 - 1, dy: random() * 2 - 1, turn: (random() * 2 - 1) * 1.5 * DEGREES };
}

/**
 * Positions every letter (or word) of a layout, with the irregularity of `hand`.
 * `machineSeed` picks a typewriter's bent keys; it stays the same across pages.
 */
export function drawText(layout: TextLayout, measure: Measure, hand: Hand, seed: number, machineSeed = seed): Drawing {
  const random = mulberry32(seed);
  const jitter = (amount: number) => (random() * 2 - 1) * amount;
  const { size, letterSpacing } = layout;
  // Offset of the character at `index` from the start of the line, with letter spacing.
  const offset = (chars: string[], index: number) =>
    (measure.width(chars.slice(0, index).join('')) + letterSpacing * index) * size;

  const runs: Run[] = [];
  let ink = 1;
  let redipAt = 0.4 + 0.2 * random();

  for (const line of layout.lines) {
    const chars = [...line.text];
    const slope = Math.tan(jitter(hand.lineSlope) * DEGREES);
    const place = (text: string, index: number, density: number) => {
      const x = line.x + offset(chars, index) + jitter(hand.spacing) * size;
      const run: Run = {
        text,
        x,
        y: line.baseline + (x - line.x) * slope + jitter(hand.baseline) * size,
        rotation: jitter(hand.rotation) * DEGREES,
        scale: 1 + jitter(hand.scale),
        density,
        source: line.start + chars.slice(0, index).join('').length,
        length: text.length,
      };
      if (hand.typebars) {
        const bent = typebar(text, machineSeed);
        if (bent) {
          run.x += bent.dx * hand.typebars * size;
          run.y += bent.dy * hand.typebars * size;
          run.rotation += bent.turn;
        }
      }
      if (hand.strike) {
        // Most keystrokes are firm; now and then one is light, and prints lopsided.
        const force = random() ** 2;
        run.density = 1 - hand.strike * force;
        run.shade = { angle: random() * 2 * Math.PI, amount: force * (0.2 + 0.3 * random()) };
      }
      runs.push(run);
    };

    for (const word of splitWords(line.text)) {
      const density = hand.dipPen ? ink : 1;
      if (hand.perGlyph) {
        [...word.text].forEach((char, i) => place(char, word.start + i, density));
      } else {
        place(word.text, word.start, density);
      }
      if (hand.dipPen) {
        ink -= (0.02 + 0.02 * random()) * [...word.text].length;
        if (ink < redipAt) {
          ink = 1;
          redipAt = 0.4 + 0.2 * random();
        }
      }
    }
  }
  return { size, runs };
}

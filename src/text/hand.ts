import { mulberry32 } from '../util/rng';
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
}

export interface Drawing {
  /** Font size in mm. */
  size: number;
  runs: Run[];
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

/** Positions every letter (or word) of a layout, with the irregularity of `hand`. */
export function drawText(layout: TextLayout, measure: Measure, hand: Hand, seed: number): Drawing {
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
      runs.push({
        text,
        x,
        y: line.baseline + (x - line.x) * slope + jitter(hand.baseline) * size,
        rotation: jitter(hand.rotation) * DEGREES,
        scale: 1 + jitter(hand.scale),
        density,
        source: line.start + chars.slice(0, index).join('').length,
        length: text.length,
      });
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

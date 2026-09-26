/** Justified lines are spread to fill the box, all but the last of each paragraph. */
export type Align = 'left' | 'center' | 'right' | 'justify';
export type VerticalAlign = 'top' | 'middle';
/**
 * How lines break: at spaces, between any two characters (for unspaced text such as
 * Roman inscriptions written HICSACERDATERTIO…), or only at explicit newlines.
 */
export type Wrap = 'word' | 'anywhere' | 'manual';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Font measurements at a font size of 1, so everything scales linearly with size. */
export interface Measure {
  width(text: string): number;
  /** Baseline to the top of capitals. */
  ascent: number;
  /** Baseline to the bottom of descenders. */
  descent: number;
  /** Height of lower-case letters, if known: how big a script looks varies a lot. */
  xHeight?: number;
}

export interface LayoutOptions {
  text: string;
  box: Box;
  align: Align;
  verticalAlign: VerticalAlign;
  wrap: Wrap;
  /** Baseline-to-baseline distance, as a multiple of the font size. */
  lineHeight: number;
  /** Extra space after every character, as a multiple of the font size. */
  letterSpacing: number;
  /** Fraction (0–1] of the largest font size that fits the box. */
  scale: number;
  /** Upper limit on the font size, so a single short word doesn't fill a whole slab. */
  maxSize: number;
  /** The text's last paragraph carries on over the page, so justifying spreads its last line too. */
  runsOn?: boolean;
}

export interface LaidOutLine {
  text: string;
  /** Where the line's text starts in the laid-out text (UTF-16 offset). */
  start: number;
  /** Left end of the line's text. */
  x: number;
  baseline: number;
  width: number;
  /**
   * A justified line's spreading, in the box's units: extra space after every
   * character, or in every gap between words (see gapShares).
   */
  letterGap?: number;
  wordGap?: number;
}

export interface TextLayout {
  size: number;
  letterSpacing: number;
  lines: LaidOutLine[];
}

/** Width of `text` at font size `size`, including letter spacing between characters. */
export function lineWidth(text: string, size: number, measure: Measure, letterSpacing: number): number {
  const count = [...text].length;
  return (measure.width(text) + letterSpacing * Math.max(0, count - 1)) * size;
}

/** Splits text into lines no wider than `maxWidth` at font size `size`. */
export function wrapLines(
  text: string,
  wrap: Wrap,
  maxWidth: number,
  size: number,
  measure: Measure,
  letterSpacing: number,
): string[] {
  const fits = (line: string) => lineWidth(line, size, measure, letterSpacing) <= maxWidth;
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    if (wrap === 'manual') {
      lines.push(paragraph);
      continue;
    }
    if (wrap === 'anywhere') {
      lines.push(...breakCharacters(paragraph.trim(), fits));
      continue;
    }
    // A dot standing between words stays with the word before it, not starting a line.
    const words: string[] = [];
    for (const word of paragraph.split(/\s+/)) {
      if (word === '·' && words.length > 0) words[words.length - 1] += ' ·';
      else if (word) words.push(word);
    }
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (fits(word)) {
        line = word;
        continue;
      }
      // A single word wider than the box: break it between characters.
      const pieces = breakCharacters(word, fits);
      lines.push(...pieces.slice(0, -1));
      line = pieces.at(-1) ?? '';
    }
    lines.push(line);
  }
  return lines;
}

/** Characters a line mustn't start with: spaces, and the dots and marks that end words. */
const NO_LINE_START = /[\s·.,;:!?…)]/u;

/**
 * Greedy line breaking between characters; every line gets at least one character.
 * A space or a dot between words stays at the end of the line before.
 */
function breakCharacters(text: string, fits: (line: string) => boolean): string[] {
  const pieces: string[] = [];
  for (const char of text) {
    if (pieces.length > 0 && NO_LINE_START.test(char)) pieces[pieces.length - 1] += char;
    else pieces.push(char);
  }
  const lines: string[] = [];
  let line = '';
  for (const piece of pieces) {
    if (line && !fits((line + piece).trimEnd())) {
      lines.push(line.trimEnd());
      line = piece;
    } else {
      line += piece;
    }
  }
  lines.push(line.trimEnd());
  return lines;
}

function blockHeight(lineCount: number, size: number, measure: Measure, lineHeight: number): number {
  return (measure.ascent + measure.descent + lineHeight * Math.max(0, lineCount - 1)) * size;
}

/** The largest font size (≤ maxSize) at which the wrapped text fits the box. */
export function fitSize(options: LayoutOptions, measure: Measure): number {
  const { text, box, wrap, lineHeight, letterSpacing, maxSize } = options;
  const fits = (size: number) => {
    const lines = wrapLines(text, wrap, box.width, size, measure, letterSpacing);
    return (
      blockHeight(lines.length, size, measure, lineHeight) <= box.height &&
      lines.every((line) => lineWidth(line, size, measure, letterSpacing) <= box.width)
    );
  };
  let low = 0;
  let high = Math.min(maxSize, box.height / (measure.ascent + measure.descent));
  if (fits(high)) return high;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}

/** Wraps, sizes and positions text inside `options.box`. Units are whatever the box uses (mm). */
export function layoutText(options: LayoutOptions, measure: Measure): TextLayout {
  const { box, align, verticalAlign, wrap, lineHeight, letterSpacing } = options;
  const text = options.text.trim() ? options.text : '';
  if (!text) return { size: 0, letterSpacing, lines: [] };

  const size = fitSize({ ...options, text }, measure) * Math.min(1, Math.max(0, options.scale));
  const texts = wrapLines(text, wrap, box.width, size, measure, letterSpacing);
  const height = blockHeight(texts.length, size, measure, lineHeight);
  const top = verticalAlign === 'top' ? box.y : box.y + (box.height - height) / 2;

  // Wrapping only drops whitespace, so each line is found, in order, in the text.
  let cursor = 0;
  const lines = texts.map((line, i): LaidOutLine => {
    const found = text.indexOf(line, cursor);
    const start = found >= 0 ? found : cursor;
    cursor = start + line.length;
    const width = lineWidth(line, size, measure, letterSpacing);
    const baseline = top + (measure.ascent + i * lineHeight) * size;
    if (align === 'justify') {
      const rest = text.slice(cursor);
      const endsParagraph = /^[ \t\r]*\n/.test(rest) || (!rest.trim() && !options.runsOn);
      const gaps = endsParagraph ? null : spread(line, box.width - width, wrap);
      return gaps ? { text: line, start, x: box.x, baseline, width: box.width, ...gaps } : { text: line, start, x: box.x, baseline, width };
    }
    const x =
      align === 'left' ? box.x : align === 'right' ? box.x + box.width - width : box.x + (box.width - width) / 2;
    return { text: line, start, x, baseline, width };
  });
  return { size, letterSpacing, lines };
}

/**
 * How to spread a line by `extra` to fill its box: in the gaps between words, or
 * between every letter where the words run together (or there's only one).
 */
function spread(line: string, extra: number, wrap: Wrap): { wordGap: number } | { letterGap: number } | null {
  if (extra <= 0) return null;
  const chars = [...line];
  const gaps = wrap === 'anywhere' ? 0 : gapShares(chars).reduce((sum, share) => sum + share, 0);
  if (gaps > 0) return { wordGap: extra / gaps };
  return chars.length > 1 ? { letterGap: extra / (chars.length - 1) } : null;
}

/**
 * Each character's share of the spreading a justified line puts between its words: a
 * gap between two words takes one share, split between the spaces either side of a
 * dot in it, so a dot between words stays in the middle and its gap grows no more
 * than any other. A dot ending the line stays by its word.
 */
export function gapShares(chars: readonly string[]): number[] {
  const shares = chars.map(() => 0);
  const inGap = (char: string | undefined) => char === ' ' || char === '·';
  for (let i = 0; i < chars.length; ) {
    if (!inGap(chars[i])) {
      i++;
      continue;
    }
    let end = i;
    while (inGap(chars[end])) end++;
    if (i > 0 && end < chars.length) {
      const spaces = chars.slice(i, end).filter((char) => char === ' ').length;
      for (let k = i; k < end; k++) if (chars[k] === ' ') shares[k] = 1 / spaces;
    }
    i = end;
  }
  return shares;
}

export type Align = 'left' | 'center' | 'right';
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
}

export interface LaidOutLine {
  text: string;
  /** Left end of the line's text. */
  x: number;
  baseline: number;
  width: number;
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
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
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

/** Greedy line breaking between characters; every line gets at least one character. */
function breakCharacters(text: string, fits: (line: string) => boolean): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    if (line && !fits(line + char)) {
      lines.push(line.trimEnd());
      line = char === ' ' ? '' : char;
    } else {
      line += char;
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

  const lines = texts.map((line, i) => {
    const width = lineWidth(line, size, measure, letterSpacing);
    const x =
      align === 'left' ? box.x : align === 'right' ? box.x + box.width - width : box.x + (box.width - width) / 2;
    return { text: line, x, baseline: top + (measure.ascent + i * lineHeight) * size, width };
  });
  return { size, letterSpacing, lines };
}

import { describe, expect, it } from 'vitest';
import { fitSize, gapShares, layoutText, lineWidth, wrapLines, type LayoutOptions, type Measure } from './layout';

// A monospaced fake font: every character is half an em wide.
const mono: Measure = { width: (text) => [...text].length * 0.5, ascent: 0.7, descent: 0.3 };

const options = (overrides: Partial<LayoutOptions> = {}): LayoutOptions => ({
  text: 'HELLO',
  box: { x: 0, y: 0, width: 100, height: 100 },
  align: 'left',
  verticalAlign: 'top',
  wrap: 'word',
  lineHeight: 1.5,
  letterSpacing: 0,
  scale: 1,
  maxSize: 1000,
  ...overrides,
});

describe('lineWidth', () => {
  it('adds letter spacing between characters only', () => {
    expect(lineWidth('ABCD', 10, mono, 0)).toBe(20);
    expect(lineWidth('ABCD', 10, mono, 0.1)).toBeCloseTo(23);
  });
});

describe('wrapLines', () => {
  it('breaks at spaces when a line gets too wide', () => {
    // At size 1 each character is 0.5 wide, so 5 characters fit in 2.5.
    expect(wrapLines('AB CD EF', 'word', 2.5, 1, mono, 0)).toEqual(['AB CD', 'EF']);
  });

  it('keeps explicit newlines and blank lines', () => {
    expect(wrapLines('A\n\nB', 'word', 100, 1, mono, 0)).toEqual(['A', '', 'B']);
  });

  it('breaks a word that is wider than the box between characters', () => {
    expect(wrapLines('ABCDEFG', 'word', 1.5, 1, mono, 0)).toEqual(['ABC', 'DEF', 'G']);
  });

  it('breaks unspaced text anywhere in "anywhere" mode', () => {
    expect(wrapLines('HICSACERDOS', 'anywhere', 2, 1, mono, 0)).toEqual(['HICS', 'ACER', 'DOS']);
  });

  it('never starts a line with the dot or space between words', () => {
    // Five characters fit: "ABC ·" does, with the space after the dot dropped.
    expect(wrapLines('ABC · DEF', 'anywhere', 2.5, 1, mono, 0)).toEqual(['ABC ·', 'DEF']);
    expect(wrapLines('ABCD · EF', 'anywhere', 2, 1, mono, 0)).toEqual(['ABC', 'D ·', 'EF']);
  });

  it('keeps a dot between words with the word before it', () => {
    expect(wrapLines('AB · CD · EF', 'word', 2.5, 1, mono, 0)).toEqual(['AB ·', 'CD ·', 'EF']);
  });

  it('only breaks at newlines in "manual" mode', () => {
    expect(wrapLines('A VERY LONG LINE\nNEXT', 'manual', 1, 1, mono, 0)).toEqual(['A VERY LONG LINE', 'NEXT']);
  });
});

describe('fitSize', () => {
  it('finds the largest size where the widest line fits', () => {
    // "HELLO" is 2.5 em wide, so the width limit of 100 allows size 40.
    expect(fitSize(options({ wrap: 'manual' }), mono)).toBeCloseTo(40, 3);
  });

  it('is limited by height when there are many lines', () => {
    // 3 lines: (0.7 + 0.3 + 1.5 * 2) = 4 em tall, so the height of 100 allows size 25.
    expect(fitSize(options({ text: 'A\nB\nC', wrap: 'manual' }), mono)).toBeCloseTo(25, 3);
  });

  it('never exceeds maxSize', () => {
    expect(fitSize(options({ text: 'A', maxSize: 12 }), mono)).toBe(12);
  });

  it('rewraps words to fit a narrow box', () => {
    const size = fitSize(options({ text: 'AAAA BBBB CCCC DDDD', box: { x: 0, y: 0, width: 40, height: 100 } }), mono);
    const lines = wrapLines('AAAA BBBB CCCC DDDD', 'word', 40, size, mono, 0);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(lineWidth(line, size, mono, 0)).toBeLessThanOrEqual(40 + 1e-9);
  });
});

describe('layoutText', () => {
  it('centres lines horizontally and the block vertically', () => {
    const layout = layoutText(options({ align: 'center', verticalAlign: 'middle', wrap: 'manual', scale: 0.5 }), mono);
    expect(layout.size).toBeCloseTo(20, 3);
    const [line] = layout.lines;
    expect(line.width).toBeCloseTo(50, 3);
    expect(line.x).toBeCloseTo(25, 3);
    // Block height is 1 em = 20; centred in 100 → top 40, baseline 40 + 0.7 * 20.
    expect(line.baseline).toBeCloseTo(54, 3);
  });

  it('right-aligns lines', () => {
    const layout = layoutText(options({ align: 'right', wrap: 'manual', scale: 0.5 }), mono);
    expect(layout.lines[0].x + layout.lines[0].width).toBeCloseTo(100, 3);
  });

  it('spaces baselines by the line height', () => {
    const layout = layoutText(options({ text: 'A\nB', wrap: 'manual', maxSize: 10 }), mono);
    expect(layout.lines[1].baseline - layout.lines[0].baseline).toBeCloseTo(15, 6);
  });

  it('records where each line starts in the text', () => {
    const text = 'AB CD EF\nGH';
    const layout = layoutText(options({ text, box: { x: 0, y: 0, width: 2.5, height: 100 }, maxSize: 1 }), mono);
    expect(layout.lines.map((line) => [line.text, line.start])).toEqual([
      ['AB CD', 0],
      ['EF', 6],
      ['GH', 9],
    ]);
    for (const line of layout.lines) expect(text.slice(line.start, line.start + line.text.length)).toBe(line.text);
  });

  it('justifies lines at the spaces between words, but not the last of a paragraph', () => {
    const box = { x: 5, y: 0, width: 3.5, height: 100 };
    // At size 1, "AB CD" is 2.5 wide; the 1 left over goes in its one space.
    const layout = layoutText(options({ text: 'AB CD EF\nGH IJ', align: 'justify', box, maxSize: 1 }), mono);
    expect(layout.lines.map((line) => [line.text, line.x, line.width, line.wordGap, line.letterGap])).toEqual([
      ['AB CD', 5, 3.5, 1, undefined],
      ['EF', 5, 1, undefined, undefined],
      ['GH IJ', 5, 2.5, undefined, undefined],
    ]);
  });

  it('gives the gap around a dot between words no more room than any other gap', () => {
    expect(gapShares([...'AB · CD EF'])).toEqual([0, 0, 0.5, 0, 0.5, 0, 0, 1, 0, 0]);
    expect(gapShares([...'AB CD ·'])).toEqual([0, 0, 1, 0, 0, 0, 0]);
    // "AB · CD EF" is 5 wide at size 1; its two gaps share the 1 left over.
    const layout = layoutText(options({ text: 'AB · CD EF XXXX', align: 'justify', box: { x: 0, y: 0, width: 6, height: 100 }, maxSize: 1 }), mono);
    expect(layout.lines[0].wordGap).toBeCloseTo(0.5, 9);
  });

  it('justifies words that run together between every letter', () => {
    const box = { x: 0, y: 0, width: 2.2, height: 100 };
    const layout = layoutText(options({ text: 'ABCDEFGH', align: 'justify', wrap: 'anywhere', box, maxSize: 1 }), mono);
    expect(layout.lines.map((line) => line.text)).toEqual(['ABCD', 'EFGH']);
    expect(layout.lines[0].letterGap).toBeCloseTo(0.2 / 3, 9);
    expect(layout.lines[1].letterGap).toBeUndefined();
    // Carried on over the page, the last line is spread too.
    const runsOn = layoutText(options({ text: 'ABCDEFGH', align: 'justify', wrap: 'anywhere', box, maxSize: 1, runsOn: true }), mono);
    expect(runsOn.lines[1].letterGap).toBeCloseTo(0.2 / 3, 9);
  });

  it('returns no lines for blank text', () => {
    expect(layoutText(options({ text: '  \n ' }), mono)).toEqual({ size: 0, letterSpacing: 0, lines: [] });
  });
});

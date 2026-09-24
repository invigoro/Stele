import { describe, expect, it } from 'vitest';
import { fitSize, layoutText, lineWidth, wrapLines, type LayoutOptions, type Measure } from './layout';

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

  it('returns no lines for blank text', () => {
    expect(layoutText(options({ text: '  \n ' }), mono)).toEqual({ size: 0, letterSpacing: 0, lines: [] });
  });
});

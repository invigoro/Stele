import { describe, expect, it } from 'vitest';
import type { Measure } from './layout';
import { linesPerPage, paginate, splitAtPageBreaks } from './pages';

// Every character is half an em wide; lines are one em apart.
const mono: Measure = { width: (text) => [...text].length * 0.5, ascent: 0.7, descent: 0.3 };

describe('splitAtPageBreaks', () => {
  it('splits at lines of dashes, keeping where each page starts', () => {
    const text = 'one\ntwo\n---\nthree\n  ----  \nfour';
    const pages = splitAtPageBreaks(text);
    expect(pages.map((page) => page.text)).toEqual(['one\ntwo', 'three', 'four']);
    for (const page of pages) expect(text.slice(page.start, page.start + page.text.length)).toBe(page.text);
  });

  it('leaves text without breaks as one page, and ignores dashes inside a line', () => {
    expect(splitAtPageBreaks('a -- b --- c')).toEqual([{ start: 0, text: 'a -- b --- c' }]);
  });
});

describe('linesPerPage', () => {
  it('counts the first line by its height and the rest by line spacing', () => {
    // First line takes 1 em, each further line 1.5 em: 1 + 1.5 × 6 = 10 em fits 7 lines.
    expect(linesPerPage(10, 1, mono, 1.5)).toBe(7);
    expect(linesPerPage(0.5, 1, mono, 1.5)).toBe(1);
  });
});

describe('paginate', () => {
  const options = {
    box: { x: 0, y: 0, width: 5, height: 4 }, // 10 characters wide; 3 lines at size 1, spacing 1.5
    align: 'left' as const,
    verticalAlign: 'top' as const,
    wrap: 'word' as const,
    lineHeight: 1.5,
    letterSpacing: 0,
    scale: 1,
    maxSize: 1,
  };
  const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';

  it('flows long text onto more pages at a fixed size', () => {
    const { pages, size } = paginate(text, 'flow', options, mono);
    expect(size).toBe(1);
    // "aaaa bbbb" per line, 3 lines per page.
    expect(pages.map((page) => page.text)).toEqual(['aaaa bbbb cccc dddd eeee ffff', 'gggg hhhh']);
    for (const page of pages) expect(text.slice(page.start, page.start + page.text.length)).toBe(page.text);
  });

  it('shrinks text onto one page in fit mode', () => {
    const { pages, size } = paginate(text, 'fit', { ...options, maxSize: 10 }, mono);
    expect(pages).toHaveLength(1);
    expect(size).toBeLessThan(1);
  });

  it('gives every explicit page the same, smallest size in fit mode', () => {
    const { pages, size } = paginate('short\n---\n' + text, 'fit', { ...options, maxSize: 10 }, mono);
    expect(pages.map((page) => page.text)).toEqual(['short', text]);
    expect(size).toBeCloseTo(paginate(text, 'fit', { ...options, maxSize: 10 }, mono).size, 6);
  });

  it('starts continuation pages without blank lines, and honours page breaks', () => {
    const { pages } = paginate('aaaa bbbb cccc dddd eeee ffff\n\ngggg\n---\nnext', 'flow', options, mono);
    expect(pages.map((page) => page.text)).toEqual(['aaaa bbbb cccc dddd eeee ffff', 'gggg', 'next']);
  });

  it('applies the size slider in flow mode', () => {
    expect(paginate(text, 'flow', { ...options, maxSize: 2, scale: 0.5 }, mono).size).toBe(1);
  });

  it('always returns at least one page', () => {
    expect(paginate('', 'flow', options, mono).pages).toHaveLength(1);
  });
});

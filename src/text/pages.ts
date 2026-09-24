import { fitSize, wrapLines, type LayoutOptions, type Measure } from './layout';

/** How text that doesn't fit is handled: shrink it onto one page, or continue onto more. */
export type PageMode = 'fit' | 'flow';

/** A page's share of the text: where it starts in the whole text, and what it says. */
export interface PageText {
  start: number;
  text: string;
}

/** A line with nothing but three or more dashes starts a new page. */
const PAGE_BREAK = /^[ \t]*-{3,}[ \t]*$/;

/** Splits text at page-break lines (which belong to no page), keeping each chunk's offset. */
export function splitAtPageBreaks(text: string): PageText[] {
  const pages: PageText[] = [];
  let start = 0;
  let offset = 0;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const end = offset + line.length;
    if (PAGE_BREAK.test(line)) {
      pages.push({ start, text: text.slice(start, Math.max(start, offset - 1)) });
      start = Math.min(text.length, end + 1);
    }
    offset = end + 1;
    if (i === lines.length - 1) pages.push({ start, text: text.slice(start) });
  });
  return pages;
}

/** How many lines of text fit in a box at a font size. */
export function linesPerPage(boxHeight: number, size: number, measure: Measure, lineHeight: number): number {
  const firstLine = (measure.ascent + measure.descent) * size;
  return Math.max(1, Math.floor((boxHeight - firstLine) / (lineHeight * size) + 1e-9) + 1);
}

/**
 * Splits text into pages and chooses the font size.
 * - `fit`: each explicit page is shrunk to fit; all pages share the smallest size.
 * - `flow`: the text keeps `maxSize` (already scaled by the Size slider) and runs on to
 *   as many pages as it needs, so long letters stay legible.
 */
export function paginate(
  text: string,
  mode: PageMode,
  options: Omit<LayoutOptions, 'text' | 'scale'> & { scale: number },
  measure: Measure,
): { pages: PageText[]; size: number } {
  const chunks = splitAtPageBreaks(text);
  const { box, wrap, lineHeight, letterSpacing } = options;

  if (mode === 'fit') {
    const sizes = chunks
      .filter((chunk) => chunk.text.trim())
      .map((chunk) => fitSize({ ...options, text: chunk.text }, measure));
    const size = (sizes.length ? Math.min(...sizes) : options.maxSize) * Math.min(1, Math.max(0, options.scale));
    return { pages: chunks, size };
  }

  const size = options.maxSize * Math.min(1, Math.max(0, options.scale));
  const perPage = linesPerPage(box.height, size, measure, lineHeight);
  const pages: PageText[] = [];
  for (const chunk of chunks) {
    const lines = wrapLines(chunk.text, wrap, box.width, size, measure, letterSpacing);
    // Where each wrapped line starts in the chunk: wrapping only drops whitespace, so each
    // line can be found, in order.
    const starts: number[] = [];
    let cursor = 0;
    for (const line of lines) {
      const found = line ? chunk.text.indexOf(line, cursor) : cursor;
      const at = found >= 0 ? found : cursor;
      starts.push(at);
      cursor = at + line.length;
    }
    const before = pages.length;
    let first = 0;
    while (first < lines.length) {
      // A continuation page doesn't start with blank lines.
      if (first > 0) while (first < lines.length && !lines[first].trim()) first++;
      if (first >= lines.length) break;
      const last = Math.min(lines.length, first + perPage) - 1;
      const from = starts[first];
      const to = starts[last] + lines[last].length;
      pages.push({ start: chunk.start + from, text: chunk.text.slice(from, to) });
      first = last + 1;
    }
    if (pages.length === before) pages.push({ start: chunk.start, text: '' });
  }
  return { pages: pages.length ? pages : [{ start: 0, text: '' }], size };
}

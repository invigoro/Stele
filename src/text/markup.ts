/**
 * A span of text the game master marked: `[[…]]` must be destroyed by damage,
 * `{{…}}` must be kept clear of it. Indices are UTF-16 offsets into the plain text.
 */
export interface Span {
  start: number;
  end: number;
  kind: 'destroy' | 'protect';
}

/** Collapses runs of spaces and tabs to one space and trims each line. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n');
}

const MARKERS = [
  { open: '[[', close: ']]', kind: 'destroy' },
  { open: '{{', close: '}}', kind: 'protect' },
] as const;

/**
 * Strips damage markup from text, returning the plain text and where the marked spans
 * are in it. Markers without a partner, and empty spans, are left as ordinary text.
 */
export function parseMarkup(text: string): { text: string; spans: Span[] } {
  let plain = '';
  const spans: Span[] = [];
  let i = 0;
  while (i < text.length) {
    const marker = MARKERS.find((m) => text.startsWith(m.open, i));
    const close = marker ? text.indexOf(marker.close, i + marker.open.length) : -1;
    if (marker && close > i + marker.open.length) {
      const inner = text.slice(i + marker.open.length, close);
      if (!inner.includes('\n')) {
        spans.push({ start: plain.length, end: plain.length + inner.length, kind: marker.kind });
        plain += inner;
        i = close + marker.close.length;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  return { text: plain, spans };
}

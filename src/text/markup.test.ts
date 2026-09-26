import { describe, expect, it } from 'vitest';
import { normalizeText, parseMarkup } from './markup';

describe('normalizeText', () => {
  it('collapses spaces and tabs and trims lines, keeping line breaks', () => {
    expect(normalizeText('  THE   KEY\t LIES \r\n\n  BENEATH  ')).toBe('THE KEY LIES\n\nBENEATH');
  });
});

describe('parseMarkup', () => {
  it('strips the markers and records the spans', () => {
    const { text, spans } = parseMarkup('THE KEY LIES BENEATH THE [[ALTAR]], {{SAFE}}');
    expect(text).toBe('THE KEY LIES BENEATH THE ALTAR, SAFE');
    expect(spans).toEqual([
      { start: 25, end: 30, kind: 'destroy' },
      { start: 32, end: 36, kind: 'protect' },
    ]);
    expect(text.slice(25, 30)).toBe('ALTAR');
  });

  it('leaves unmatched or empty markers as text', () => {
    expect(parseMarkup('a [[b and {{}} c]').text).toBe('a [[b and {{}} c]');
    expect(parseMarkup('a [[b and {{}} c]').spans).toEqual([]);
  });

  it('does not let a span cross a line break', () => {
    expect(parseMarkup('[[one\ntwo]]').spans).toEqual([]);
  });
});

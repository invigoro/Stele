/**
 * What goes between words: a space, a raised dot (the interpunct Roman carvers cut), or
 * nothing at all, as in many inscriptions, where the reader found the words for
 * themselves.
 */
export type WordDivision = 'spaces' | 'dots' | 'none';

export function isWordDivision(value: unknown): value is WordDivision {
  return value === 'spaces' || value === 'dots' || value === 'none';
}

/** How text is lettered, the way a Roman inscription might be. */
export interface Lettering {
  /** Classical Roman letters: capitals only, V for U and I for J (Latin had neither U nor J). */
  roman: boolean;
  words: WordDivision;
  /** A dot between sentences, in place of their full stops, question and exclamation marks. */
  stops: boolean;
}

/** The dot between words, or sentences. */
const DIVIDER = ' · ';

/**
 * A word that ends a sentence: what comes before its full stop (or ?, ! or …), and any
 * closing quotes, brackets or damage markup after it.
 */
const SENTENCE_END = /^(.*?)[.!?…]+(["'”’)\]}]*)$/u;

/**
 * Letters text as `lettering` asks, line by line. Line breaks and damage markup brackets
 * are left alone, and so are dots already typed between words. With spaces between
 * words and no dots for sentences, only the letters change.
 */
export function letter(text: string, { roman, words, stops }: Lettering): string {
  return text
    .split('\n')
    .map((line) => {
      const letters = roman ? line.toLocaleUpperCase('en').replace(/U/g, 'V').replace(/J/g, 'I') : line;
      if (words === 'spaces' && !stops) return letters;
      // Each word, and whether a dot follows it: one typed, or for the end of a sentence.
      const out: { word: string; dot: boolean }[] = [];
      for (const token of letters.trim().split(/\s+/)) {
        if (token === '·') {
          if (out.length > 0) out[out.length - 1].dot = true;
          continue;
        }
        const end = stops ? SENTENCE_END.exec(token) : null;
        const word = end ? end[1] + end[2] : token;
        if (word) out.push({ word, dot: false });
        if (end && out.length > 0) out[out.length - 1].dot = true;
      }
      // Nothing is put after a line's last word: the line break parts it from the next.
      const between = words === 'dots' ? DIVIDER : words === 'spaces' ? ' ' : '';
      return out.map(({ word, dot }, i) => (i === out.length - 1 ? word : word + (dot ? DIVIDER : between))).join('');
    })
    .join('\n');
}

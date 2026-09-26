import { describe, expect, it } from 'vitest';
import { letter, type Lettering } from './roman';

const plain: Lettering = { roman: false, words: 'spaces', stops: false };
const roman: Lettering = { roman: true, words: 'dots', stops: false };

describe('letter', () => {
  it('leaves text exactly as typed by default', () => {
    const text = '  Julius  lived,\nhere. ';
    expect(letter(text, plain)).toBe(text);
  });

  it('uses capitals, V for U and I for J, and dots between words, as Roman letters did', () => {
    expect(letter('Julius lived\nhere', roman)).toBe('IVLIVS · LIVED\nHERE');
    expect(letter('Julius lived', { ...plain, roman: true })).toBe('IVLIVS LIVED');
  });

  it('does not double up dots already typed', () => {
    expect(letter('H · S · E', roman)).toBe('H · S · E');
    expect(letter('ALES · WINES', plain)).toBe('ALES · WINES');
  });

  it('runs the words together, keeping dots already typed', () => {
    expect(letter('Hic sacerdos\nH · S · E', { roman: true, words: 'none', stops: false })).toBe('HICSACERDOS\nH · S · E');
  });

  it('puts a dot between sentences in place of their full stops', () => {
    const text = 'Here lies Gaius. He lived thirty years! Who knows?';
    expect(letter(text, { roman: true, words: 'none', stops: true })).toBe('HERELIESGAIVS · HELIVEDTHIRTYYEARS · WHOKNOWS');
    expect(letter(text, { roman: false, words: 'spaces', stops: true })).toBe('Here lies Gaius · He lived thirty years · Who knows');
  });

  it('keeps damage markup around a sentence’s end, and the dot outside it', () => {
    expect(letter('Pay [[the mill.]] Then go', { roman: true, words: 'none', stops: true })).toBe('PAY[[THEMILL]] · THENGO');
  });

  it('keeps full stops in the middle of a word, and a page break', () => {
    expect(letter('Aged 3.5 years.\n---\nNext', { roman: false, words: 'none', stops: true })).toBe('Aged3.5years\n---\nNext');
  });

  it('leaves a sentence mark standing alone as a dot', () => {
    expect(letter('Gone ... away', { roman: false, words: 'none', stops: true })).toBe('Gone · away');
  });
});

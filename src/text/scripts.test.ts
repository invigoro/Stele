import { describe, expect, it } from 'vitest';
import { cuneiformNumber, phonemes, SIGNS, syllables, transliterate } from './scripts';

describe('runes', () => {
  it('writes each letter as its rune, with runes for th and ng', () => {
    expect(transliterate('Here lies the road', 'elder-futhark')).toBe('ᚺᛖᚱᛖ ᛚᛁᛖᛊ ᚦᛖ ᚱᛟᚨᛞ');
    expect(transliterate('thing', 'elder-futhark')).toBe('ᚦᛁᛜ');
  });

  it('writes a doubled letter once in the older alphabets, as the carvers did', () => {
    expect(transliterate('deep halls', 'elder-futhark')).toBe('ᛞᛖᛈ ᚺᚨᛚᛊ');
    expect(transliterate('deep', 'futhorc')).toBe('ᛞᛖᛖᛈ');
  });

  it('gives each alphabet its own runes', () => {
    // The Younger Futhark has one rune for g and k, and one for d and t.
    expect(transliterate('king god', 'younger-futhark')).toBe('ᚴᛁᚾᚴ ᚴᚬᛏ');
    // The Anglo-Saxon runes have their own for st and ea.
    expect(transliterate('stone east', 'futhorc')).toBe('ᛥᚩᚾᛖ ᛠᛥ');
  });

  it('writes y before a vowel as a consonant', () => {
    expect(transliterate('yes day', 'elder-futhark')).toBe('ᛃᛖᛊ ᛞᚨᛁ');
  });

  it('leaves markup, line and page breaks alone, and turns punctuation into dividers', () => {
    expect(transliterate("[[Road]] {{home}}\n---\nThe end, at last.", 'elder-futhark')).toBe(
      '[[ᚱᛟᚨᛞ]] {{ᚺᛟᛗᛖ}}\n---\nᚦᛖ ᛖᚾᛞ᛫ ᚨᛏ ᛚᚨᛊᛏ᛬',
    );
  });

  it('divides hyphenated words with a dot, and leaves page breaks alone', () => {
    expect(transliterate('Ea-nasir\n---\nend', 'elder-futhark')).toBe('ᛖᚨ᛫ᚾᚨᛊᛁᚱ\n---\nᛖᚾᛞ');
    expect(transliterate('Ea-nasir', 'cuneiform')).toBe(transliterate('Ea nasir', 'cuneiform'));
  });

  it('drops accents and apostrophes', () => {
    expect(transliterate('Café’s', 'elder-futhark')).toBe(transliterate('Cafes', 'elder-futhark'));
  });

  it('leaves Latin text as typed', () => {
    expect(transliterate('Here lies [[Bob]].', 'latin')).toBe('Here lies [[Bob]].');
  });
});

describe('cuneiform', () => {
  it('spells words out in the sounds Akkadian writes', () => {
    expect(phonemes('stone')).toBe('stun'); // silent e, o as u
    expect(phonemes('copper')).toBe('kuper'); // c as k, doubles said once
    expect(phonemes('shield')).toBe('šild');
    expect(phonemes('the')).toBe('te');
  });

  it('splits sounds into syllables that signs can write', () => {
    expect(syllables(phonemes('tablet'))).toEqual(['ta', 'ab', 'le', 'et']);
    expect(syllables(phonemes('ingots'))).toEqual(['in', 'gu', 'ut', 'us']);
    // A word-initial cluster borrows the next vowel.
    expect(syllables('strit')).toEqual(['si', 'ti', 'ri', 'it']);
  });

  it('has a sign for every syllable the splitter can make', () => {
    for (const consonant of 'bdghklmnpqrsštwyz') {
      for (const vowel of 'aeiu') {
        expect(SIGNS[consonant + vowel], consonant + vowel).toBeTruthy();
        expect(SIGNS[vowel + consonant], vowel + consonant).toBeTruthy();
      }
    }
  });

  it('writes words as signs and keeps markup and spaces', () => {
    expect(transliterate('tablet', 'cuneiform')).toBe('𒋫𒀊𒇷𒀉'); // TA AB LI ID
    expect(transliterate('Pay [[Nanni]].', 'cuneiform')).toMatch(/^[\u{12000}-\u{1254F}]+ \[\[[\u{12000}-\u{1254F}]+\]\]$/u);
  });

  it('counts in sixties, a sign for each ten and each unit', () => {
    expect(cuneiformNumber(42)).toBe('𒐏𒈫'); // 40 + 2
    expect(cuneiformNumber(1204)).toBe('𒎙 𒐉'); // 20 sixties and 4
    expect(transliterate('30 ingots', 'cuneiform').startsWith('𒌍 ')).toBe(true);
  });
});

import type { FontId } from './fonts';

/**
 * Writing systems the text can be shown in. The text is always typed in English (or
 * any Latin letters) and converted word by word as the handout is drawn.
 */
export type ScriptId = 'latin' | 'elder-futhark' | 'younger-futhark' | 'futhorc' | 'cuneiform';

export interface ScriptDef {
  label: string;
  /** The typeface with the script's letters; choosing the script switches to it. */
  font?: FontId;
}

export const SCRIPTS: Record<ScriptId, ScriptDef> = {
  latin: { label: 'Latin letters, as typed' },
  'elder-futhark': { label: 'Runes · Elder Futhark', font: 'noto-sans-runic' },
  'younger-futhark': { label: 'Runes · Younger Futhark (Viking)', font: 'noto-sans-runic' },
  futhorc: { label: 'Runes · Anglo-Saxon Futhorc', font: 'noto-sans-runic' },
  cuneiform: { label: 'Cuneiform (Akkadian syllables)', font: 'noto-sans-cuneiform' },
};

export function isScriptId(value: unknown): value is ScriptId {
  return typeof value === 'string' && value in SCRIPTS;
}

/**
 * Converts text into a script. Only letters and digits change: spaces, line breaks,
 * page breaks (---) and damage markup ([[…]], {{…}}) are left as they are.
 */
export function transliterate(text: string, script: ScriptId): string {
  if (script === 'latin') return text;
  // Accents come off (é → e), and apostrophes and quotation marks go.
  const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’‘"“”]/g, '');
  return script === 'cuneiform' ? toCuneiform(plain) : toRunes(plain, RUNES[script]);
}

// Runes. Each alphabet maps letters and a few letter pairs to runes; "Y" is y as a
// consonant (before a vowel), where the alphabet has a rune for that.

interface RuneTable {
  letters: Record<string, string>;
  /** Write a doubled rune once, as early rune-carvers did. */
  single: boolean;
}

const RUNES: Record<Exclude<ScriptId, 'latin' | 'cuneiform'>, RuneTable> = {
  'elder-futhark': {
    letters: {
      a: 'ᚨ', b: 'ᛒ', c: 'ᚲ', d: 'ᛞ', e: 'ᛖ', f: 'ᚠ', g: 'ᚷ', h: 'ᚺ', i: 'ᛁ', j: 'ᛃ', k: 'ᚲ', l: 'ᛚ', m: 'ᛗ',
      n: 'ᚾ', o: 'ᛟ', p: 'ᛈ', q: 'ᚲ', r: 'ᚱ', s: 'ᛊ', t: 'ᛏ', u: 'ᚢ', v: 'ᚹ', w: 'ᚹ', x: 'ᚲᛊ', y: 'ᛁ', Y: 'ᛃ', z: 'ᛉ',
      th: 'ᚦ', ng: 'ᛜ', ck: 'ᚲ', ph: 'ᚠ', qu: 'ᚲᚹ',
    },
    single: true,
  },
  'younger-futhark': {
    // Sixteen runes: one each for b and p, d and t, g and k, and the vowels shared out.
    letters: {
      a: 'ᛅ', b: 'ᛒ', c: 'ᚴ', d: 'ᛏ', e: 'ᛁ', f: 'ᚠ', g: 'ᚴ', h: 'ᚼ', i: 'ᛁ', j: 'ᛁ', k: 'ᚴ', l: 'ᛚ', m: 'ᛘ',
      n: 'ᚾ', o: 'ᚬ', p: 'ᛒ', q: 'ᚴ', r: 'ᚱ', s: 'ᛋ', t: 'ᛏ', u: 'ᚢ', v: 'ᚢ', w: 'ᚢ', x: 'ᚴᛋ', y: 'ᛦ', Y: 'ᛁ', z: 'ᛋ',
      th: 'ᚦ', ng: 'ᚾᚴ', ck: 'ᚴ', ph: 'ᚠ', qu: 'ᚴᚢ',
    },
    single: true,
  },
  futhorc: {
    // The Anglo-Saxon runes, with their own for æ, ea, ng and st.
    letters: {
      a: 'ᚪ', b: 'ᛒ', c: 'ᚳ', d: 'ᛞ', e: 'ᛖ', f: 'ᚠ', g: 'ᚷ', h: 'ᚻ', i: 'ᛁ', j: 'ᛄ', k: 'ᛣ', l: 'ᛚ', m: 'ᛗ',
      n: 'ᚾ', o: 'ᚩ', p: 'ᛈ', q: 'ᚳ', r: 'ᚱ', s: 'ᛋ', t: 'ᛏ', u: 'ᚢ', v: 'ᚠ', w: 'ᚹ', x: 'ᛉ', y: 'ᚣ', z: 'ᛋ',
      th: 'ᚦ', ng: 'ᛝ', ea: 'ᛠ', st: 'ᛥ', ae: 'ᚫ', ck: 'ᛣ', ph: 'ᚠ', qu: 'ᚳᚹ',
    },
    single: false,
  },
};

/** Runic word dividers: one dot for a pause, two for the end of a sentence. */
const PAUSE = '᛫';
const STOP = '᛬';

/** A hyphen inside a word (Ea-nasir), as opposed to a page break's dashes. */
const JOINING_HYPHEN = /(?<=[A-Za-z])-(?=[A-Za-z])/g;

function toRunes(text: string, table: RuneTable): string {
  return text
    .replace(JOINING_HYPHEN, PAUSE)
    .replace(/[A-Za-z]+/g, (word) => runeWord(word.toLowerCase(), table))
    .replace(/[,;:]/g, PAUSE)
    .replace(/[.!?]/g, STOP);
}

function runeWord(word: string, { letters, single }: RuneTable): string {
  const runes: string[] = [];
  for (let i = 0; i < word.length; ) {
    const pair = letters[word.slice(i, i + 2)];
    if (i + 1 < word.length && pair) {
      runes.push(pair);
      i += 2;
      continue;
    }
    const consonantY = word[i] === 'y' && /[aeiou]/.test(word[i + 1] ?? '') && letters.Y;
    runes.push(consonantY || letters[word[i]] || word[i]);
    i += 1;
  }
  return (single ? runes.filter((rune, i) => rune !== runes[i - 1]) : runes).join('');
}

// Cuneiform. English is spelled out in the syllables of Akkadian, the way a Babylonian
// scribe would write a foreign name: consonant-vowel signs, closing a syllable with a
// vowel-consonant sign (tablet → ta-ab-le-et). The signs keep their real values, so a
// player with a sign list can read the handout back.

/** Syllable signs (Old Babylonian values), keyed by their sound. */
export const SIGNS: Readonly<Record<string, string>> = {
  a: '𒀀', e: '𒂊', i: '𒄿', u: '𒌋', // A E I U
  ba: '𒁀', be: '𒁁', bi: '𒁉', bu: '𒁍', // BA BE BI BU
  da: '𒁕', de: '𒁲', di: '𒁲', du: '𒁺', // DA DI DI DU
  ga: '𒂵', ge: '𒄀', gi: '𒄀', gu: '𒄖', // GA GI GI GU
  ha: '𒄩', he: '𒄭', hi: '𒄭', hu: '𒄷', // ḪA ḪI ḪI ḪU
  ka: '𒅗', ke: '𒆠', ki: '𒆠', ku: '𒆪', // KA KI KI KU
  la: '𒆷', le: '𒇷', li: '𒇷', lu: '𒇻', // LA LI LI LU
  ma: '𒈠', me: '𒈨', mi: '𒈪', mu: '𒈬', // MA ME MI MU
  na: '𒈾', ne: '𒉈', ni: '𒉌', nu: '𒉡', // NA NE NI NU
  pa: '𒉺', pe: '𒉿', pi: '𒉿', pu: '𒁍', // PA PI PI BU
  qa: '𒋡', qe: '𒆠', qi: '𒆠', qu: '𒆪', // QA KI KI KU
  ra: '𒊏', re: '𒊑', ri: '𒊑', ru: '𒊒', // RA RI RI RU
  sa: '𒊓', se: '𒋛', si: '𒋛', su: '𒋢', // SA SI SI SU
  ša: '𒊭', še: '𒊺', ši: '𒅆', šu: '𒋗', // ŠA ŠE ŠI ŠU
  ta: '𒋫', te: '𒋼', ti: '𒋾', tu: '𒌅', // TA TE TI TU
  wa: '𒉿', we: '𒉿', wi: '𒉿', wu: '𒉿', // PI (read wa)
  ya: '𒅀', ye: '𒅀', yi: '𒅀', yu: '𒅀', // IA
  za: '𒍝', ze: '𒍣', zi: '𒍣', zu: '𒍪', // ZA ZI ZI ZU
  // Closing signs serve voiced and voiceless alike (ab, ap).
  ab: '𒀊', ap: '𒀊', ad: '𒀜', at: '𒀜', ag: '𒀝', ak: '𒀝', aq: '𒀝', ah: '𒄴', // AB AD AG AḪ
  al: '𒀠', am: '𒄠', an: '𒀭', ar: '𒅈', as: '𒊍', az: '𒊍', aš: '𒀸', // AL AM AN AR AZ AŠ
  eb: '𒅁', ep: '𒅁', ed: '𒀉', et: '𒀉', eg: '𒅅', ek: '𒅅', eq: '𒅅', eh: '𒄴', // IB ID IG AḪ
  el: '𒂖', em: '𒅎', en: '𒂗', er: '𒅕', es: '𒄑', ez: '𒄑', eš: '𒅖', // EL IM EN IR IZ IŠ
  ib: '𒅁', ip: '𒅁', id: '𒀉', it: '𒀉', ig: '𒅅', ik: '𒅅', iq: '𒅅', ih: '𒄴', // IB ID IG AḪ
  il: '𒅋', im: '𒅎', in: '𒅔', ir: '𒅕', is: '𒄑', iz: '𒄑', iš: '𒅖', // IL IM IN IR IZ IŠ
  ub: '𒌒', up: '𒌒', ud: '𒌓', ut: '𒌓', ug: '𒊌', uk: '𒊌', uq: '𒊌', uh: '𒄴', // UB UD UG AḪ
  ul: '𒌌', um: '𒌝', un: '𒌦', ur: '𒌨', us: '𒍚', uz: '𒍚', uš: '𒍑', // UL UM UN UR UZ UŠ
  // No sign closes a syllable with w or y: the vowel alone.
  aw: '𒀀', ay: '𒀀', ew: '𒂊', ey: '𒂊', iw: '𒄿', iy: '𒄿', uw: '𒌋', uy: '𒌋',
};

/** Babylonian numerals, counted in sixties: a sign for each ten and each unit. */
const ONES = ['', '𒁹', '𒈫', '𒐈', '𒐉', '𒐊', '𒐋', '𒐌', '𒐍', '𒐎'];
const TENS = ['', '𒌋', '𒎙', '𒌍', '𒐏', '𒐐'];

function toCuneiform(text: string): string {
  return text
    .replace(JOINING_HYPHEN, ' ')
    .replace(/\d+/g, (digits) => cuneiformNumber(Number(digits)))
    .replace(/[A-Za-z]+/g, (word) => syllables(phonemes(word)).map((syllable) => SIGNS[syllable] ?? '').join(''))
    .replace(/[.,;:!?]/g, ''); // the script has no punctuation
}

/** A number in sexagesimal places, each written as tens and units; there's no zero. */
export function cuneiformNumber(n: number): string {
  const places: number[] = [];
  for (let m = Math.floor(n); m > 0; m = Math.floor(m / 60)) places.unshift(m % 60);
  return places.map((place) => TENS[Math.floor(place / 10)] + ONES[place % 10]).join(' ');
}

/**
 * A rough spelling of an English word in the sounds Akkadian writes: the consonants
 * b d g h k l m n p q r s š t w y z and the vowels a e i u.
 */
export function phonemes(word: string): string {
  let w = word.toLowerCase().replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/^ps/, 's');
  w = w.replace(/gh/g, '').replace(/ph/g, 'p').replace(/sh|ch/g, 'š').replace(/th/g, 't');
  w = w.replace(/ck/g, 'k').replace(/qu/g, 'kw').replace(/x/g, 'ks').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k');
  // A silent e ending a longer word (fine, stone) isn't spoken.
  if (/[^aeiou]e$/.test(w) && /[aeiouy]/.test(w.slice(0, -2))) w = w.slice(0, -1);
  w = w.replace(/f/g, 'p').replace(/v/g, 'w').replace(/j/g, 'y').replace(/o/g, 'u');
  // y and w are vowels unless a vowel follows them.
  w = w.replace(/y(?![aeiu])/g, 'i').replace(/w(?![aeiu])/g, 'u');
  // Doubled letters are said once, and vowels running together make one sound.
  return w.replace(/([a-zš])\1+/g, '$1').replace(/([aeiu])[aeiu]+/g, '$1');
}

/**
 * Splits a phonetic spelling into syllables a sign can write: consonant-vowel, vowel,
 * or vowel-consonant. A consonant with no vowel of its own closes the syllable before
 * it (ta-ab), or, at the start of a word, borrows the word's next vowel (si-ti-ri-it).
 */
export function syllables(sounds: string): string[] {
  const vowel = (c: string | undefined) => c !== undefined && 'aeiu'.includes(c);
  const out: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < sounds.length; ) {
    const [c, next, after] = [sounds[i], sounds[i + 1], sounds[i + 2]];
    if (vowel(c)) {
      last = c;
      if (next !== undefined && !vowel(next) && !vowel(after)) {
        out.push(c + next);
        i += 2;
      } else {
        out.push(c);
        i += 1;
      }
    } else if (vowel(next)) {
      out.push(c + next);
      last = next;
      i += 2;
    } else {
      const borrowed = last ?? sounds.slice(i).match(/[aeiu]/)?.[0] ?? 'u';
      out.push(last ? borrowed + c : c + borrowed);
      i += 1;
    }
  }
  return out;
}

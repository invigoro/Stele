import cedarvilleLatin from '@fontsource/cedarville-cursive/files/cedarville-cursive-latin-400-normal.woff2?url';
import cinzelLatin from '@fontsource/cinzel/files/cinzel-latin-500-normal.woff2?url';
import cinzelLatinExt from '@fontsource/cinzel/files/cinzel-latin-ext-500-normal.woff2?url';
import homemadeAppleLatin from '@fontsource/homemade-apple/files/homemade-apple-latin-400-normal.woff2?url';
import imFellLatin from '@fontsource/im-fell-english/files/im-fell-english-latin-400-normal.woff2?url';
import marcellusLatin from '@fontsource/marcellus/files/marcellus-latin-400-normal.woff2?url';
import marcellusLatinExt from '@fontsource/marcellus/files/marcellus-latin-ext-400-normal.woff2?url';
import pinyonLatin from '@fontsource/pinyon-script/files/pinyon-script-latin-400-normal.woff2?url';
import pinyonLatinExt from '@fontsource/pinyon-script/files/pinyon-script-latin-ext-400-normal.woff2?url';
import type { Measure } from './layout';

// Unicode ranges of Fontsource's "latin" and "latin-ext" subsets.
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

export interface FontDef {
  label: string;
  /** Registered under a name of our own so a locally installed copy can't interfere. */
  family: string;
  weight: string;
  files: { url: string; unicodeRange: string }[];
  /** Joined-up script: jitter whole words, since moving single letters breaks the joins. */
  connected: boolean;
  /** Extra space after each letter, as a multiple of the font size. */
  letterSpacing: number;
  /** Baseline-to-baseline distance, as a multiple of the font size. */
  lineHeight: number;
}

export const FONTS = {
  cinzel: {
    label: 'Cinzel · Roman capitals',
    family: 'Stele Cinzel',
    weight: '500',
    files: [
      { url: cinzelLatin, unicodeRange: LATIN },
      { url: cinzelLatinExt, unicodeRange: LATIN_EXT },
    ],
    connected: false,
    letterSpacing: 0.06,
    lineHeight: 1.45,
  },
  marcellus: {
    label: 'Marcellus · flared capitals',
    family: 'Stele Marcellus',
    weight: '400',
    files: [
      { url: marcellusLatin, unicodeRange: LATIN },
      { url: marcellusLatinExt, unicodeRange: LATIN_EXT },
    ],
    connected: false,
    letterSpacing: 0.04,
    lineHeight: 1.4,
  },
  'im-fell-english': {
    label: 'IM Fell English · early print',
    family: 'Stele IM Fell English',
    weight: '400',
    files: [{ url: imFellLatin, unicodeRange: LATIN }],
    connected: false,
    letterSpacing: 0,
    lineHeight: 1.35,
  },
  'pinyon-script': {
    label: 'Pinyon Script · formal copperplate',
    family: 'Stele Pinyon Script',
    weight: '400',
    files: [
      { url: pinyonLatin, unicodeRange: LATIN },
      { url: pinyonLatinExt, unicodeRange: LATIN_EXT },
    ],
    connected: true,
    letterSpacing: 0,
    lineHeight: 1.5,
  },
  'homemade-apple': {
    label: 'Homemade Apple · hurried hand',
    family: 'Stele Homemade Apple',
    weight: '400',
    files: [{ url: homemadeAppleLatin, unicodeRange: LATIN }],
    connected: true,
    letterSpacing: 0,
    lineHeight: 1.7,
  },
  'cedarville-cursive': {
    label: 'Cedarville Cursive · neat hand',
    family: 'Stele Cedarville Cursive',
    weight: '400',
    files: [{ url: cedarvilleLatin, unicodeRange: LATIN }],
    connected: true,
    letterSpacing: 0,
    lineHeight: 1.55,
  },
} satisfies Record<string, FontDef>;

export type FontId = keyof typeof FONTS;

export function isFontId(value: string): value is FontId {
  return value in FONTS;
}

const loading = new Map<string, Promise<void>>();

/** Downloads and registers a font (once); canvas text needs the font loaded first. */
export function loadFont(font: FontDef): Promise<void> {
  let promise = loading.get(font.family);
  if (!promise) {
    promise = Promise.all(
      font.files.map(async ({ url, unicodeRange }) => {
        const face = new FontFace(font.family, `url(${url}) format('woff2')`, {
          weight: font.weight,
          unicodeRange,
        });
        document.fonts.add(await face.load());
      }),
    ).then(() => undefined);
    promise.catch(() => loading.delete(font.family)); // allow a retry after a network error
    loading.set(font.family, promise);
  }
  return promise;
}

export function cssFont(font: FontDef, sizePx: number): string {
  return `${font.weight} ${sizePx}px "${font.family}"`;
}

let measuringContext: CanvasRenderingContext2D | null = null;
const measures = new Map<string, Measure>();

/** Measures a loaded font with canvas text metrics (cached per font). */
export function measureFont(font: FontDef): Measure {
  let measure = measures.get(font.family);
  if (!measure) {
    measuringContext ??= document.createElement('canvas').getContext('2d');
    const ctx = measuringContext;
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    const reference = 100; // px; widths are divided back down to a font size of 1
    ctx.font = cssFont(font, reference);
    const sample = ctx.measureText('HÉlbdkfgjpqy');
    const widths = new Map<string, number>();
    measure = {
      ascent: sample.actualBoundingBoxAscent / reference,
      descent: sample.actualBoundingBoxDescent / reference,
      width(text: string) {
        let width = widths.get(text);
        if (width === undefined) {
          ctx.font = cssFont(font, reference);
          width = ctx.measureText(text).width / reference;
          widths.set(text, width);
        }
        return width;
      },
    };
    measures.set(font.family, measure);
  }
  return measure;
}

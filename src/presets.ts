import { defaultSettings, splitTextPatch, withText, type Seeds, type Settings, type TextPatch } from './settings';

export interface Preset {
  label: string;
  /** Everything else comes from the medium's defaults. The writing is given as one text and a signature. */
  settings: Partial<Omit<Settings, 'blocks'>> & TextPatch & Pick<Settings, 'medium'>;
}

/** Ready-made handouts to start from. */
export const PRESETS: Preset[] = [
  {
    label: 'Roman epitaph',
    settings: {
      medium: 'marble',
      shape: 'tabula',
      method: 'filled-red',
      text: 'DIS MANIBVS\nGAIO IVLIO FELICI\nVIXIT ANNOS XXXV\nH · S · E',
      damage: 0.45,
      fade: 0.35,
    },
  },
  {
    label: 'Burnt letter',
    settings: {
      medium: 'paper',
      shape: 'torn',
      variant: 'aged',
      text:
        'My dearest Eleanor,\n\nIf this reaches you, the house is lost. Take the children to your ' +
        'sister’s and do not open the cellar, whatever you hear from below.\n\nForgive me,\nThomas',
      damage: 0.8,
      damageMix: { burns: 1, water: 0.2, folds: 0.6, smudges: 0.3, foxing: 0.4, tears: 0.2 },
      fade: 0.25,
    },
  },
  {
    label: 'Papyrus fragment',
    settings: { medium: 'papyrus', damage: 0.7, fade: 0.4 },
  },
  {
    label: 'Tavern sign',
    settings: { medium: 'wood', method: 'gilt', variant: 'walnut', damage: 0.3, fade: 0.25 },
  },
  {
    label: 'Weathered gravestone',
    settings: {
      medium: 'slate',
      shape: 'stele',
      damage: 0.6,
      damageMix: { chips: 0.3, breaks: 0.4, cracks: 0.5, flaking: 0.5, lichen: 0.9 },
      fade: 0.5,
    },
  },
  {
    label: 'Dwarven waystone',
    settings: {
      medium: 'granite',
      shape: 'fragment',
      font: 'noto-sans-runic',
      script: 'elder-futhark',
      text: 'HERE LIES THE ROAD\nTO THE DEEP HALLS',
      damage: 0.5,
      fade: 0.3,
    },
  },
  {
    label: 'Royal decree',
    settings: { medium: 'parchment', font: 'unifrakturmaguntia', damage: 0.3, fade: 0.2 },
  },
  {
    label: 'Expedition log',
    settings: {
      medium: 'paper',
      variant: 'aged',
      font: 'special-elite',
      method: 'carbon-ink',
      text:
        'EXPEDITION LOG — DAY 41\n\nThe survey party has not returned from the lower galleries. ' +
        'Water is rising in camp. We are sealing the [[northern shaft]] tonight.\n\n— R. Hale',
      damage: 0.6,
      damageMix: { water: 1, folds: 0.4, foxing: 0.6, smudges: 0.2 },
      fade: 0.3,
    },
  },
  {
    label: 'Harbour memorial',
    settings: {
      medium: 'bronze',
      text: 'IN MEMORY OF\nCAPTAIN [[ALDOUS VANE]]\nLOST WITH THE\nSILVER HERON\nMDCCLXXI',
      damage: 0.55,
      damageMix: { verdigris: 0.9, pitting: 0.4, scratches: 0.3, dents: 0.2 },
      fade: 0.35,
    },
  },
  {
    label: 'Broken clay tablet',
    settings: { medium: 'clay', shape: 'fragment', damage: 0.6, fade: 0.35 },
  },
  {
    label: 'Typed memo',
    settings: {
      medium: 'paper',
      variant: 'white',
      method: 'typewriter',
      font: 'courier-prime',
      text:
        'MISKATONIC UNIVERSITY\nDEPARTMENT OF ANTIQUITIES\n\nDr. Armitage,\n\nThe tablet recovered at [[Kingsport]] ' +
        'is not Sumerian, whatever Professor Dyer claims. I have locked it in the vault beneath [[the east ' +
        'library]] and told no one else.\n\nThree of the night staff have asked to be moved to the day ' +
        'shift.\n\nRespectfully,',
      signature: 'F. Morgan',
      damage: 0.35,
      damageMix: { water: 0.6, folds: 0.7, foxing: 0.3, tears: 0.2, burns: 0, blots: 0, smudges: 0 },
      fade: 0.2,
    },
  },
  {
    label: 'Cursed tomb door',
    settings: {
      medium: 'sandstone',
      shape: 'fragment',
      text: 'WHOSOEVER BREAKS\nTHIS SEAL SHALL\n[[WALK FOREVER]]\nIN THE DARK',
      damage: 0.55,
      fade: 0.45,
    },
  },
];

/** A preset's settings, with the medium's defaults for everything it leaves out. */
export function applyPreset(preset: Preset, seeds: Seeds): Settings {
  const base = defaultSettings(preset.settings.medium, seeds);
  const { rest, patch } = splitTextPatch(preset.settings);
  const settings: Settings = {
    ...base,
    ...rest,
    damageMix: { ...base.damageMix, ...rest.damageMix },
    textEdited: patch.text !== undefined,
  };
  return withText(settings, patch);
}

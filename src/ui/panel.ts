import { DAMAGE_TYPES, type DamageId } from '../damage/types';
import { MEDIA, type MediumDef, type MediumId } from '../media/media';
import { SHAPES, type ShapeId } from '../media/shapes';
import { METHODS, type MethodId } from '../media/writing';
import { changeMedium, type Seeds, type Settings } from '../settings';
import { FONTS, type FontId } from '../text/fonts';
import type { Align } from '../text/layout';
import { randomSeed } from '../util/rng';
import { button, section, segmented, select, slider, textArea } from './controls';
import type { Store } from './store';

export interface PanelActions {
  exportPng: (button: HTMLButtonElement) => void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

const DIRECTIONS = ['right', 'lower right', 'below', 'lower left', 'left', 'upper left', 'above', 'upper right'];

/** "225° · upper left": where a light at this azimuth comes from. */
function describeAzimuth(azimuth: number): string {
  return `${Math.round(azimuth)}° · ${DIRECTIONS[Math.round(azimuth / 45) % 8]}`;
}

/** Whether the "Damage types" section is open; kept across rebuilds of the panel. */
let damageTypesOpen = false;

/** Builds the control panel for the current settings. Rebuilt when the medium changes. */
export function renderPanel(container: HTMLElement, store: Store<Settings>, actions: PanelActions): void {
  const settings = store.get();
  const medium: MediumDef = MEDIA[settings.medium];
  const rebuild = () => renderPanel(container, store, actions);
  const change = (patch: Partial<Settings>) => store.update((current) => ({ ...current, ...patch }));
  const reroll = (...keys: (keyof Seeds)[]) =>
    store.update((current) => {
      const seeds = { ...current.seeds };
      for (const key of keys) seeds[key] = randomSeed();
      return { ...current, seeds };
    });
  const dice = (title: string, ...keys: (keyof Seeds)[]) =>
    button('🎲', () => reroll(...keys), { title, className: 'icon-button' });

  const exportButton = button('Download PNG · 300 DPI', () => actions.exportPng(exportButton), {
    className: 'primary',
  });

  const damageTypes = document.createElement('details');
  damageTypes.className = 'subsection';
  damageTypes.open = damageTypesOpen;
  damageTypes.addEventListener('toggle', () => (damageTypesOpen = damageTypes.open));
  const summary = document.createElement('summary');
  summary.textContent = 'Damage types';
  damageTypes.append(
    summary,
    ...(Object.keys(medium.damage) as DamageId[]).map((id) =>
      slider({
        label: DAMAGE_TYPES[id],
        value: settings.damageMix[id] ?? 0,
        min: 0,
        max: 1,
        step: 0.01,
        format: percent,
        onInput: (weight) =>
          store.update((current) => ({ ...current, damageMix: { ...current.damageMix, [id]: weight } })),
      }),
    ),
  );

  const sections = [
    section(
      'Object',
      select<MediumId>({
        label: 'Medium',
        value: settings.medium,
        options: Object.entries(MEDIA).map(([value, def]) => ({ value: value as MediumId, label: def.label })),
        onChange: (value) => {
          store.set(changeMedium(store.get(), value));
          rebuild();
        },
      }),
      select<string>({
        label: 'Colour',
        value: settings.variant,
        options: Object.entries(medium.variants).map(([value, variant]) => ({ value, label: variant.label })),
        onChange: (variant) => change({ variant }),
      }),
      select<ShapeId>({
        label: 'Shape',
        value: settings.shape,
        options: medium.shapes.map((shape) => ({ value: shape, label: SHAPES[shape].label })),
        onChange: (shape) => change({ shape }),
      }),
    ),
    section(
      'Writing',
      textArea({
        label: 'Text',
        value: settings.text,
        rows: 6,
        onInput: (text) => change({ text, textEdited: true }),
      }),
      select<FontId>({
        label: 'Style',
        value: settings.font,
        options: Object.entries(FONTS).map(([value, font]) => ({ value: value as FontId, label: font.label })),
        onChange: (font) => change({ font }),
      }),
      select<MethodId>({
        label: 'Made by',
        value: settings.method,
        options: medium.methods.map((method) => ({ value: method, label: METHODS[method].label })),
        onChange: (method) => change({ method }),
      }),
      slider({
        label: 'Size',
        value: settings.textScale,
        min: 0.3,
        max: 1,
        step: 0.01,
        format: percent,
        onInput: (textScale) => change({ textScale }),
      }),
      segmented<Align>({
        label: 'Align',
        value: settings.align,
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Centre' },
          { value: 'right', label: 'Right' },
        ],
        onChange: (align) => change({ align }),
      }),
    ),
    section(
      'Wear',
      slider({
        label: 'Damage',
        value: settings.damage,
        min: 0,
        max: 1,
        step: 0.01,
        format: percent,
        onInput: (damage) => change({ damage }),
        extra: dice('Reroll the damage', 'damage'),
      }),
      damageTypes,
      slider({
        label: 'Fade',
        value: settings.fade,
        min: 0,
        max: 1,
        step: 0.01,
        format: percent,
        onInput: (fade) => change({ fade }),
        extra: dice('Reroll where it fades', 'fade'),
      }),
      button(`New ${medium.label.toLowerCase()} and handwriting`, () => reroll('material', 'hand'), {
        className: 'secondary',
      }),
    ),
  ];

  if (medium.family !== 'sheet') {
    const light = () => store.get().light ?? { azimuth: medium.light.azimuth, elevation: medium.light.elevation };
    sections.push(
      section(
        'Light',
        slider({
          label: 'Comes from',
          value: light().azimuth,
          min: 0,
          max: 359,
          step: 1,
          format: describeAzimuth,
          onInput: (azimuth) => change({ light: { ...light(), azimuth } }),
        }),
        slider({
          label: 'Height (low light shows carving best)',
          value: light().elevation,
          min: 8,
          max: 80,
          step: 1,
          format: (value) => `${Math.round(value)}°`,
          onInput: (elevation) => change({ light: { ...light(), elevation } }),
        }),
        button(
          'Reset light',
          () => {
            change({ light: null });
            rebuild();
          },
          { className: 'secondary' },
        ),
      ),
    );
  }

  sections.push(section('Output', exportButton));
  container.replaceChildren(...sections);
}

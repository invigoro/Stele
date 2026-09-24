import { MEDIA, type MediumId } from '../media/media';
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

const DAMAGE_LABELS: Record<string, string> = { chips: 'chips and broken edges', water: 'water stains' };

/** Builds the control panel for the current settings. Rebuilt when the medium changes. */
export function renderPanel(container: HTMLElement, store: Store<Settings>, actions: PanelActions): void {
  const settings = store.get();
  const medium = MEDIA[settings.medium];
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

  container.replaceChildren(
    section(
      'Object',
      segmented<MediumId>({
        label: 'Medium',
        value: settings.medium,
        options: Object.entries(MEDIA).map(([value, def]) => ({ value: value as MediumId, label: def.label })),
        onChange: (value) => {
          store.set(changeMedium(store.get(), value));
          renderPanel(container, store, actions);
        },
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
        label: `Damage: ${DAMAGE_LABELS[medium.damage]}`,
        value: settings.damage,
        min: 0,
        max: 1,
        step: 0.01,
        format: percent,
        onInput: (damage) => change({ damage }),
        extra: dice('Reroll the damage', 'damage'),
      }),
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
    section('Output', exportButton),
  );
}

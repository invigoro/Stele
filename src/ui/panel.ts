import { PAINT_KINDS, PAINT_LABELS, type PaintKind } from '../damage/paint';
import { DAMAGE_TYPES, type DamageId } from '../damage/types';
import { MEDIA, type MediumDef, type MediumId } from '../media/media';
import { SHAPES, type ShapeId } from '../media/shapes';
import { METHODS, type MethodId } from '../media/writing';
import { applyPreset, PRESETS } from '../presets';
import { changeMedium, type Seeds, type Settings } from '../settings';
import { FONTS, type FontId } from '../text/fonts';
import type { Align } from '../text/layout';
import type { PageMode } from '../text/pages';
import { randomSeed } from '../util/rng';
import { clearStrokes, undoStroke, type BrushState } from './brush';
import { button, buttonRow, checkbox, hint, section, segmented, select, slider, textArea } from './controls';
import type { Store } from './store';

export interface PanelActions {
  brush: Store<BrushState>;
  /** The page being shown, for painting and undo. */
  page: () => number;
  exportPng: (button: HTMLButtonElement) => void;
  exportAllPages: (button: HTMLButtonElement) => void;
  print: (button: HTMLButtonElement) => void;
  copyLink: (button: HTMLButtonElement) => void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

const DIRECTIONS = ['right', 'lower right', 'below', 'lower left', 'left', 'upper left', 'above', 'upper right'];

/** "225° · upper left": where a light at this azimuth comes from. */
function describeAzimuth(azimuth: number): string {
  return `${Math.round(azimuth)}° · ${DIRECTIONS[Math.round(azimuth / 45) % 8]}`;
}

/** "24 × 16 cm (9.4 × 6.3 in)" for a medium at a scale. */
function describeSize(medium: MediumDef, scale: number): string {
  const cm = (mm: number) => (mm / 10).toFixed(mm < 100 ? 1 : 0);
  const inches = (mm: number) => (mm / 25.4).toFixed(1);
  const w = medium.width * scale;
  const h = medium.height * scale;
  return `${cm(w)} × ${cm(h)} cm (${inches(w)} × ${inches(h)} in)`;
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

  const presetOptions = [{ value: '', label: 'Choose a preset…' }, ...PRESETS.map((p, i) => ({ value: String(i), label: p.label }))];
  const sections = [
    section(
      'Start from',
      select<string>({
        label: 'Preset',
        value: '',
        options: presetOptions,
        onChange: (value) => {
          if (!value) return;
          store.set(applyPreset(PRESETS[Number(value)], store.get().seeds));
          rebuild();
        },
      }),
    ),
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
      slider({
        label: 'Size',
        value: settings.objectScale,
        min: 0.5,
        max: 1.5,
        step: 0.05,
        format: (scale) => describeSize(medium, scale),
        onInput: (objectScale) => change({ objectScale }),
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
      hint('Wrap words in <code>[[…]]</code> to have them destroyed, or <code>{{…}}</code> to keep damage off them.'),
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
      checkbox({
        label: 'Roman letter forms (V for U, dots between words)',
        checked: settings.roman,
        onChange: (roman) => change({ roman }),
      }),
      select<PageMode>({
        label: 'Long text',
        value: settings.pages,
        options: [
          { value: 'flow', label: 'Continue onto more pages' },
          { value: 'fit', label: 'Shrink to fit one page' },
        ],
        onChange: (pages) => change({ pages }),
      }),
      hint('A line with just <code>---</code> starts a new page.'),
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

  const { brush } = actions;
  const labels = PAINT_LABELS[medium.family];
  sections.push(
    section(
      'Paint damage',
      segmented<PaintKind | 'off'>({
        label: 'Brush',
        value: brush.get().tool ?? 'off',
        options: [{ value: 'off', label: 'Off' }, ...PAINT_KINDS.map((kind) => ({ value: kind, label: labels[kind] }))],
        onChange: (value) => brush.update((b) => ({ ...b, tool: value === 'off' ? null : value })),
        wrap: true,
      }),
      slider({
        label: 'Brush size',
        value: brush.get().size,
        min: 2,
        max: 40,
        step: 1,
        format: (size) => `${Math.round(size)} mm`,
        onInput: (size) => brush.update((b) => ({ ...b, size })),
      }),
      hint('Pick a kind of damage, then drag on the picture to paint it exactly where you want it.'),
      buttonRow(
        button('Undo stroke', () => store.set(undoStroke(store.get(), actions.page())), { className: 'secondary' }),
        button(
          'Clear',
          () => {
            const count = store.get().strokes.filter((stroke) => stroke.page === actions.page()).length;
            if (count > 3 && !window.confirm(`Remove all ${count} painted strokes?`)) return;
            store.set(clearStrokes(store.get(), actions.page()));
          },
          { className: 'secondary' },
        ),
      ),
    ),
  );

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

  const exportButton = button('Download PNG · 300 DPI', () => actions.exportPng(exportButton), { className: 'primary' });
  // Shown by main.ts when the handout has more than one page.
  const allPagesButton = button('Download all pages (.zip)', () => actions.exportAllPages(allPagesButton), {
    className: 'secondary all-pages',
  });
  allPagesButton.hidden = true;
  const printButton = button('Print at actual size', () => actions.print(printButton), { className: 'secondary' });
  const linkButton = button('Copy link to this handout', () => actions.copyLink(linkButton), { className: 'secondary' });
  sections.push(
    section(
      'Output',
      exportButton,
      allPagesButton,
      checkbox({
        label: 'Transparent background (for virtual tabletops)',
        checked: settings.transparent,
        onChange: (transparent) => change({ transparent }),
      }),
      printButton,
      linkButton,
    ),
  );
  container.replaceChildren(...sections);
}

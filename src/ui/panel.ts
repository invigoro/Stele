import { PAINT_LABELS, paintKinds, type PaintKind } from '../damage/paint';
import { DAMAGE_TYPES, type DamageId } from '../damage/types';
import { MEDIA, type MediumDef, type MediumId } from '../media/media';
import { SHAPES, type ShapeId } from '../media/shapes';
import { METHODS, type MethodId } from '../media/writing';
import { applyPreset, PRESETS } from '../presets';
import { changeMedium, changeMethod, changeScript, type Seeds, type Settings } from '../settings';
import { FONTS, type FontId } from '../text/fonts';
import type { Align } from '../text/layout';
import type { PageMode } from '../text/pages';
import { PICTURE_USES, UPLOAD, type PictureUse } from '../text/picture';
import { SCRIPTS, type ScriptId } from '../text/scripts';
import { randomSeed } from '../util/rng';
import { BRUSH_SIZES, clearStrokes, PEN_SIZES, undoStroke, type BrushState } from './brush';
import { button, buttonRow, checkbox, hint, section, segmented, select, slider, textArea, textInput } from './controls';
import type { Store } from './store';

export interface PanelActions {
  brush: Store<BrushState>;
  /** The page being shown, for painting and undo. */
  page: () => number;
  exportPng: (button: HTMLButtonElement) => void;
  exportAllPages: (button: HTMLButtonElement) => void;
  exportPdf: (button: HTMLButtonElement) => void;
  print: (button: HTMLButtonElement) => void;
  copyLink: (button: HTMLButtonElement) => void;
  /** Writes a picture instead of the text: an uploaded or pasted file, or a link to one. */
  usePicture: (source: Blob | string) => void;
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
/** The current panel's subscriptions, dropped when it's rebuilt. */
let subscriptions: (() => void)[] = [];

/** Builds the control panel for the current settings. Rebuilt when the medium changes. */
export function renderPanel(container: HTMLElement, store: Store<Settings>, actions: PanelActions): void {
  for (const unsubscribe of subscriptions) unsubscribe();
  subscriptions = [];
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

  const { brush } = actions;
  const madeBy = select<MethodId>({
      label: 'Made by',
      value: settings.method,
      options: medium.methods.map((method) => ({ value: method, label: METHODS[method].label })),
      onChange: (method) => {
        const before = store.get();
        store.set(changeMethod(before, method));
        if (store.get().font !== before.font) rebuild(); // show the typeface it switched to
      },
    });
  const sizeSlider = slider({
      label: 'Size',
      value: settings.textScale,
      min: 0.3,
      max: 1,
      step: 0.01,
      format: percent,
      onInput: (textScale) => change({ textScale }),
    });
  const alignment = segmented<Align>({
      label: 'Align',
      value: settings.align,
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ],
      onChange: (align) => change({ align }),
    });
  const signatureFields = [
    textInput({
      label: 'Signature',
      value: settings.signature,
      placeholder: 'None',
      maxLength: 120,
      onInput: (signature) => change({ signature }),
    }),
    select<FontId>({
      label: 'Signed in',
      value: settings.signatureFont,
      options: Object.entries(FONTS).map(([value, font]) => ({ value: value as FontId, label: font.label })),
      onChange: (signatureFont) => change({ signatureFont }),
    }),
    hint('Signed below the writing in a hand of its own. A typed page is signed in pen.'),
  ];
  const writeWith = segmented<Settings['writing']>({
    label: 'Write with',
    value: settings.writing,
    options: [
      { value: 'text', label: 'Text' },
      { value: 'picture', label: 'A picture' },
    ],
    onChange: (writing) => {
      change({ writing });
      rebuild();
    },
  });
  const textFields = [
    textArea({
      label: 'Text',
      value: settings.text,
      rows: 6,
      onInput: (text) => change({ text, textEdited: true }),
    }),
    hint('Wrap words in <code>[[…]]</code> to have them destroyed, or <code>{{…}}</code> to keep damage off them.'),
    select<ScriptId>({
      label: 'Script',
      value: settings.script,
      options: Object.entries(SCRIPTS).map(([value, script]) => ({ value: value as ScriptId, label: script.label })),
      onChange: (script) => {
        store.set(changeScript(store.get(), script));
        rebuild(); // show the typeface it switched to
      },
    }),
    ...(settings.script === 'latin'
      ? []
      : [hint('Type in English: it’s written out in the script as the handout is drawn.')]),
    select<FontId>({
      label: 'Style',
      value: settings.font,
      options: Object.entries(FONTS).map(([value, font]) => ({ value: value as FontId, label: font.label })),
      onChange: (font) => change({ font }),
    }),
    madeBy,
    sizeSlider,
    alignment,
    ...(settings.script === 'latin'
      ? [
          checkbox({
            label: 'Roman letter forms (V for U, dots between words)',
            checked: settings.roman,
            onChange: (roman) => change({ roman }),
          }),
        ]
      : []),
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
  ];
  const picture = settings.picture;
  const upload = document.createElement('input');
  upload.type = 'file';
  upload.accept = 'image/*';
  upload.hidden = true;
  upload.addEventListener('change', () => {
    const file = upload.files?.[0];
    if (file) actions.usePicture(file);
  });
  const uploaded = picture?.src.startsWith(UPLOAD) ?? false;
  const pictureFields = [
    buttonRow(button(picture ? 'Choose another picture…' : 'Choose a picture…', () => upload.click(), { className: 'secondary' }), upload),
    textInput({
      label: 'Or a link to one',
      value: picture && !uploaded ? picture.src : '',
      placeholder: 'https://…',
      onChange: (link) => {
        if (link.trim()) actions.usePicture(link.trim());
      },
    }),
    hint(
      'Or paste a picture (<kbd>Ctrl</kbd>+<kbd>V</kbd>), or drop one on the preview. It’s carved, inked or cast ' +
        'like lettering, and anything transparent in it stays bare.' +
        (uploaded ? ' A link to this handout can’t carry an uploaded picture, only a linked one.' : ''),
    ),
    ...(picture
      ? [
          select<PictureUse>({
            label: 'Write',
            value: picture.use,
            options: Object.entries(PICTURE_USES).map(([value, label]) => ({ value: value as PictureUse, label })),
            onChange: (use) => {
              const current = store.get().picture;
              if (current) change({ picture: { ...current, use } });
              rebuild();
            },
          }),
          ...(picture.use === 'opaque'
            ? []
            : [
                slider({
                  label: picture.use === 'dark' ? 'Counts as dark from' : 'Counts as light from',
                  value: picture.threshold,
                  min: 0.1,
                  max: 0.9,
                  step: 0.01,
                  format: percent,
                  onInput: (threshold) => {
                    const current = store.get().picture;
                    if (current) change({ picture: { ...current, threshold } });
                  },
                }),
              ]),
        ]
      : []),
    madeBy,
    sizeSlider,
    alignment,
  ];
  const drawSection = section(
    'Draw by hand',
    segmented<'off' | 'pen'>({
      label: 'Pen',
      value: brush.get().tool === 'pen' ? 'pen' : 'off',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'pen', label: 'Draw' },
      ],
      onChange: (value) => brush.update((b) => ({ ...b, tool: value === 'pen' ? 'pen' : null })),
      sync: (show) => subscriptions.push(brush.subscribe((b) => show(b.tool === 'pen' ? 'pen' : 'off'))),
    }),
    slider({
      label: 'Pen width',
      value: brush.get().penSize,
      min: PEN_SIZES[0],
      max: PEN_SIZES[PEN_SIZES.length - 1],
      step: 0.1,
      format: (width) => `${width.toFixed(1)} mm`,
      onInput: (penSize) => brush.update((b) => ({ ...b, penSize })),
      sync: (show) => subscriptions.push(brush.subscribe((b) => show(b.penSize))),
    }),
    hint(
      'Drag on the preview to draw a map, a sketch or a mark: it’s carved, inked or cast just like the lettering. ' +
        '<kbd>[</kbd> and <kbd>]</kbd> change the width.',
    ),
    buttonRow(
      button('Undo line', () => store.set(undoStroke(store.get(), actions.page(), 'pen')), { className: 'secondary' }),
      button(
        'Clear drawing',
        () => {
          const count = store.get().strokes.filter((stroke) => stroke.page === actions.page() && stroke.kind === 'pen').length;
          if (count > 5 && !window.confirm(`Remove all ${count} lines drawn on this page?`)) return;
          store.set(clearStrokes(store.get(), actions.page(), 'pen'));
        },
        { className: 'secondary' },
      ),
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
    section('Writing', writeWith, ...(settings.writing === 'picture' ? pictureFields : textFields), ...signatureFields),
    drawSection,
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

  const kinds = paintKinds(medium);
  const labels = PAINT_LABELS[medium.family];
  // A brush this medium doesn't have (moss, after switching from stone to paper) turns off.
  const tool = brush.get().tool;
  if (tool && tool !== 'pen' && !kinds.includes(tool)) brush.update((b) => ({ ...b, tool: null }));
  sections.push(
    section(
      'Paint damage',
      segmented<PaintKind | 'off'>({
        label: 'Brush',
        value: tool && tool !== 'pen' ? tool : 'off',
        options: [{ value: 'off', label: 'Off' }, ...kinds.map((kind) => ({ value: kind, label: labels[kind] ?? kind }))],
        onChange: (value) => brush.update((b) => ({ ...b, tool: value === 'off' ? null : value })),
        wrap: true,
        sync: (show) => subscriptions.push(brush.subscribe((b) => show(b.tool && b.tool !== 'pen' ? b.tool : 'off'))),
      }),
      slider({
        label: 'Brush size',
        value: brush.get().size,
        min: BRUSH_SIZES[0],
        max: BRUSH_SIZES[BRUSH_SIZES.length - 1],
        step: 1,
        format: (size) => `${Math.round(size)} mm`,
        onInput: (size) => brush.update((b) => ({ ...b, size })),
        sync: (show) => subscriptions.push(brush.subscribe((b) => show(b.size))),
      }),
      hint(
        'Pick a kind of damage, then drag on the picture to paint it exactly where you want it. ' +
          '<kbd>[</kbd> and <kbd>]</kbd> change the brush size, and <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes a stroke.',
      ),
      buttonRow(
        button('Undo stroke', () => store.set(undoStroke(store.get(), actions.page(), 'damage')), { className: 'secondary' }),
        button(
          'Clear',
          () => {
            const count = store.get().strokes.filter((stroke) => stroke.page === actions.page() && stroke.kind !== 'pen').length;
            if (count > 3 && !window.confirm(`Remove all ${count} painted strokes?`)) return;
            store.set(clearStrokes(store.get(), actions.page(), 'damage'));
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
  // main.ts says how many pages it holds.
  const pdfButton = button('Download PDF', () => actions.exportPdf(pdfButton), { className: 'secondary pdf' });
  const printButton = button('Print at actual size', () => actions.print(printButton), { className: 'secondary' });
  const linkButton = button('Copy link to this handout', () => actions.copyLink(linkButton), { className: 'secondary' });
  sections.push(
    section(
      'Output',
      exportButton,
      allPagesButton,
      pdfButton,
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

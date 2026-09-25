import { boxFrame, describeBlock, mainBlock, newBlockId, type Block, type Frame, type PictureBlock, type TextBlock } from '../blocks';
import { MEDIA, type MediumDef } from '../media/media';
import { textBox } from '../media/shapes';
import { METHODS, type MethodDef } from '../media/writing';
import type { PlacedBlock } from '../scene';
import { changeScript, newSignature, newTextBlock, updateBlock, type Settings } from '../settings';
import { FONTS, type FontId } from '../text/fonts';
import type { Align, Box } from '../text/layout';
import { PICTURE_USES, UPLOAD, type PictureUse } from '../text/picture';
import { SCRIPTS, type ScriptId } from '../text/scripts';
import { button, buttonRow, checkbox, hint, segmented, select, slider, textArea, textInput } from './controls';
import type { Store } from './store';

export interface BlockActions {
  /** The block being edited, on the preview and in the panel. */
  selection: Store<string | null>;
  /** The page shown, and how many there are. */
  page: () => number;
  pageCount: () => number;
  showPage: (page: number) => void;
  /** Where a block is on the page shown, if it's there. */
  placed: (id: string) => PlacedBlock | undefined;
  /** Writes a picture: into a new block, or in place of block `into`'s picture. */
  usePicture: (source: Blob | string, into?: string) => void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** The object's size and text area, mm, for placing new blocks. */
function objectArea(settings: Settings): { width: number; height: number; box: Box } {
  const medium: MediumDef = MEDIA[settings.medium];
  const scale = Math.min(1.5, Math.max(0.5, settings.objectScale));
  const width = medium.width * scale;
  const height = medium.height * scale;
  return { width, height, box: textBox(settings.shape, width, height, { x: medium.padding.x * scale, y: medium.padding.y * scale }) };
}

/** A frame for a new block: a part of the text area (fractions of it), centred on the middle. */
export function frameInTextArea(settings: Settings, widthFraction: number, heightFraction: number): Frame {
  const { width, height, box } = objectArea(settings);
  const w = box.width * widthFraction;
  const h = box.height * heightFraction;
  return boxFrame({ x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h }, 0, width, height);
}

/**
 * The Writing section's blocks: a list to pick from, buttons to add more, and the chosen
 * block's settings. Subscriptions are added to `subscriptions`, to drop when the panel
 * is rebuilt.
 */
export function blockFields(store: Store<Settings>, actions: BlockActions, subscriptions: (() => void)[]): HTMLElement[] {
  const { selection } = actions;

  const list = document.createElement('div');
  list.className = 'block-list';
  let listed = '';
  const renderList = () => {
    const { blocks } = store.get();
    const selected = selection.get();
    const pages = actions.pageCount();
    const label = (block: Block) =>
      describeBlock(block) + (pages > 1 && !(block.role === 'signature' && !block.frame) ? ` · p. ${block.page + 1}` : '');
    const key = JSON.stringify([blocks.map((block) => [block.id, label(block)]), selected]);
    if (key === listed) return;
    listed = key;
    list.replaceChildren(
      ...blocks.map((block) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'block-item';
        item.textContent = label(block);
        item.setAttribute('aria-pressed', String(block.id === selected));
        item.addEventListener('click', () => selection.set(block.id));
        return item;
      }),
    );
    if (blocks.length === 0) list.append(hint('Nothing is written yet: add some text or a picture.'));
  };

  const add = (block: Block, at?: number) => {
    store.update((settings) => {
      const blocks = [...settings.blocks];
      blocks.splice(at ?? blocks.length, 0, block);
      return { ...settings, blocks };
    });
    selection.set(block.id);
    editor.querySelector<HTMLTextAreaElement>('textarea')?.select();
  };
  const upload = document.createElement('input');
  upload.type = 'file';
  upload.accept = 'image/*';
  upload.hidden = true;
  upload.addEventListener('change', () => {
    const file = upload.files?.[0];
    if (file) actions.usePicture(file);
    upload.value = '';
  });
  const addRow = buttonRow(
    button(
      '+ Text',
      () => {
        const settings = store.get();
        const main = mainBlock(settings.blocks);
        add(
          newTextBlock(newBlockId(), settings.medium, {
            frame: frameInTextArea(settings, 0.6, 0.2),
            page: actions.page(),
            align: 'center',
            ...(main?.kind === 'text' ? { font: main.font, script: main.script } : {}),
          }),
        );
      },
      { className: 'secondary' },
    ),
    button(
      '+ Signature',
      () => {
        const settings = store.get();
        const main = mainBlock(settings.blocks);
        // Signed below the main text.
        add(newSignature(newBlockId(), settings.medium, 'Your name'), main ? settings.blocks.indexOf(main) + 1 : undefined);
      },
      { className: 'secondary' },
    ),
    button('+ Picture', () => upload.click(), { className: 'secondary' }),
    upload,
  );
  addRow.classList.add('add-blocks');

  const editor = document.createElement('div');
  editor.className = 'block-editor';
  let editorSubscriptions: (() => void)[] = [];
  /** What the editor's fields depend on besides values typed into them. */
  const shapeOf = (settings: Settings) => {
    const block = settings.blocks.find((b) => b.id === selection.get());
    return JSON.stringify(block ? [block.id, block.kind, block.frame === null, block.page, block.kind === 'picture' && block.use] : null);
  };
  let shown = '';
  editor.addEventListener('focusout', (event) => {
    if (!editor.contains(event.relatedTarget as Node | null) && shapeOf(store.get()) !== shown) renderEditor();
  });
  const renderEditor = () => {
    for (const unsubscribe of editorSubscriptions) unsubscribe();
    editorSubscriptions = [];
    const settings = store.get();
    shown = shapeOf(settings);
    const id = selection.get();
    const block = settings.blocks.find((b) => b.id === id);
    if (!block) {
      editor.replaceChildren(
        hint(settings.blocks.length > 0 ? 'Pick a block above, or click one on the preview, to change it.' : ''),
      );
      return;
    }
    const update = (change: (b: Block) => Block) => store.update((s) => updateBlock(s, block.id, change));
    const patch = (values: Partial<TextBlock> | Partial<PictureBlock>) => update((b) => ({ ...b, ...values }) as Block);
    const fields = block.kind === 'text' ? textFields(block, patch) : pictureFields(block, patch);
    editor.replaceChildren(...fields, ...placementFields(block, update));
  };

  const textFields = (block: TextBlock, patch: (values: Partial<TextBlock>) => void): HTMLElement[] => {
    const settings = store.get();
    const method: MethodDef = METHODS[settings.method];
    const signs = block.role === 'signature' && !block.frame;
    return [
      textArea({
        label: signs ? 'Signature' : 'Text',
        value: block.text,
        rows: signs ? 2 : 6,
        onInput: (text) =>
          store.update((s) => ({
            ...updateBlock(s, block.id, (b) => ({ ...b, text }) as Block),
            textEdited: s.textEdited || block.role === 'main',
          })),
      }),
      hint('Wrap words in <code>[[…]]</code> to have them destroyed, or <code>{{…}}</code> to keep damage off them.'),
      ...(signs
        ? []
        : [
            select<ScriptId>({
              label: 'Script',
              value: block.script,
              options: Object.entries(SCRIPTS).map(([value, script]) => ({ value: value as ScriptId, label: script.label })),
              onChange: (script) => {
                store.set(changeScript(store.get(), block.id, script));
                renderEditor(); // show the typeface it switched to
              },
            }),
            ...(block.script === 'latin' ? [] : [hint('Type in English: it’s written out in the script as the handout is drawn.')]),
          ]),
      select<FontId>({
        label: 'Style',
        value: block.font,
        options: Object.entries(FONTS).map(([value, font]) => ({ value: value as FontId, label: font.label })),
        onChange: (font) => patch({ font }),
      }),
      ...(method.typed
        ? [checkbox({ label: 'Written by hand, in pen (on a typed page)', checked: block.byHand, onChange: (byHand) => patch({ byHand }) })]
        : []),
      ...(signs
        ? []
        : [
            slider({
              label: 'Size',
              value: block.size,
              min: 0.3,
              max: 1,
              step: 0.01,
              format: percent,
              onInput: (size) => patch({ size }),
            }),
            alignField(block.align, (align) => patch({ align })),
            ...(block.script === 'latin'
              ? [checkbox({ label: 'Roman letter forms (V for U, dots between words)', checked: block.roman, onChange: (roman) => patch({ roman }) })]
              : []),
            select<'flow' | 'fit'>({
              label: 'Long text',
              value: block.flow ? 'flow' : 'fit',
              options: [
                { value: 'flow', label: 'Continue onto more pages' },
                { value: 'fit', label: 'Shrink to fit' },
              ],
              // Only one block runs on.
              onChange: (value) =>
                store.update((s) => ({
                  ...s,
                  blocks: s.blocks.map((b) =>
                    b.kind !== 'text' ? b : b.id === block.id ? { ...b, flow: value === 'flow' } : value === 'flow' ? { ...b, flow: false } : b,
                  ),
                })),
            }),
            hint('A line with just <code>---</code> starts a new page.'),
          ]),
      ...(signs ? [hint('Signed below the block before it. Drag it on the preview to put it anywhere.')] : []),
    ];
  };

  const pictureFields = (block: PictureBlock, patch: (values: Partial<PictureBlock>) => void): HTMLElement[] => {
    const replace = document.createElement('input');
    replace.type = 'file';
    replace.accept = 'image/*';
    replace.hidden = true;
    replace.addEventListener('change', () => {
      const file = replace.files?.[0];
      if (file) actions.usePicture(file, block.id);
    });
    const uploaded = block.src.startsWith(UPLOAD);
    return [
      buttonRow(button('Choose another picture…', () => replace.click(), { className: 'secondary' }), replace),
      textInput({
        label: 'Or a link to one',
        value: uploaded ? '' : block.src,
        placeholder: 'https://…',
        onChange: (link) => {
          if (link.trim()) actions.usePicture(link.trim(), block.id);
        },
      }),
      hint(
        'It’s carved, inked or cast like lettering, and anything transparent in it stays bare.' +
          (uploaded ? ' A link to this handout can’t carry an uploaded picture, only a linked one.' : ''),
      ),
      select<PictureUse>({
        label: 'Write',
        value: block.use,
        options: Object.entries(PICTURE_USES).map(([value, label]) => ({ value: value as PictureUse, label })),
        onChange: (use) => {
          patch({ use });
          renderEditor();
        },
      }),
      ...(block.use === 'opaque'
        ? []
        : [
            slider({
              label: block.use === 'dark' ? 'Counts as dark from' : 'Counts as light from',
              value: block.threshold,
              min: 0.1,
              max: 0.9,
              step: 0.01,
              format: percent,
              onInput: (threshold) => patch({ threshold }),
            }),
          ]),
      // Placed by hand, a picture fills its frame; arranged by the template, these place it.
      ...(block.frame
        ? []
        : [
            slider({
              label: 'Size',
              value: block.size,
              min: 0.05,
              max: 1,
              step: 0.01,
              format: percent,
              onInput: (size) => patch({ size }),
            }),
            alignField(block.align, (align) => patch({ align })),
          ]),
    ];
  };

  /** Page, turning, and removing or putting back: the same for text and pictures. */
  const placementFields = (block: Block, update: (change: (b: Block) => Block) => void): HTMLElement[] => {
    const settings = store.get();
    const { width, height } = objectArea(settings);
    // A block arranged by the template is placed by hand from where it is now.
    const framed = (b: Block): Frame => {
      if (b.frame) return b.frame;
      const placed = actions.placed(b.id);
      return placed ? boxFrame(placed.box, placed.angle, width, height) : frameInTextArea(settings, 0.8, 0.8);
    };
    const follows = block.kind === 'text' && block.role === 'signature' && !block.frame;
    const pages = Math.max(actions.pageCount(), block.page + 1);
    const fields: HTMLElement[] = [];
    if (!follows) {
      fields.push(
        select<string>({
          label: block.kind === 'text' && block.flow ? 'Starts on' : 'Page',
          value: String(block.page),
          options: [
            ...Array.from({ length: pages }, (_, i) => ({ value: String(i), label: `Page ${i + 1}` })),
            { value: String(pages), label: 'A new page' },
          ],
          onChange: (value) => {
            update((b) => ({ ...b, page: Number(value) }));
            actions.showPage(Number(value));
            renderEditor();
          },
        }),
      );
    }
    fields.push(
      slider({
        label: 'Turned',
        value: block.frame?.angle ?? 0,
        min: -180,
        max: 180,
        step: 1,
        format: (angle) => `${Math.round(angle)}°`,
        onInput: (angle) => update((b) => ({ ...b, frame: { ...framed(b), angle } })),
        sync: (show) =>
          editorSubscriptions.push(
            store.subscribe((s) => {
              const current = s.blocks.find((b) => b.id === block.id);
              if (current) show(current.frame?.angle ?? 0);
            }),
          ),
      }),
      buttonRow(
        button(
          'Remove',
          () => {
            store.update((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== block.id) }));
            selection.set(null);
          },
          { className: 'secondary' },
        ),
        ...(block.role && block.frame
          ? [
              button(
                'Put back in place',
                () => {
                  update((b) => ({ ...b, frame: null }));
                  renderEditor();
                },
                { className: 'secondary', title: 'Let the template arrange it again' },
              ),
            ]
          : []),
      ),
    );
    return fields;
  };

  subscriptions.push(
    selection.subscribe(() => {
      renderList();
      renderEditor();
    }),
    store.subscribe(() => {
      renderList();
      // A block removed elsewhere (on the preview) takes its settings with it.
      const id = selection.get();
      if (id && !store.get().blocks.some((b) => b.id === id)) selection.set(null);
      // e.g. placed by hand on the preview; not while a field in it is in use.
      else if (shapeOf(store.get()) !== shown && !editor.contains(document.activeElement)) renderEditor();
    }),
    () => {
      for (const unsubscribe of editorSubscriptions) unsubscribe();
    },
  );
  renderList();
  renderEditor();
  return [
    list,
    addRow,
    hint(
      'Click a block on the preview to pick it: drag it to move it, its corners to resize it and the round handle ' +
        'to turn it (hold <kbd>Shift</kbd> for steps of 15°). <kbd>Delete</kbd> removes it.',
    ),
    editor,
  ];
}

function alignField(value: Align, onChange: (align: Align) => void): HTMLElement {
  return segmented<Align>({
    label: 'Align',
    value,
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Centre' },
      { value: 'right', label: 'Right' },
    ],
    onChange,
  });
}

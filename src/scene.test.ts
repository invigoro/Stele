import { describe, expect, it } from 'vitest';
import { MEDIA, type MediumId } from './media/media';
import { textBox } from './media/shapes';
import { buildScene, buildScenes, fitPicture } from './scene';
import { mainBlock, type TextBlock } from './blocks';
import { changeMedium, changeMethod, changeScript, defaultSettings, newTextBlock, splitTextPatch, withText, type Seeds, type Settings, type TextPatch } from './settings';
import type { Measure } from './text/layout';

const mono: Measure = { width: (text) => [...text].length * 0.5, ascent: 0.7, descent: 0.3 };
const seeds: Seeds = { material: 1, hand: 2, damage: 3, fade: 4 };
type Patch = Partial<Omit<Settings, 'blocks'>> & TextPatch;
/** A medium's default settings, with the writing given as one text and a signature. */
const settingsFor = (medium: MediumId, patch: Patch = {}): Settings => {
  const { rest, patch: text } = splitTextPatch(patch);
  return withText({ ...defaultSettings(medium, seeds), ...rest }, text);
};
const scene = (medium: MediumId, patch: Patch = {}) => buildScene(settingsFor(medium, { damage: 1, ...patch }), mono);
/** The main text block. */
const main = (settings: Settings) => mainBlock(settings.blocks) as TextBlock;

describe('buildScene', () => {
  it('gives each medium only its own kinds of damage', () => {
    const marble = scene('marble');
    expect(marble.features.chips.some((chip) => chip.breaks)).toBe(true);
    expect(marble.features.chips.some((chip) => !chip.breaks)).toBe(true);
    expect(marble.cracks.length).toBeGreaterThan(0);
    expect(marble.features.stains).toEqual([]);
    expect(marble.fields.lichen).toBeGreaterThan(0);

    const paper = scene('paper');
    expect(paper.features.stains.length).toBeGreaterThan(0);
    expect(paper.features.folds.length).toBeGreaterThan(0);
    expect(paper.features.chips).toEqual([]);
    expect(paper.cracks).toEqual([]);
    expect(paper.fields.lichen).toBe(0);
  });

  it('splits wood along its grain and gouges it', () => {
    const wood = scene('wood');
    expect(wood.cracks.length).toBeGreaterThan(0);
    expect(wood.features.chips.every((chip) => chip.aspect >= 2)).toBe(true);
  });

  it('turns a fragment-shaped slab into a fragment', () => {
    expect(scene('marble', { shape: 'fragment' }).features.cuts.length).toBeGreaterThan(0);
    expect(scene('marble', { shape: 'rectangle' }).features.cuts).toEqual([]);
  });

  it('drops ink blots on the media written in ink', () => {
    for (const medium of ['paper', 'parchment', 'papyrus'] as const) {
      const blots = scene(medium).features.blots;
      expect(blots.length, medium).toBeGreaterThan(0);
      expect(blots.every((blot) => blot.shape === 'round')).toBe(true);
      expect(scene(medium, { damageMix: { ...MEDIA[medium].damage, blots: 0 } }).features.blots).toEqual([]);
    }
    expect(scene('marble').features.blots).toEqual([]);
  });

  it('presses a clay tablet\u2019s letters in with a stylus, and chips out marked words', () => {
    const clay = scene('clay', { text: 'Pay [[Nanni]] in copper', damage: 0 });
    expect(clay.method.kind).toBe('impress');
    expect(clay.features.chips).toHaveLength(1);
    expect(clay.fields.lichen).toBe(0);
  });

  it('dents, scratches and greens a bronze plaque', () => {
    const bronze = scene('bronze');
    expect(bronze.features.chips.length).toBeGreaterThan(0); // dents
    expect(bronze.features.chips.every((chip) => !chip.breaks)).toBe(true);
    expect(bronze.cracks.length).toBeGreaterThan(0); // scratches
    expect(bronze.fields.verdigris).toBeGreaterThan(0);
    expect(bronze.fields.lichen).toBe(0);
    expect(scene('marble').fields.verdigris).toBe(0);
  });

  it('respects the damage mix and the overall amount', () => {
    expect(scene('marble', { damageMix: { lichen: 0.5 } }).features.chips).toEqual([]);
    expect(scene('marble', { damage: 0 }).fields.lichen).toBe(0);
  });

  it('keeps the text inside the shape’s text area', () => {
    for (const medium of Object.keys(MEDIA) as MediumId[]) {
      for (const shape of MEDIA[medium].shapes) {
        const built = scene(medium, { shape, damage: 0 });
        const box = textBox(shape, built.width, built.height, built.medium.padding);
        expect(built.drawing.runs.length).toBeGreaterThan(0);
        for (const run of built.drawing.runs) {
          expect(run.x).toBeGreaterThan(box.x - 1);
          expect(run.x).toBeLessThan(box.x + box.width);
          expect(run.y).toBeGreaterThan(box.y);
          expect(run.y).toBeLessThan(box.y + box.height + 1);
        }
      }
    }
  });

  it('uses the chosen variant’s palette, method and light', () => {
    const nero = scene('marble', { variant: 'nero', method: 'gilt', light: { azimuth: 90, elevation: 40 } });
    expect(nero.palette).toBe(MEDIA.marble.variants.nero.palette);
    expect(nero.method.gilt).toBe(true);
    expect(nero.light).toMatchObject({ azimuth: 90, elevation: 40, ambient: MEDIA.marble.light.ambient });
  });

  it('draws joined scripts word by word', () => {
    const built = scene('paper', { font: 'pinyon-script' });
    expect(built.drawing.runs.some((run) => run.text.length > 1)).toBe(true);
  });

  it('uses independent offsets per seed', () => {
    const a = scene('marble');
    const b = buildScene({ ...defaultSettings('marble', { ...seeds, damage: 99 }), damage: 1 }, mono);
    expect(b.offsets.material).toEqual(a.offsets.material);
    expect(b.offsets.damage).not.toEqual(a.offsets.damage);
  });
});

describe('every medium', () => {
  it.each(Object.keys(MEDIA) as MediumId[])('%s has a valid default for each setting', (medium) => {
    const def = MEDIA[medium];
    const settings = defaultSettings(medium, seeds);
    expect(Object.keys(def.variants)).toContain(settings.variant);
    expect(def.methods).toContain(settings.method);
    expect(def.shapes).toContain(settings.shape);
    expect(Object.keys(def.damage).length).toBeGreaterThan(0);
  });
});

describe('changeMedium', () => {
  it('swaps in the new sample text unless the text was edited', () => {
    const marble = defaultSettings('marble', seeds);
    expect(main(changeMedium(marble, 'paper')).text).toBe(main(defaultSettings('paper', seeds)).text);

    const edited = { ...withText(marble, { text: 'HERE LIES BOB' }), textEdited: true };
    const paper = changeMedium(edited, 'paper');
    expect(main(paper).text).toBe('HERE LIES BOB');
    expect(main(paper).font).toBe(main(defaultSettings('paper', seeds)).font);
  });

  it('takes the new medium’s variant, method, shape and damage mix, keeping wear and seeds', () => {
    const marble = { ...defaultSettings('marble', seeds), damage: 0.9, fade: 0.1, variant: 'nero', light: { azimuth: 1, elevation: 2 } };
    const wood = changeMedium(marble, 'wood');
    expect([wood.damage, wood.fade, wood.seeds]).toEqual([0.9, 0.1, seeds]);
    expect(wood.variant).toBe('walnut');
    expect(wood.method).toBe('gilt');
    expect(wood.damageMix).toEqual(MEDIA.wood.damage);
    expect(wood.light).toBeNull();
  });
});

describe('scripts', () => {
  it('writes a clay tablet in ruled cuneiform, from the English typed', () => {
    const tablet = defaultSettings('clay', seeds);
    expect([main(tablet).script, main(tablet).font]).toEqual(['cuneiform', 'noto-sans-cuneiform']);
    const drawn = scene('clay', { damage: 0 });
    expect(drawn.drawing.runs.every((run) => /^[\u{12000}-\u{1254F}]+$/u.test(run.text))).toBe(true);
    const rules = drawn.drawing.rules!;
    expect(rules.length).toBeGreaterThan(2);
    const ys = drawn.drawing.runs.map((run) => run.y);
    for (const rule of rules) {
      // Across the text area, between lines of signs.
      expect(rule.x0).toBeCloseTo(drawn.textBox.x, 6);
      expect(rule.x1).toBeCloseTo(drawn.textBox.x + drawn.textBox.width, 6);
      expect(ys.some((y) => y < rule.y0) && ys.some((y) => y > rule.y0)).toBe(true);
    }
    expect(scene('marble').drawing.rules).toBeUndefined();
  });

  it('brings a script\u2019s typeface along, and restores the usual one for Latin', () => {
    const granite = defaultSettings('granite', seeds);
    const runic = changeScript(granite, 'main', 'elder-futhark');
    expect(main(runic).font).toBe('noto-sans-runic');
    expect(main(changeScript(runic, 'main', 'latin')).font).toBe(main(granite).font);
    expect(main(changeScript(defaultSettings('clay', seeds), 'main', 'latin')).font).toBe('marcellus');
  });

  it('keeps a chosen script across media, but not a medium\u2019s own', () => {
    const runic = changeScript(defaultSettings('granite', seeds), 'main', 'futhorc');
    expect(main(changeMedium(runic, 'sandstone'))).toMatchObject({ script: 'futhorc', font: 'noto-sans-runic' });
    expect(main(changeMedium(defaultSettings('clay', seeds), 'marble'))).toMatchObject({ script: 'latin', font: 'cinzel' });
    expect(main(changeMedium(defaultSettings('marble', seeds), 'clay')).script).toBe('cuneiform');
  });

  it('leaves Roman letter forms to Latin', () => {
    const runes = scene('granite', { script: 'elder-futhark', roman: true, text: 'JUST', damage: 0 });
    expect(runes.drawing.runs.map((run) => run.text).join('')).toBe('\u16c3\u16a2\u16ca\u16cf');
  });
});

describe('signatures', () => {
  const lastLine = (runs: { y: number; handwritten?: boolean }[]) => Math.max(...runs.filter((run) => !run.handwritten).map((run) => run.y));

  it('signs below the text, at the right, larger, in its own typeface', () => {
    const signed = scene('paper', { text: 'Yours faithfully,', signature: 'H. Aldous', damage: 0 });
    const own = signed.drawing.runs.filter((run) => run.font === 'mrs-saint-delafield');
    expect(own.map((run) => run.text).join('')).toBe('H.Aldous');
    expect(own.every((run) => run.handwritten && run.scale > 1.2)).toBe(true);
    expect(Math.min(...own.map((run) => run.y))).toBeGreaterThan(lastLine(signed.drawing.runs));
    // Right-aligned: it ends at the text area's right edge. (A joined script is drawn a
    // word at a time; the test's font is 0.5 wide per character.)
    const end = Math.max(...own.map((run) => run.x + 0.5 * run.text.length * signed.drawing.size * run.scale));
    expect(end).toBeCloseTo(signed.textBox.x + signed.textBox.width, 0);
    expect(scene('paper', { signature: '' }).drawing.runs.some((run) => run.handwritten)).toBe(false);
  });

  it('centres under centred text, and makes room when shrinking to fit', () => {
    const plain = scene('marble', { damage: 0 });
    const signed = scene('marble', { signature: 'Caius fecit', damage: 0 });
    expect(signed.drawing.size).toBeLessThan(plain.drawing.size);
    const own = signed.drawing.runs.filter((run) => run.handwritten);
    const middle = (Math.min(...own.map((run) => run.x)) + Math.max(...own.map((run) => run.x))) / 2;
    expect(Math.abs(middle - (signed.textBox.x + signed.textBox.width / 2))).toBeLessThan(0.15 * signed.textBox.width);
  });

  it('signs only the last page, and can be destroyed or kept like the text', () => {
    const long = { text: 'Line of writing. '.repeat(120), signature: '[[R. Hale]]', damage: 0 };
    const pages = buildScenes(settingsFor('paper', { ...long }), mono);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.slice(0, -1).every((page) => page.drawing.runs.every((run) => !run.handwritten))).toBe(true);
    const last = pages.at(-1)!;
    expect(last.drawing.runs.some((run) => run.handwritten)).toBe(true);
    expect(last.features.blots).toHaveLength(1); // the marked signature is blotted out
  });
});

describe('pictures and drawing', () => {
  const picture = { src: 'https://example.com/map.png', use: 'opaque' as const, threshold: 0.5 };

  it('writes a picture in place of the text, as large as fits, keeping its shape', () => {
    const settings = settingsFor('marble', { writing: 'picture', picture, damage: 0 });
    const [drawn] = buildScenes(settings, mono, { pictures: { [picture.src]: { width: 400, height: 200 } } });
    expect(drawn.drawing.runs).toEqual([]);
    const place = drawn.drawing.pictures![0];
    expect(place.width / place.height).toBeCloseTo(2, 6);
    expect(place.x).toBeGreaterThanOrEqual(drawn.textBox.x - 1e-9);
    expect(place.x + place.width).toBeLessThanOrEqual(drawn.textBox.x + drawn.textBox.width + 1e-9);
    // Treated as writing of half the largest text size, so it's carved like text.
    expect(drawn.drawing.size).toBeCloseTo(0.5 * MEDIA.marble.maxTextSize, 6);
    // Until the picture has loaded, there's nothing to write.
    expect(buildScenes(settings, mono)[0].drawing.pictures).toBeUndefined();
  });

  it('fits into the area and follows the alignment', () => {
    const area = { x: 10, y: 20, width: 100, height: 50 };
    expect(fitPicture({ width: 100, height: 100 }, area, 1, 'center', 'middle')).toEqual({ x: 35, y: 20, width: 50, height: 50 });
    expect(fitPicture({ width: 100, height: 100 }, area, 0.5, 'left', 'top')).toEqual({ x: 10, y: 20, width: 25, height: 25 });
    expect(fitPicture({ width: 400, height: 100 }, area, 1, 'right', 'middle')).toEqual({ x: 10, y: 32.5, width: 100, height: 25 });
  });

  it('signs below the picture', () => {
    const settings = settingsFor('paper', { writing: 'picture', picture, signature: 'R. Hale', damage: 0 });
    const [drawn] = buildScenes(settings, mono, { pictures: { [picture.src]: { width: 100, height: 100 } } });
    const place = drawn.drawing.pictures![0];
    const signed = drawn.drawing.runs.filter((run) => run.handwritten);
    expect(signed.length).toBeGreaterThan(0);
    expect(Math.min(...signed.map((run) => run.y))).toBeGreaterThan(place.y + place.height);
  });

  it('writes lines drawn by hand on their own page, in mm, and keeps them out of the damage', () => {
    // Pen lines are placed from the centre in units of the shorter side (160 mm on marble).
    const line = { kind: 'pen' as const, radius: 0.005, points: [[-0.5, 0], [0.25, 0.25]] as [number, number][], page: 0 };
    const chip = { kind: 'break' as const, radius: 0.05, points: [[0.5, 0.5]] as [number, number][], page: 0 };
    const drawn = scene('marble', { text: '', strokes: [line, chip, { ...line, page: 1 }], damage: 0 });
    expect(drawn.drawing.lines).toEqual([{ points: [[40, 80], [160, 120]], width: 1.6 }]);
    expect(drawn.strokes).toEqual([chip]);
    // With no text, the lines set the size they're cut at.
    expect(drawn.drawing.size).toBeCloseTo(0.5 * MEDIA.marble.maxTextSize, 6);
  });

  it('keeps a drawing\u2019s shape on an object of another shape', () => {
    const square = { kind: 'pen' as const, radius: 0.005, points: [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2]] as [number, number][], page: 0 };
    for (const medium of ['marble', 'paper'] as const) {
      const [a, b, c] = scene(medium, { text: '', strokes: [square], damage: 0 }).drawing.lines![0].points;
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(Math.hypot(c[0] - b[0], c[1] - b[1]), 6);
    }
  });
});

describe('blocks', () => {
  const caption = (patch = {}) =>
    newTextBlock('caption', 'marble', { text: 'CAPTION', frame: { cx: 0.5, cy: 0.85, w: 0.5, h: 0.08, angle: 0 }, ...patch });

  it('lays out each block in its own frame, in its own typeface', () => {
    const settings = settingsFor('marble', { damage: 0 });
    settings.blocks = [...settings.blocks, caption({ font: 'uncial-antiqua' })];
    const drawn = buildScene(settings, mono);
    const own = drawn.drawing.runs.filter((run) => run.font === 'uncial-antiqua');
    expect(own.map((run) => run.text).join('')).toBe('CAPTION');
    // Inside its frame: the bottom of the slab (160 mm tall), in the middle.
    for (const run of own) expect(Math.abs(run.y - 0.85 * 160)).toBeLessThan(0.08 * 160);
    expect(drawn.placed.map((placed) => [placed.id, placed.auto])).toEqual([['main', true], ['caption', false]]);
  });

  it('turns a block’s letters, and the damage that destroys its marked words, with it', () => {
    const settings = settingsFor('marble', { damage: 0 });
    settings.blocks = [caption({ text: '[[GONE]]', frame: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.2, angle: 90 } })];
    const drawn = buildScene(settings, mono);
    expect(drawn.drawing.runs.every((run) => Math.abs(run.rotation - Math.PI / 2) < 0.05)).toBe(true);
    // Turned a quarter, the word runs down the slab rather than across it.
    const xs = drawn.drawing.runs.map((run) => run.x);
    const ys = drawn.drawing.runs.map((run) => run.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
    expect(drawn.features.chips).toHaveLength(1);
    expect(drawn.features.chips[0].angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('puts a block on its own page, adding pages as needed', () => {
    const settings = settingsFor('marble', { damage: 0 });
    settings.blocks = [...settings.blocks, caption({ page: 2 })];
    const scenes = buildScenes(settings, mono);
    expect(scenes).toHaveLength(3);
    expect(scenes.map((scene) => scene.placed.map((placed) => placed.id))).toEqual([['main'], [], ['caption']]);
  });

  it('writes text over a picture, and several pictures, each where it was put', () => {
    const settings = settingsFor('paper', { damage: 0 });
    const picture = (id: string, cx: number) => ({
      ...caption(),
      id,
      kind: 'picture' as const,
      src: `https://example.com/${id}.png`,
      use: 'opaque' as const,
      threshold: 0.5,
      frame: { cx, cy: 0.5, w: 0.3, h: 0.3, angle: 30 },
    });
    settings.blocks = [picture('map', 0.3), picture('seal', 0.7), caption()];
    const sizes = { 'https://example.com/map.png': { width: 100, height: 100 }, 'https://example.com/seal.png': { width: 100, height: 100 } };
    const drawn = buildScene(settings, mono, 0, { pictures: sizes });
    expect(drawn.drawing.pictures!.map((p) => [p.src.split('/').pop(), +(p.angle * 180 / Math.PI).toFixed(6)])).toEqual([
      ['map.png', 30],
      ['seal.png', 30],
    ]);
    expect(drawn.drawing.runs.length).toBeGreaterThan(0);
  });

  it('signs below the main text even after it’s been moved and turned', () => {
    const settings = settingsFor('paper', { text: 'Yours,', signature: 'R. Hale', damage: 0 });
    settings.blocks[0] = { ...settings.blocks[0], frame: { cx: 0.5, cy: 0.3, w: 0.6, h: 0.2, angle: 90 } };
    const drawn = buildScene(settings, mono);
    const signed = drawn.drawing.runs.filter((run) => run.handwritten);
    expect(signed.length).toBeGreaterThan(0);
    expect(signed.every((run) => Math.abs(run.rotation - Math.PI / 2) < 0.1)).toBe(true);
  });

  it('runs on only the first block that’s set to', () => {
    const long = 'Line of writing. '.repeat(150);
    const settings = settingsFor('paper', { text: long, damage: 0 });
    settings.blocks = [...settings.blocks, { ...newTextBlock('more', 'paper', { text: long, flow: true, frame: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.5, angle: 0 } }) }];
    const scenes = buildScenes(settings, mono);
    expect(scenes.length).toBeGreaterThan(1);
    expect(scenes.slice(1).every((scene) => scene.placed.every((placed) => placed.id === 'main'))).toBe(true);
  });
});

describe('changeMethod', () => {
  it('brings a typewriter’s typeface along, and restores the medium’s when switching back', () => {
    const letter = defaultSettings('paper', seeds);
    const typed = changeMethod(letter, 'typewriter');
    expect(main(typed).font).toBe('courier-prime');
    expect(main(changeMethod(typed, 'iron-gall')).font).toBe(main(letter).font);
    // A typeface chosen since is kept.
    expect(main(changeMethod(withText(typed, { font: 'special-elite' }), 'carbon-ink')).font).toBe('special-elite');
    expect(main(changeMethod(letter, 'red-ink')).font).toBe(main(letter).font);
    // A signature stays in its own hand.
    const signed = withText(letter, { signature: 'R. Hale' });
    expect(changeMethod(signed, 'typewriter').blocks[1]).toMatchObject({ font: 'mrs-saint-delafield', byHand: true });
  });

  it('types in pica, and redacts marked words with a bar', () => {
    const typed = scene('paper', { method: 'typewriter', font: 'courier-prime', text: 'Meet at [[the old mill]] at dawn.', damage: 0 });
    expect(typed.drawing.size).toBeLessThanOrEqual(4.2);
    expect(typed.features.blots.map((blot) => blot.shape)).toEqual(['bar']);
    expect(scene('paper', { text: 'Meet at [[the old mill]]', damage: 0 }).features.blots[0].shape).toBe('word');
  });
});

describe('damage markup', () => {
  it('destroys [[marked]] words in a way that suits each medium', () => {
    const text = 'THE KEY LIES BENEATH THE [[ALTAR]]';
    const marble = scene('marble', { text, damage: 0 });
    expect(marble.drawing.runs.map((run) => run.text).join('')).toBe('THEKEYLIESBENEATHTHEALTAR');
    expect(marble.features.chips).toHaveLength(1);
    expect(scene('paper', { text, damage: 0 }).features.blots).toHaveLength(1);
    expect(scene('papyrus', { text, damage: 0 }).features.holes).toHaveLength(1);
    expect(scene('wood', { text, damage: 0 }).features.chips).toHaveLength(1);
    // Bronze buries the word under a crust of corrosion, drawn from a blot.
    expect(scene('bronze', { text, damage: 0 }).features.blots).toHaveLength(1);
  });

  it('keeps random damage off {{protected}} words', () => {
    const protectedScene = scene('marble', { text: '{{DIS MANIBVS GAIO IVLIO FELICI VIXIT ANNOS}}' });
    expect(protectedScene.protect.length).toBeGreaterThan(0);
    for (const chip of protectedScene.features.chips) {
      for (const box of protectedScene.protect) {
        const dx = Math.max(box.x - chip.x, 0, chip.x - (box.x + box.width));
        const dy = Math.max(box.y - chip.y, 0, chip.y - (box.y + box.height));
        expect(Math.hypot(dx, dy)).toBeGreaterThan(chip.radius);
      }
    }
  });
});

describe('text and size options', () => {
  it('uses Roman letter forms when asked', () => {
    const roman = scene('marble', { text: 'Julius', roman: true, damage: 0 });
    expect(roman.drawing.runs.map((run) => run.text).join('')).toBe('IVLIVS');
  });

  it('scales the object', () => {
    const small = scene('marble', { objectScale: 0.5, damage: 0 });
    expect([small.width, small.height]).toEqual([MEDIA.marble.width / 2, MEDIA.marble.height / 2]);
  });
});

describe('obliteration coverage', () => {
  it('covers every letter of a marked phrase with its blot', () => {
    const text = 'We are sealing the [[northern shaft]] tonight.';
    const built = scene('paper', { text, damage: 0 });
    const [blot] = built.features.blots;
    expect(blot).toBeDefined();
    const start = 'We are sealing the '.length;
    const marked = built.drawing.runs.filter((run) => run.source >= start && run.source < start + 'northern shaft'.length);
    expect(marked.map((run) => run.text).join('')).toBe('northernshaft');
    const size = built.drawing.size;
    for (const run of marked) {
      for (const [x, y] of [
        [run.x, run.y - mono.ascent * size],
        [run.x + mono.width(run.text) * size, run.y + mono.descent * size],
      ]) {
        const qx = (x - blot.x) / blot.rx;
        const qy = (y - blot.y) / blot.ry;
        expect(Math.sqrt(Math.sqrt(qx ** 4 + qy ** 4))).toBeLessThan(1);
      }
    }
  });
});

describe('pages', () => {
  const long = Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of the survey party's final report.`).join(' ');

  it('continues long letters onto more pages, each with its own sheet and damage', () => {
    const scenes = buildScenes(settingsFor('paper', { text: long, textEdited: true, damage: 1 }), mono);
    expect(scenes.length).toBeGreaterThan(1);
    expect(scenes.every((scene, i) => scene.page === i && scene.pageCount === scenes.length)).toBe(true);
    expect(scenes[1].offsets.material).not.toEqual(scenes[0].offsets.material);
    expect(scenes[1].offsets.damage).not.toEqual(scenes[0].offsets.damage);
    // All pages share one text size.
    expect(new Set(scenes.map((scene) => scene.drawing.size)).size).toBe(1);
    for (const scene of scenes) {
      for (const run of scene.drawing.runs) expect(run.y).toBeLessThan(scene.textBox.y + scene.textBox.height + 1);
    }
  });

  it('keeps one-page handouts exactly as before', () => {
    const settings = defaultSettings('marble', seeds);
    const [only] = buildScenes(settings, mono);
    expect(buildScenes(settings, mono)).toHaveLength(1);
    expect(only.offsets.material).toEqual(buildScene(settings, mono).offsets.material);
    expect(only.drawing).toEqual(buildScene(settings, mono).drawing);
  });

  it('shrinks text onto one page in fit mode, and splits at --- lines either way', () => {
    const fit = buildScenes(settingsFor('paper', { text: long, textEdited: true, pages: 'fit' }), mono);
    expect(fit).toHaveLength(1);
    const split = buildScenes(settingsFor('marble', { text: 'ONE\n---\nTWO', textEdited: true }), mono);
    expect(split.map((scene) => scene.drawing.runs.map((run) => run.text).join(''))).toEqual(['ONE', 'TWO']);
  });

  it('puts painted strokes and marked words on their own page', () => {
    const settings = settingsFor('paper', {
      text: 'First page.\n---\nThe key is [[here]].',
      textEdited: true,
      damage: 0,
      strokes: [{ kind: 'break' as const, radius: 0.02, points: [[0.5, 0.5]] as [number, number][], page: 1 }],
    });
    const [first, second] = buildScenes(settings, mono);
    expect(first.strokes).toEqual([]);
    expect(second.strokes).toHaveLength(1);
    expect(first.features.blots).toEqual([]);
    expect(second.features.blots).toHaveLength(1);
  });
});

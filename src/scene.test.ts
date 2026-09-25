import { describe, expect, it } from 'vitest';
import { MEDIA, type MediumId } from './media/media';
import { textBox } from './media/shapes';
import { buildScene, buildScenes } from './scene';
import { changeMedium, defaultSettings, type Seeds } from './settings';
import type { Measure } from './text/layout';

const mono: Measure = { width: (text) => [...text].length * 0.5, ascent: 0.7, descent: 0.3 };
const seeds: Seeds = { material: 1, hand: 2, damage: 3, fade: 4 };
const scene = (medium: MediumId, patch = {}) => buildScene({ ...defaultSettings(medium, seeds), damage: 1, ...patch }, mono);

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
      expect(blots.every((blot) => blot.round)).toBe(true);
      expect(scene(medium, { damageMix: { ...MEDIA[medium].damage, blots: 0 } }).features.blots).toEqual([]);
    }
    expect(scene('marble').features.blots).toEqual([]);
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
    expect(changeMedium(marble, 'paper').text).toBe(defaultSettings('paper', seeds).text);

    const edited = { ...marble, text: 'HERE LIES BOB', textEdited: true };
    const paper = changeMedium(edited, 'paper');
    expect(paper.text).toBe('HERE LIES BOB');
    expect(paper.font).toBe(defaultSettings('paper', seeds).font);
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
    const scenes = buildScenes({ ...defaultSettings('paper', seeds), text: long, textEdited: true, damage: 1 }, mono);
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
    const fit = buildScenes({ ...defaultSettings('paper', seeds), text: long, textEdited: true, pages: 'fit' }, mono);
    expect(fit).toHaveLength(1);
    const split = buildScenes({ ...defaultSettings('marble', seeds), text: 'ONE\n---\nTWO', textEdited: true }, mono);
    expect(split.map((scene) => scene.drawing.runs.map((run) => run.text).join(''))).toEqual(['ONE', 'TWO']);
  });

  it('puts painted strokes and marked words on their own page', () => {
    const settings = {
      ...defaultSettings('paper', seeds),
      text: 'First page.\n---\nThe key is [[here]].',
      textEdited: true,
      damage: 0,
      strokes: [{ kind: 'break' as const, radius: 0.02, points: [[0.5, 0.5]] as [number, number][], page: 1 }],
    };
    const [first, second] = buildScenes(settings, mono);
    expect(first.strokes).toEqual([]);
    expect(second.strokes).toHaveLength(1);
    expect(first.features.blots).toEqual([]);
    expect(second.features.blots).toHaveLength(1);
  });
});

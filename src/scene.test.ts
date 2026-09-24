import { describe, expect, it } from 'vitest';
import { MEDIA, type MediumId } from './media/media';
import { textBox } from './media/shapes';
import { buildScene } from './scene';
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

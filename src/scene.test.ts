import { describe, expect, it } from 'vitest';
import { buildScene } from './scene';
import { changeMedium, defaultSettings, type Seeds } from './settings';
import type { Measure } from './text/layout';

const mono: Measure = { width: (text) => [...text].length * 0.5, ascent: 0.7, descent: 0.3 };
const seeds: Seeds = { material: 1, hand: 2, damage: 3, fade: 4 };

describe('buildScene', () => {
  it('chips marble and stains paper', () => {
    const marble = buildScene({ ...defaultSettings('marble', seeds), damage: 0.8 }, mono);
    expect(marble.chips.length).toBeGreaterThan(0);
    expect(marble.stains).toEqual([]);

    const paper = buildScene({ ...defaultSettings('paper', seeds), damage: 0.8 }, mono);
    expect(paper.stains.length).toBeGreaterThan(0);
    expect(paper.chips).toEqual([]);
  });

  it('keeps the text inside the padded area', () => {
    const scene = buildScene(defaultSettings('marble', seeds), mono);
    expect(scene.drawing.runs.length).toBeGreaterThan(0);
    for (const run of scene.drawing.runs) {
      expect(run.x).toBeGreaterThan(scene.medium.padding.x - 1);
      expect(run.x).toBeLessThan(scene.width - scene.medium.padding.x);
      expect(run.y).toBeGreaterThan(scene.medium.padding.y);
      expect(run.y).toBeLessThan(scene.height - scene.medium.padding.y + 1);
    }
  });

  it('draws joined scripts word by word', () => {
    const scene = buildScene({ ...defaultSettings('paper', seeds), font: 'pinyon-script' }, mono);
    expect(scene.drawing.runs.some((run) => run.text.length > 1)).toBe(true);
  });

  it('uses independent offsets per seed', () => {
    const a = buildScene(defaultSettings('marble', seeds), mono);
    const b = buildScene(defaultSettings('marble', { ...seeds, damage: 99 }), mono);
    expect(b.offsets.material).toEqual(a.offsets.material);
    expect(b.offsets.damage).not.toEqual(a.offsets.damage);
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

  it('keeps damage, fade and seeds', () => {
    const marble = { ...defaultSettings('marble', seeds), damage: 0.9, fade: 0.1 };
    const paper = changeMedium(marble, 'paper');
    expect([paper.damage, paper.fade, paper.seeds]).toEqual([0.9, 0.1, seeds]);
  });
});

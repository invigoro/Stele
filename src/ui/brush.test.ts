import { describe, expect, it } from 'vitest';
import type { Stroke } from '../damage/paint';
import { imageSize } from '../render/renderer';
import { buildScene } from '../scene';
import { defaultSettings } from '../settings';
import type { Measure } from '../text/layout';
import { canvasToObject, clearStrokes, shownPxPerMm, undoStroke, type View } from './brush';

const mono: Measure = { width: (text) => [...text].length * 0.5, ascent: 0.7, descent: 0.3 };
const seeds = { material: 1, hand: 2, damage: 3, fade: 4 };

describe('canvasToObject', () => {
  const scene = buildScene(defaultSettings('marble', seeds), mono);
  const pxPerMm = 2;
  const image = imageSize(scene, pxPerMm);
  // The image shown at half size, 100 px from the canvas's left and 50 px from its top.
  const view: View = { scene, pxPerMm, placement: { x: 100, y: 50, width: image.width / 2, height: image.height / 2 } };

  it('maps the object’s corners to 0 and 1', () => {
    const margin = scene.margin * pxPerMm * 0.5; // canvas pixels of margin around the object
    const [u0, v0] = canvasToObject(view, 100 + margin, 50 + margin);
    expect(u0).toBeCloseTo(0, 6);
    expect(v0).toBeCloseTo(0, 6);
    const [u1, v1] = canvasToObject(view, 100 + margin + scene.width, 50 + margin + scene.height);
    expect(u1).toBeCloseTo(1, 2);
    expect(v1).toBeCloseTo(1, 2);
  });

  it('knows how many canvas pixels a millimetre covers', () => {
    expect(shownPxPerMm(view)).toBeCloseTo(1, 6);
  });
});

describe('undo and clear', () => {
  const stroke = (page: number, x: number): Stroke => ({ kind: 'break', radius: 0.02, points: [[x, 0]], page });
  const settings = { ...defaultSettings('paper', seeds), strokes: [stroke(0, 0.1), stroke(1, 0.2), stroke(0, 0.3), stroke(1, 0.4)] };

  it('removes the newest stroke on the given page only', () => {
    expect(undoStroke(settings, 0).strokes.map((s) => s.points[0][0])).toEqual([0.1, 0.2, 0.4]);
    expect(undoStroke(settings, 1).strokes.map((s) => s.points[0][0])).toEqual([0.1, 0.2, 0.3]);
    expect(undoStroke(settings, 5)).toBe(settings);
  });

  it('clears one page and keeps the others', () => {
    expect(clearStrokes(settings, 1).strokes.map((s) => s.page)).toEqual([0, 0]);
  });
});

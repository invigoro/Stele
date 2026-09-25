import { describe, expect, it } from 'vitest';
import type { Stroke } from '../damage/paint';
import { imageSize } from '../render/renderer';
import { buildScene } from '../scene';
import { defaultSettings } from '../settings';
import type { Measure } from '../text/layout';
import { BRUSH_SIZES, canvasToObject, clearStrokes, objectToPen, PEN_SIZES, shownPxPerMm, stepBrushSize, undoStroke, type View } from './brush';

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

  it('places pen lines from the centre, in units of the shorter side', () => {
    expect(objectToPen({ width: 240, height: 160 }, [0.5, 0.5])).toEqual([0, 0]);
    expect(objectToPen({ width: 240, height: 160 }, [1, 1])).toEqual([0.75, 0.5]);
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

  it('skips strokes the medium can’t show', () => {
    const ink: Stroke = { kind: 'blot', radius: 0.02, points: [[0.8, 0]], page: 0 };
    expect(undoStroke({ ...settings, medium: 'marble', strokes: [stroke(0, 0.1), ink] }, 0).strokes).toEqual([ink]);
    const moss: Stroke = { kind: 'growth', radius: 0.02, points: [[0.9, 0]], page: 0 };
    const withMoss = { ...settings, strokes: [stroke(0, 0.1), moss] };
    // Paper grows no moss, so undo takes the hole before it; stone shows the moss, so it goes first.
    expect(undoStroke(withMoss, 0).strokes).toEqual([moss]);
    expect(undoStroke({ ...withMoss, medium: 'sandstone' }, 0).strokes).toEqual([stroke(0, 0.1)]);
    expect(undoStroke({ ...withMoss, strokes: [moss] }, 0).strokes).toEqual([moss]);
  });
});

describe('pen lines and damage', () => {
  const line = (x: number): Stroke => ({ kind: 'pen', radius: 0.003, points: [[x, 0]], page: 0 });
  const chip = (x: number): Stroke => ({ kind: 'break', radius: 0.02, points: [[x, 0]], page: 0 });
  const settings = { ...defaultSettings('marble', seeds), strokes: [line(0.1), chip(0.2), line(0.3), chip(0.4)] };
  const xs = (s: typeof settings) => s.strokes.map((stroke) => stroke.points[0][0]);

  it('undoes the newest of a group, or the newest of all', () => {
    expect(xs(undoStroke(settings, 0, 'pen'))).toEqual([0.1, 0.2, 0.4]);
    expect(xs(undoStroke(settings, 0, 'damage'))).toEqual([0.1, 0.2, 0.3]);
    expect(xs(undoStroke(settings, 0))).toEqual([0.1, 0.2, 0.3]);
  });

  it('clears a group and keeps the other', () => {
    expect(xs(clearStrokes(settings, 0, 'pen'))).toEqual([0.2, 0.4]);
    expect(xs(clearStrokes(settings, 0, 'damage'))).toEqual([0.1, 0.3]);
  });

  it('steps the pen through its own, finer widths', () => {
    expect(stepBrushSize(1, 1, PEN_SIZES)).toBe(1.2);
    expect(stepBrushSize(0.2, -1, PEN_SIZES)).toBe(0.2);
  });
});

describe('stepBrushSize', () => {
  it('steps through every size from smallest to largest and back', () => {
    const up = [BRUSH_SIZES[0]];
    while (up.at(-1)! < BRUSH_SIZES.at(-1)!) up.push(stepBrushSize(up.at(-1)!, 1));
    expect(up).toEqual(BRUSH_SIZES);
    const down = [BRUSH_SIZES.at(-1)!];
    while (down.at(-1)! > BRUSH_SIZES[0]) down.push(stepBrushSize(down.at(-1)!, -1));
    expect(down).toEqual([...BRUSH_SIZES].reverse());
  });

  it('takes finer steps for smaller brushes', () => {
    expect(stepBrushSize(5, 1)).toBe(6);
    expect(stepBrushSize(12, 1)).toBe(14);
    expect(stepBrushSize(30, 1)).toBe(35);
  });

  it('stops at the ends', () => {
    expect(stepBrushSize(2, -1)).toBe(2);
    expect(stepBrushSize(40, 1)).toBe(40);
  });

  it('moves a size set with the slider onto the nearest step', () => {
    expect(stepBrushSize(13, 1)).toBe(14);
    expect(stepBrushSize(13, -1)).toBe(12);
    expect(stepBrushSize(23, 1)).toBe(25);
    expect(stepBrushSize(23, -1)).toBe(20);
  });
});

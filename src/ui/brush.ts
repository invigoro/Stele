import { extendStroke, MAX_STROKES, paintKinds, quantize, type PaintKind, type Stroke } from '../damage/paint';
import { MEDIA } from '../media/media';
import type { Placement } from '../render/display';
import { imageSize } from '../render/renderer';
import type { Scene } from '../scene';
import type { Settings } from '../settings';
import type { Store } from './store';

/** The damage brush: which kind it paints (null when off) and its diameter in mm. */
export interface BrushState {
  tool: PaintKind | null;
  size: number;
}

/** Brush sizes, mm, that [ and ] step through: finer steps for small brushes, as in Photoshop. */
export const BRUSH_SIZES: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40];

/** The next brush size up or down from `size`, stopping at the ends. */
export function stepBrushSize(size: number, direction: 1 | -1): number {
  if (direction > 0) return BRUSH_SIZES.find((step) => step > size) ?? BRUSH_SIZES[BRUSH_SIZES.length - 1];
  return BRUSH_SIZES.findLast((step) => step < size) ?? BRUSH_SIZES[0];
}

/** Whether keys pressed in an element type into it, so shortcuts should leave them alone. */
export function typesText(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !['range', 'checkbox', 'radio', 'button', 'color'].includes(target.type);
  return target instanceof HTMLElement && target.isContentEditable;
}

/** What's on the preview canvas, for turning pointer positions into object positions. */
export interface View {
  scene: Scene;
  pxPerMm: number;
  placement: Placement;
}

/**
 * Converts a position on the canvas (in canvas pixels) to one on the object, as
 * fractions of its width and height.
 */
export function canvasToObject(view: View, x: number, y: number): [number, number] {
  const { scene, pxPerMm, placement } = view;
  const image = imageSize(scene, pxPerMm);
  const mmX = (((x - placement.x) / placement.width) * image.width) / pxPerMm - scene.margin;
  const mmY = (((y - placement.y) / placement.height) * image.height) / pxPerMm - scene.margin;
  return [mmX / scene.width, mmY / scene.height];
}

/** Canvas pixels per mm of the object as shown. */
export function shownPxPerMm(view: View): number {
  return (view.placement.width / imageSize(view.scene, view.pxPerMm).width) * view.pxPerMm;
}

/**
 * Lets the user paint damage onto the preview: drag to paint with the current brush,
 * with a circle showing its size. Strokes go into the settings, on `page`. Ctrl/Cmd+Z
 * undoes a stroke, and [ and ] make the brush smaller and larger.
 */
export function attachBrush(options: {
  canvas: HTMLCanvasElement;
  cursor: HTMLElement;
  brush: Store<BrushState>;
  store: Store<Settings>;
  view: () => View | null;
  page: () => number;
}): void {
  const { canvas, cursor, brush, store, view, page } = options;
  let painting: number | null = null;
  // Where the pointer is over the canvas, if it is, for drawing the brush's circle.
  let pointer: { clientX: number; clientY: number } | null = null;

  const canvasPoint = (event: PointerEvent): [number, number] => {
    const box = canvas.getBoundingClientRect();
    return [
      (event.clientX - box.left) * (canvas.width / box.width),
      (event.clientY - box.top) * (canvas.height / box.height),
    ];
  };

  const showCursor = () => {
    const current = view();
    const { tool, size } = brush.get();
    if (!pointer || !tool || !current) {
      cursor.hidden = true;
      return;
    }
    const box = canvas.getBoundingClientRect();
    const cssPerCanvasPx = box.width / canvas.width;
    const diameter = size * shownPxPerMm(current) * cssPerCanvasPx;
    cursor.hidden = false;
    cursor.style.width = cursor.style.height = `${diameter}px`;
    cursor.style.left = `${pointer.clientX - box.left}px`;
    cursor.style.top = `${pointer.clientY - box.top}px`;
  };

  const brushChanged = () => {
    canvas.classList.toggle('painting', brush.get().tool !== null);
    showCursor();
  };
  brush.subscribe(brushChanged);
  brushChanged();

  canvas.addEventListener('pointerdown', (event) => {
    const current = view();
    const { tool, size } = brush.get();
    if (!tool || !current || event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    painting = event.pointerId;
    const [u, v] = canvasToObject(current, ...canvasPoint(event));
    const short = Math.min(current.scene.width, current.scene.height);
    const stroke: Stroke = { kind: tool, radius: size / 2 / short, points: [[quantize(u), quantize(v)]], page: page() };
    store.update((settings) => ({ ...settings, strokes: [...settings.strokes, stroke].slice(-MAX_STROKES) }));
  });

  canvas.addEventListener('pointermove', (event) => {
    pointer = event;
    showCursor();
    const current = view();
    if (painting !== event.pointerId || !current) return;
    const strokes = store.get().strokes;
    const last = strokes.at(-1);
    if (!last) return;
    const next = extendStroke(last, canvasToObject(current, ...canvasPoint(event)), current.scene.width / current.scene.height);
    if (next === last) return;
    store.update((settings) => ({ ...settings, strokes: [...settings.strokes.slice(0, -1), next] }));
  });

  const stop = (event: PointerEvent) => {
    if (painting === event.pointerId) painting = null;
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('pointerleave', () => {
    pointer = null;
    showCursor();
  });

  window.addEventListener('keydown', (event) => {
    if (typesText(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
      const settings = store.get();
      const undone = undoStroke(settings, page());
      if (undone === settings) return;
      event.preventDefault();
      store.set(undone);
      return;
    }
    // [ and ] resize the brush while one is picked. Cmd+[ (Back, on a Mac) and Ctrl+[ are
    // left alone, but not Ctrl+Alt: that's AltGr, which types [ on some keyboards.
    const direction = key === '[' ? -1 : key === ']' ? 1 : 0;
    if (!direction || !brush.get().tool || event.metaKey || (event.ctrlKey && !event.altKey)) return;
    event.preventDefault();
    brush.update((b) => ({ ...b, size: stepBrushSize(b.size, direction) }));
  });
}

/**
 * Removes the newest stroke on a page, skipping any the medium can't show (moss painted on
 * stone, say, after switching to paper), since undoing those would appear to do nothing.
 */
export function undoStroke(settings: Settings, page: number): Settings {
  const shown = paintKinds(MEDIA[settings.medium]);
  const index = settings.strokes.findLastIndex((stroke) => stroke.page === page && shown.includes(stroke.kind));
  if (index < 0) return settings;
  return { ...settings, strokes: settings.strokes.filter((_, i) => i !== index) };
}

/** Removes every stroke on a page. */
export function clearStrokes(settings: Settings, page: number): Settings {
  return { ...settings, strokes: settings.strokes.filter((stroke) => stroke.page !== page) };
}

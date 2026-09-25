import { extendStroke, MAX_STROKES, paintKinds, quantizeFor, type PaintKind, type Stroke } from '../damage/paint';
import { MEDIA } from '../media/media';
import type { Placement } from '../render/display';
import { imageSize } from '../render/renderer';
import type { Scene } from '../scene';
import type { Settings } from '../settings';
import type { Store } from './store';

/** What dragging on the preview does: paint a kind of damage, draw with the pen, or nothing. */
export interface BrushState {
  tool: PaintKind | 'pen' | null;
  /** The damage brush's diameter, mm. */
  size: number;
  /** The pen's line width, mm. */
  penSize: number;
}

/** Which strokes an undo or clear acts on: lines drawn with the pen, or painted damage. */
export type StrokeGroup = 'pen' | 'damage';

/** Brush sizes, mm, that [ and ] step through: finer steps for small brushes, as in Photoshop. */
export const BRUSH_SIZES: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40];

/** Pen widths, mm, that [ and ] step through. */
export const PEN_SIZES: readonly number[] = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6];

/** The next size up or down from `size` in `sizes`, stopping at the ends. */
export function stepBrushSize(size: number, direction: 1 | -1, sizes: readonly number[] = BRUSH_SIZES): number {
  if (direction > 0) return sizes.find((step) => step > size) ?? sizes[sizes.length - 1];
  return sizes.findLast((step) => step < size) ?? sizes[0];
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

/**
 * Converts a position on the object (fractions of its width and height) to one for a
 * pen line: from its centre, in units of its shorter side.
 */
export function objectToPen(scene: Pick<Scene, 'width' | 'height'>, [u, v]: [number, number]): [number, number] {
  const short = Math.min(scene.width, scene.height);
  return [((u - 0.5) * scene.width) / short, ((v - 0.5) * scene.height) / short];
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
    const { tool, size, penSize } = brush.get();
    if (!pointer || !tool || !current) {
      cursor.hidden = true;
      return;
    }
    const box = canvas.getBoundingClientRect();
    const cssPerCanvasPx = box.width / canvas.width;
    const diameter = (tool === 'pen' ? penSize : size) * shownPxPerMm(current) * cssPerCanvasPx;
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
    const { tool, size, penSize } = brush.get();
    if (!tool || !current || event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    painting = event.pointerId;
    const onObject = canvasToObject(current, ...canvasPoint(event));
    const [u, v] = tool === 'pen' ? objectToPen(current.scene, onObject) : onObject;
    const short = Math.min(current.scene.width, current.scene.height);
    const round = quantizeFor(tool);
    const width = tool === 'pen' ? penSize : size;
    const stroke: Stroke = { kind: tool, radius: width / 2 / short, points: [[round(u), round(v)]], page: page() };
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
    const onObject = canvasToObject(current, ...canvasPoint(event));
    // Pen lines are already in units of the shorter side, so spacing compares directly.
    const next =
      last.kind === 'pen'
        ? extendStroke(last, objectToPen(current.scene, onObject), 1)
        : extendStroke(last, onObject, current.scene.width / current.scene.height);
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
      // Undo what the tool in hand makes, or with none, the last stroke of any kind.
      const settings = store.get();
      const { tool } = brush.get();
      const undone = undoStroke(settings, page(), tool === 'pen' ? 'pen' : tool ? 'damage' : undefined);
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
    brush.update((b) =>
      b.tool === 'pen' ? { ...b, penSize: stepBrushSize(b.penSize, direction, PEN_SIZES) } : { ...b, size: stepBrushSize(b.size, direction) },
    );
  });
}

/** Whether a stroke is one of a group (any stroke, with no group). */
function inGroup(stroke: Stroke, group?: StrokeGroup): boolean {
  return group === undefined || (stroke.kind === 'pen') === (group === 'pen');
}

/**
 * Removes the newest stroke on a page (of a group, if given), skipping painted damage
 * the medium can't show (moss painted on stone, say, after switching to paper), since
 * undoing that would appear to do nothing.
 */
export function undoStroke(settings: Settings, page: number, group?: StrokeGroup): Settings {
  const shown: readonly string[] = [...paintKinds(MEDIA[settings.medium]), 'pen'];
  const index = settings.strokes.findLastIndex(
    (stroke) => stroke.page === page && inGroup(stroke, group) && shown.includes(stroke.kind),
  );
  if (index < 0) return settings;
  return { ...settings, strokes: settings.strokes.filter((_, i) => i !== index) };
}

/** Removes every stroke on a page (of a group, if given). */
export function clearStrokes(settings: Settings, page: number, group?: StrokeGroup): Settings {
  return { ...settings, strokes: settings.strokes.filter((stroke) => stroke.page !== page || !inGroup(stroke, group)) };
}

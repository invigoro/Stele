import { extendStroke, MAX_STROKES, quantize, type PaintKind, type Stroke } from '../damage/paint';
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
 * with a circle showing its size. Strokes go into the settings, on `page`.
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

  const canvasPoint = (event: PointerEvent): [number, number] => {
    const box = canvas.getBoundingClientRect();
    return [
      (event.clientX - box.left) * (canvas.width / box.width),
      (event.clientY - box.top) * (canvas.height / box.height),
    ];
  };

  const showCursor = (event: PointerEvent | null) => {
    const current = view();
    const { tool, size } = brush.get();
    if (!event || !tool || !current) {
      cursor.hidden = true;
      return;
    }
    const box = canvas.getBoundingClientRect();
    const cssPerCanvasPx = box.width / canvas.width;
    const diameter = size * shownPxPerMm(current) * cssPerCanvasPx;
    cursor.hidden = false;
    cursor.style.width = cursor.style.height = `${diameter}px`;
    cursor.style.left = `${event.clientX - box.left}px`;
    cursor.style.top = `${event.clientY - box.top}px`;
  };

  const updateCanvasStyle = () => {
    const active = brush.get().tool !== null;
    canvas.classList.toggle('painting', active);
    if (!active) cursor.hidden = true;
  };
  brush.subscribe(updateCanvasStyle);
  updateCanvasStyle();

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
    showCursor(event);
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
  canvas.addEventListener('pointerleave', () => showCursor(null));
}

/** Removes the newest stroke on a page. */
export function undoStroke(settings: Settings, page: number): Settings {
  const index = settings.strokes.findLastIndex((stroke) => stroke.page === page);
  if (index < 0) return settings;
  return { ...settings, strokes: settings.strokes.filter((_, i) => i !== index) };
}

/** Removes every stroke on a page. */
export function clearStrokes(settings: Settings, page: number): Settings {
  return { ...settings, strokes: settings.strokes.filter((stroke) => stroke.page !== page) };
}

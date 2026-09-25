import { boxFrame, centre, inTurnedBox, normalizeAngle, turn, type Block } from '../blocks';
import { imageSize } from '../render/renderer';
import type { PlacedBlock } from '../scene';
import { updateBlock, type Settings } from '../settings';
import type { Box } from '../text/layout';
import { canvasToObject, shownPxPerMm, typesText, type BrushState, type View } from './brush';
import type { Store } from './store';

/** Smallest a block can be resized to, mm. */
const MIN_SIZE = 3;
/** How near a block (mm) a click still picks it. */
const SLACK = 1.5;

export type Corner = [-1 | 1, -1 | 1];

/**
 * A box (turned by `angle` radians) resized by dragging one corner to `point`, all mm:
 * the opposite corner stays put. `keepShape` keeps its proportions, as pictures do.
 */
export function resizeBox(box: Box, angle: number, [sx, sy]: Corner, point: [number, number], keepShape: boolean): Box {
  const middle = centre(box);
  const local = turn(point, middle, -angle);
  const opposite: [number, number] = [middle[0] - (sx * box.width) / 2, middle[1] - (sy * box.height) / 2];
  let w = Math.max(MIN_SIZE, sx * (local[0] - opposite[0]));
  let h = Math.max(MIN_SIZE, sy * (local[1] - opposite[1]));
  if (keepShape) {
    const s = Math.max(w / box.width, h / box.height);
    [w, h] = [box.width * s, box.height * s];
  }
  const [cx, cy] = turn([opposite[0] + (sx * w) / 2, opposite[1] + (sy * h) / 2], middle, angle);
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

/**
 * How far to turn a box (radians) so its top faces `point`: in steps of 15° with
 * `steps`, and otherwise settling on a right angle when within 4° of one.
 */
export function turnTowards(box: Box, point: [number, number], steps: boolean): number {
  const [cx, cy] = centre(box);
  let degrees = ((Math.atan2(point[1] - cy, point[0] - cx) + Math.PI / 2) * 180) / Math.PI;
  const nearest = Math.round(degrees / 90) * 90;
  if (steps) degrees = Math.round(degrees / 15) * 15;
  else if (Math.abs(degrees - nearest) < 4) degrees = nearest;
  return (normalizeAngle(degrees) * Math.PI) / 180;
}

interface Drag {
  id: string;
  mode: 'move' | 'resize' | 'rotate';
  corner?: Corner;
  /** Where the pointer started, mm. */
  start: [number, number];
  box: Box;
  angle: number;
  /** Pictures keep their shape as they're resized. */
  keepShape: boolean;
  /** A block arranged by the template is placed by hand only once it's actually moved. */
  moved: boolean;
}

/**
 * Lets the user arrange the writing on the preview while no brush or pen is in hand:
 * click a block to pick it, drag it to move it, drag its corners to resize it and its
 * round handle to turn it. Arrow keys nudge it, Delete removes it, Escape lets it go.
 * Returns a function that redraws the frame around the picked block (call it after
 * each render, as the preview may have moved).
 */
export function attachArrange(options: {
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  brush: Store<BrushState>;
  store: Store<Settings>;
  selection: Store<string | null>;
  view: () => View | null;
  /** Called on a double click, to edit a block's text. */
  onEdit: (id: string) => void;
}): () => void {
  const { canvas, stage, brush, store, selection, view, onEdit } = options;

  const frame = document.createElement('div');
  frame.className = 'block-frame';
  frame.hidden = true;
  const handles = new Map<HTMLElement, Drag['mode'] | Corner>();
  for (const corner of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as Corner[]) {
    const handle = document.createElement('span');
    handle.className = 'block-handle';
    handle.style.left = corner[0] < 0 ? '0' : '100%';
    handle.style.top = corner[1] < 0 ? '0' : '100%';
    handle.style.cursor = corner[0] === corner[1] ? 'nwse-resize' : 'nesw-resize';
    handles.set(handle, corner);
    frame.append(handle);
  }
  const stem = document.createElement('span');
  stem.className = 'block-stem';
  const rotator = document.createElement('span');
  rotator.className = 'block-handle rotate';
  rotator.title = 'Drag to turn (Shift: steps of 15°)';
  handles.set(rotator, 'rotate');
  frame.append(stem, rotator);
  stage.append(frame);

  const placedOnPage = (id: string | null): PlacedBlock | undefined =>
    id ? view()?.scene.placed.find((placed) => placed.id === id) : undefined;
  const cssPerCanvasPx = () => canvas.getBoundingClientRect().width / canvas.width;
  /** A point on the object, mm, in CSS pixels from the stage's corner. */
  const toCss = (current: View, [x, y]: [number, number]): [number, number] => {
    const { scene, pxPerMm, placement } = current;
    const image = imageSize(scene, pxPerMm);
    const scale = cssPerCanvasPx();
    return [
      (placement.x + ((x + scene.margin) * pxPerMm * placement.width) / image.width) * scale,
      (placement.y + ((y + scene.margin) * pxPerMm * placement.height) / image.height) * scale,
    ];
  };
  /** A pointer event's position on the object, mm. */
  const toMm = (current: View, event: PointerEvent | MouseEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const [u, v] = canvasToObject(
      current,
      (event.clientX - rect.left) * (canvas.width / rect.width),
      (event.clientY - rect.top) * (canvas.height / rect.height),
    );
    return [u * current.scene.width, v * current.scene.height];
  };

  const show = (box: Box, angle: number) => {
    const current = view();
    if (!current) return;
    const [x, y] = toCss(current, centre(box));
    const perMm = shownPxPerMm(current) * cssPerCanvasPx();
    frame.hidden = false;
    frame.style.left = `${x}px`;
    frame.style.top = `${y}px`;
    frame.style.width = `${box.width * perMm}px`;
    frame.style.height = `${box.height * perMm}px`;
    frame.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  };
  let drag: Drag | null = null;
  // The frame shows once a block has been picked (on the preview or in the list), so the
  // handout first appears as it will look.
  let picked = false;
  const refresh = () => {
    if (drag) return; // the frame follows the pointer meanwhile
    const placed = picked && !brush.get().tool ? placedOnPage(selection.get()) : undefined;
    if (placed) show(placed.box, placed.angle);
    else frame.hidden = true;
  };

  /** Places a block by hand: at `box`, turned by `angle`. */
  const place = (id: string, box: Box, angle: number) => {
    const current = view();
    if (!current) return;
    const { width, height } = current.scene;
    store.update((settings) => updateBlock(settings, id, (block): Block => ({ ...block, frame: boxFrame(box, angle, width, height) })));
    show(box, angle);
  };

  const begin = (event: PointerEvent, target: Element, mode: Drag['mode'], corner?: Corner) => {
    const current = view();
    const id = selection.get();
    const placed = placedOnPage(id);
    if (!current || !id || !placed) return;
    event.preventDefault();
    event.stopPropagation();
    target.setPointerCapture(event.pointerId);
    const block = store.get().blocks.find((b) => b.id === id);
    drag = { id, mode, corner, start: toMm(current, event), box: placed.box, angle: placed.angle, keepShape: block?.kind === 'picture', moved: false };
  };

  const follow = (event: PointerEvent) => {
    const current = view();
    if (!drag || !current) return;
    const point = toMm(current, event);
    const { box, angle, start } = drag;
    if (!drag.moved && Math.hypot(point[0] - start[0], point[1] - start[1]) * shownPxPerMm(current) * cssPerCanvasPx() < 3) return;
    drag.moved = true;
    if (drag.mode === 'move') {
      place(drag.id, { ...box, x: box.x + point[0] - start[0], y: box.y + point[1] - start[1] }, angle);
    } else if (drag.mode === 'rotate') {
      place(drag.id, box, turnTowards(box, point, event.shiftKey));
    } else if (drag.corner) {
      place(drag.id, resizeBox(box, angle, drag.corner, point, drag.keepShape), angle);
    }
  };
  const end = () => {
    drag = null;
    refresh();
  };

  for (const [handle, mode] of handles) {
    handle.addEventListener('pointerdown', (event) =>
      Array.isArray(mode) ? begin(event, handle, 'resize', mode) : begin(event, handle, 'rotate'),
    );
    handle.addEventListener('pointermove', follow);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** The block at a point, topmost (latest) first. */
  const blockAt = (current: View, point: [number, number]) =>
    [...current.scene.placed].reverse().find((placed) => inTurnedBox(point, placed.box, placed.angle, SLACK));

  canvas.addEventListener('pointerdown', (event) => {
    const current = view();
    if (brush.get().tool || !current || event.button !== 0) return;
    const hit = blockAt(current, toMm(current, event));
    selection.set(hit?.id ?? null);
    if (hit) begin(event, canvas, 'move');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (drag) {
      follow(event);
      return;
    }
    const current = view();
    canvas.style.cursor = !brush.get().tool && current && blockAt(current, toMm(current, event)) ? 'move' : '';
  });
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('dblclick', (event) => {
    const current = view();
    const hit = !brush.get().tool && current ? blockAt(current, toMm(current, event)) : undefined;
    if (hit) onEdit(hit.id);
  });

  window.addEventListener('keydown', (event) => {
    const id = selection.get();
    if (!id || brush.get().tool || typesText(event.target)) return;
    const placed = placedOnPage(id);
    if (event.key === 'Escape') {
      selection.set(null);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      store.update((settings) => ({ ...settings, blocks: settings.blocks.filter((block) => block.id !== id) }));
      selection.set(null);
    } else if (placed && event.key.startsWith('Arrow')) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      place(id, { ...placed.box, x: placed.box.x + dx, y: placed.box.y + dy }, placed.angle);
    }
  });

  selection.subscribe((id) => {
    picked = id !== null;
    refresh();
  });
  brush.subscribe(refresh);
  return refresh;
}

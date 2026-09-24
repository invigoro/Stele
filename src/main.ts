import './style.css';
import * as twgl from 'twgl.js';
import { download, renderPng } from './export/exportPng';
import { printImage } from './export/print';
import { DistanceField } from './render/distanceField';
import { present } from './render/display';
import { createContext, Gpu, readGpuInfo, type GpuInfo } from './render/gl';
import { surfaceProgram } from './render/programs';
import { imageSize, SceneRenderer, TRANSPARENT, WHITE } from './render/renderer';
import { MEDIA } from './media/media';
import { buildScene, type Scene } from './scene';
import { defaultSettings, type Settings } from './settings';
import { loadSaved, save, settingsFromUrl, urlHashFor } from './share';
import { FONTS, loadFont, measureFont } from './text/fonts';
import { renderPanel, type PanelActions } from './ui/panel';
import { Store } from './ui/store';

const canvas = element<HTMLCanvasElement>('preview');
const stage = element<HTMLElement>('stage');
const stageMessage = element<HTMLParagraphElement>('stage-message');
const stageStatus = element<HTMLParagraphElement>('stage-status');
const controls = element<HTMLElement>('controls');
const gpuInfoList = element<HTMLDListElement>('gpu-info');

/** Preview renders stay under this many pixels so dragging sliders stays smooth. */
const MAX_PREVIEW_PIXELS = 4_000_000;
const PRINT_DPI = 300;

async function start(): Promise<void> {
  const gl = createContext(canvas);
  showGpuInfo(readGpuInfo(gl));
  const gpu = new Gpu(gl);
  const distanceField = new DistanceField(gpu);
  const preview = new SceneRenderer(gpu, distanceField);
  const initial = (await settingsFromUrl(window.location.hash)) ?? loadSaved() ?? defaultSettings('marble');
  const store = new Store<Settings>(initial);

  const sceneFor = async (settings: Settings): Promise<Scene> => {
    const font = FONTS[settings.font];
    await loadFont(font);
    return buildScene(settings, measureFont(font));
  };

  // Getting a medium's surface shader ready costs about a second the first time: the
  // browser compiles it (which can happen in the background), then the graphics driver
  // finishes compiling it on its first draw (which ties up the GPU). So once the first
  // image is on screen, every shader compiles in the background, and then, while the
  // user is idle, each is drawn once off-screen; switching medium later is instant.
  // Without background compiling, each shader is compiled and drawn on first use.
  let lastInput = performance.now();
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'input', 'change']) {
    window.addEventListener(type, () => (lastInput = performance.now()), { capture: true, passive: true });
  }
  const shown = new Set<string>(); // shaders that have been drawn with
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let backgroundStarted = false;
  const prepareRestInBackground = async () => {
    if (backgroundStarted || !gpu.compilesInBackground) return;
    backgroundStarted = true;
    await sleep(500);
    const media = Object.values(MEDIA);
    for (const medium of media) await gpu.whenReady([surfaceProgram(medium)]);
    for (const medium of media) {
      while (performance.now() - lastInput < 1500 || document.hidden) await sleep(250);
      if (shown.has(medium.shader)) continue;
      if (!preview.warmUp(medium)) return;
      shown.add(medium.shader);
      await sleep(1500); // the GPU is busy for a moment; stay out of its way
    }
  };

  let frame = 0;
  const schedule = () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      void draw();
    });
  };
  // Draws can overlap (one may be waiting for a font or a shader when settings change);
  // only the newest may touch the page.
  let generation = 0;
  const draw = async () => {
    const mine = ++generation;
    const stale = () => mine !== generation;
    const settings = store.get();
    try {
      const scene = await sceneFor(settings);
      if (stale()) return;
      if (!preview.isReady(scene)) {
        // Keep the last image up (the page stays usable) while the shaders finish.
        showStatus(`Preparing ${scene.medium.label.toLowerCase()}…`);
        await preview.whenReady(scene);
        if (stale()) return;
      }
      if (gl.isContextLost()) return;
      twgl.resizeCanvasToDisplaySize(canvas, window.devicePixelRatio);
      const image = preview.render(scene, previewScale(scene), TRANSPARENT);
      present(gpu, image, canvas, backdropColor());
      shown.add(scene.medium.shader);
      showStatus(null);
      showMessage(null);
      requestAnimationFrame(() => requestAnimationFrame(() => void prepareRestInBackground()));
    } catch (error) {
      if (stale()) return;
      console.error(error);
      showStatus(null);
      showMessage(error instanceof Error ? error.message : String(error));
    }
  };

  // Keep the page's URL pointing at the current handout, and remember it for next time.
  let saveTimer = 0;
  const remember = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      const settings = store.get();
      save(settings);
      history.replaceState(null, '', await urlHashFor(settings));
    }, 400);
  };

  /** Runs an action that renders at print size, showing progress on its button. */
  const busy = async (button: HTMLButtonElement, working: string, action: () => Promise<void>) => {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = working;
    try {
      await action();
    } catch (error) {
      console.error(error);
      showMessage(`That didn't work: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      button.disabled = false;
      button.textContent = label;
      schedule();
    }
  };

  const actions: PanelActions = {
    exportPng: (button) =>
      busy(button, 'Rendering…', async () => {
        const settings = store.get();
        const background = settings.transparent ? TRANSPARENT : WHITE;
        const blob = await renderPng(gpu, distanceField, await sceneFor(settings), PRINT_DPI, background);
        download(blob, `stele-${settings.medium}-${settings.seeds.material}.png`);
      }),
    print: (button) =>
      busy(button, 'Preparing…', async () => {
        const scene = await sceneFor(store.get());
        const blob = await renderPng(gpu, distanceField, scene, PRINT_DPI, WHITE);
        await printImage(blob, scene.width + 2 * scene.margin, scene.height + 2 * scene.margin);
      }),
    copyLink: (button) =>
      busy(button, 'Copying…', async () => {
        history.replaceState(null, '', await urlHashFor(store.get()));
        await navigator.clipboard.writeText(window.location.href);
        button.textContent = 'Link copied';
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }),
  };

  renderPanel(controls, store, actions);
  store.subscribe(schedule);
  store.subscribe(remember);
  window.addEventListener('hashchange', async () => {
    const linked = await settingsFromUrl(window.location.hash);
    if (!linked) return;
    store.set(linked);
    renderPanel(controls, store, actions);
  });
  new ResizeObserver(schedule).observe(canvas);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // lets the browser restore the context later
    showMessage('Lost the GPU context. Reload the page if it doesn’t come back.');
  });
  schedule();
}

/** Pixels per mm that fit the whole image in the stage, within the pixel budget. */
function previewScale(scene: Scene): number {
  const padding = 24 * window.devicePixelRatio;
  const total = imageSize(scene, 1);
  let scale = Math.min(
    (canvas.width - 2 * padding) / total.width,
    (canvas.height - 2 * padding) / total.height,
    PRINT_DPI / 25.4,
  );
  const pixels = total.width * total.height * scale * scale;
  if (pixels > MAX_PREVIEW_PIXELS) scale *= Math.sqrt(MAX_PREVIEW_PIXELS / pixels);
  return Math.max(scale, 0.5);
}

/** The stage's CSS background as sRGB 0–1, so the canvas matches it in either theme. */
function backdropColor(): [number, number, number] {
  const [r, g, b] = (getComputedStyle(stage).backgroundColor.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
  return [r / 255, g / 255, b / 255];
}

function showGpuInfo(info: GpuInfo): void {
  const rows: [string, string][] = [
    ['GPU', info.renderer],
    ['Max texture', `${info.maxTextureSize} px (${Math.floor(info.maxTextureSize / 300)} in at 300 DPI)`],
    ['Float targets', info.floatRenderTargets ? 'yes' : 'no'],
    ['Float filtering', info.floatLinearFiltering ? 'yes' : 'no'],
    ['Background compiling', info.parallelCompile ? 'yes' : 'no'],
  ];
  gpuInfoList.replaceChildren(
    ...rows.flatMap(([term, value]) => [textElement('dt', term), textElement('dd', value)]),
  );
}

/** A small note over the preview that doesn't hide it, such as "Preparing sandstone…". */
function showStatus(text: string | null): void {
  stageStatus.textContent = text ?? '';
  stageStatus.hidden = text === null;
}

function showMessage(text: string | null): void {
  stageMessage.textContent = text ?? '';
  stageMessage.hidden = text === null;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`index.html is missing #${id}`);
  return found as T;
}

function textElement(tag: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

start().catch((error: unknown) => {
  console.error(error);
  showMessage(error instanceof Error ? error.message : String(error));
});

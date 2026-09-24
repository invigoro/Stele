import './style.css';
import * as twgl from 'twgl.js';
import { download, renderPng } from './export/exportPng';
import { DistanceField } from './render/distanceField';
import { present } from './render/display';
import { createContext, Gpu, readGpuInfo, type GpuInfo } from './render/gl';
import { imageSize, SceneRenderer, TRANSPARENT } from './render/renderer';
import { buildScene, type Scene } from './scene';
import { defaultSettings, type Settings } from './settings';
import { FONTS, loadFont, measureFont } from './text/fonts';
import { renderPanel } from './ui/panel';
import { Store } from './ui/store';

const canvas = element<HTMLCanvasElement>('preview');
const stage = element<HTMLElement>('stage');
const stageMessage = element<HTMLParagraphElement>('stage-message');
const controls = element<HTMLElement>('controls');
const gpuInfoList = element<HTMLDListElement>('gpu-info');

/** Preview renders stay under this many pixels so dragging sliders stays smooth. */
const MAX_PREVIEW_PIXELS = 4_000_000;
const PRINT_DPI = 300;

function start(): void {
  const gl = createContext(canvas);
  showGpuInfo(readGpuInfo(gl));
  const gpu = new Gpu(gl);
  const distanceField = new DistanceField(gpu);
  const preview = new SceneRenderer(gpu, distanceField);
  const store = new Store<Settings>(defaultSettings('marble'));

  const sceneFor = async (settings: Settings): Promise<Scene> => {
    const font = FONTS[settings.font];
    await loadFont(font);
    return buildScene(settings, measureFont(font));
  };

  let frame = 0;
  const schedule = () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      void draw();
    });
  };
  const draw = async () => {
    const settings = store.get();
    try {
      const scene = await sceneFor(settings);
      if (store.get() !== settings) return schedule(); // changed while the font loaded
      if (gl.isContextLost()) return;
      twgl.resizeCanvasToDisplaySize(canvas, window.devicePixelRatio);
      const image = preview.render(scene, previewScale(scene), TRANSPARENT);
      present(gpu, image, canvas, backdropColor());
      showMessage(null);
    } catch (error) {
      console.error(error);
      showMessage(error instanceof Error ? error.message : String(error));
    }
  };

  renderPanel(controls, store, {
    exportPng: async (button) => {
      const label = button.textContent;
      button.disabled = true;
      button.textContent = 'Rendering…';
      try {
        const settings = store.get();
        const blob = await renderPng(gpu, distanceField, await sceneFor(settings), PRINT_DPI);
        download(blob, `stele-${settings.medium}-${settings.seeds.material}.png`);
      } catch (error) {
        console.error(error);
        showMessage(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        button.disabled = false;
        button.textContent = label;
        schedule();
      }
    },
  });

  store.subscribe(schedule);
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
  ];
  gpuInfoList.replaceChildren(
    ...rows.flatMap(([term, value]) => [textElement('dt', term), textElement('dd', value)]),
  );
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

try {
  start();
} catch (error) {
  console.error(error);
  showMessage(error instanceof Error ? error.message : String(error));
}

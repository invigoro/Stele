import './style.css';
import * as twgl from 'twgl.js';
import { createContext, readGpuInfo, type GpuInfo } from './render/gl';
import { TestPattern } from './render/testPattern';
import { mulberry32, randomSeed } from './util/rng';

const canvas = element<HTMLCanvasElement>('preview');
const stageMessage = element<HTMLParagraphElement>('stage-message');
const seedOutput = element<HTMLOutputElement>('seed');
const rerollButton = element<HTMLButtonElement>('reroll');
const gpuInfoList = element<HTMLDListElement>('gpu-info');

function start(): void {
  const gl = createContext(canvas);
  showGpuInfo(readGpuInfo(gl));

  let pattern = new TestPattern(gl);
  let seed = seedFromUrl() ?? randomSeed();

  const render = () => {
    if (gl.isContextLost()) return;
    twgl.resizeCanvasToDisplaySize(canvas, Math.min(window.devicePixelRatio, 2));
    const random = mulberry32(seed);
    pattern.draw([random() * 1000, random() * 1000]);
    seedOutput.value = String(seed);
  };

  new ResizeObserver(render).observe(canvas);
  rerollButton.addEventListener('click', () => {
    seed = randomSeed();
    render();
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // lets the browser restore the context later
    showMessage('Lost the GPU context. Waiting for the browser to restore it…');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    pattern = new TestPattern(gl);
    showMessage(null);
    render();
  });
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

/** `?seed=123` pins the seed, for reproducible screenshots and bug reports. */
function seedFromUrl(): number | null {
  const value = new URLSearchParams(window.location.search).get('seed');
  return value !== null && /^\d+$/.test(value) ? Number(value) >>> 0 : null;
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

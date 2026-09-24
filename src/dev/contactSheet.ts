/**
 * Dev-only contact sheet (dev/contact-sheet.html): renders a grid of fade × damage
 * levels for each medium, so a change to a material can be judged at a glance.
 *
 * Query parameters:
 *   medium=marble      only this medium (default: all)
 *   width=320          pixels per cell
 *   seed=1             base seed for every random aspect
 *   fade=0,0.5,1       fade levels (rows)
 *   damage=0,0.5,1     damage levels (columns)
 *   text=…             replace the sample text
 *   variant=…          colour variant, writing method and shape, where the medium
 *   method=…           has them (e.g. variant=nero&method=gilt&shape=tabula)
 *   shape=…
 *   crop=x,y,w,h       instead of a grid, one render at print resolution cropped to this
 *   dpi=300            region (mm, from the object's top-left), at fade[0] and damage[0]
 */
import { DistanceField } from '../render/distanceField';
import { createContext, Gpu } from '../render/gl';
import { imageSize, SceneRenderer, WHITE } from '../render/renderer';
import { MEDIA, isMediumId, type MediumDef, type MediumId } from '../media/media';
import { buildScene } from '../scene';
import { defaultSettings } from '../settings';
import { FONTS, loadFont, measureFont } from '../text/fonts';

const params = new URLSearchParams(window.location.search);
const numbers = (name: string, fallback: number[]) => params.get(name)?.split(',').map(Number) ?? fallback;
const sheet = document.getElementById('sheet') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;

function toCanvas(image: ImageData, crop?: { x: number; y: number; width: number; height: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = crop?.width ?? image.width;
  canvas.height = crop?.height ?? image.height;
  canvas.getContext('2d')?.putImageData(image, -(crop?.x ?? 0), -(crop?.y ?? 0));
  return canvas;
}

function figure(canvas: HTMLCanvasElement, caption: string): HTMLElement {
  const element = document.createElement('figure');
  const label = document.createElement('figcaption');
  label.textContent = caption;
  element.append(canvas, label);
  return element;
}

async function main(): Promise<void> {
  const gpu = new Gpu(createContext(document.createElement('canvas')));
  const renderer = new SceneRenderer(gpu, new DistanceField(gpu));
  const requested = params.get('medium');
  const media: MediumId[] = requested && isMediumId(requested) ? [requested] : (Object.keys(MEDIA) as MediumId[]);
  const seed = Number(params.get('seed') ?? 1);
  const seeds = { material: seed, hand: seed + 1, damage: seed + 2, fade: seed + 3 };
  const fades = numbers('fade', [0, 0.33, 0.66, 1]);
  const damages = numbers('damage', [0, 0.33, 0.66, 1]);
  const cellWidth = Number(params.get('width') ?? 320);

  for (const medium of media) {
    const def: MediumDef = MEDIA[medium];
    const text = params.get('text');
    const base = { ...defaultSettings(medium, seeds), ...(text ? { text, textEdited: true } : {}) };
    const variant = params.get('variant');
    if (variant && variant in def.variants) base.variant = variant;
    const method = params.get('method');
    if (method && (def.methods as string[]).includes(method)) base.method = method as typeof base.method;
    const shape = params.get('shape');
    if (shape && (def.shapes as string[]).includes(shape)) base.shape = shape as typeof base.shape;
    const font = FONTS[base.font];
    await loadFont(font);
    const measure = measureFont(font);
    const heading = document.createElement('h2');
    heading.textContent = `${def.label} · ${def.variants[base.variant].label} · ${base.method} · ${base.shape}`;
    sheet.append(heading);

    const crop = params.get('crop')?.split(',').map(Number);
    if (crop) {
      const dpi = Number(params.get('dpi') ?? 300);
      const pxPerMm = dpi / 25.4;
      const scene = buildScene({ ...base, fade: fades[0], damage: damages[0] }, measure);
      renderer.render(scene, pxPerMm, WHITE);
      const [x, y, width, height] = crop.map((mm, i) => Math.round((mm + (i < 2 ? scene.margin : 0)) * pxPerMm));
      sheet.append(figure(toCanvas(renderer.readPixels(), { x, y, width, height }), `${dpi} DPI crop ${crop.join(', ')} mm`));
      continue;
    }

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.gridTemplateColumns = `repeat(${damages.length}, ${cellWidth}px)`;
    sheet.append(grid);
    for (const fade of fades) {
      for (const damage of damages) {
        const scene = buildScene({ ...base, fade, damage }, measure);
        renderer.render(scene, cellWidth / imageSize(scene, 1).width, WHITE);
        grid.append(figure(toCanvas(renderer.readPixels()), `fade ${fade} · damage ${damage}`));
      }
    }
  }
  status.textContent = 'Done';
  document.body.dataset.done = 'true';
}

main().catch((error: unknown) => {
  console.error(error);
  status.textContent = `Failed: ${error instanceof Error ? error.message : String(error)}`;
});

import type { Gpu } from './gl';
import { shaderSource } from './shaders';
import { createTarget, deleteTarget, type Target } from './targets';

/** Step sizes for jump flooding an image of the given size, plus one extra 1-step pass. */
export function jumpFloodSteps(width: number, height: number): number[] {
  const steps: number[] = [];
  for (let step = 2 ** Math.ceil(Math.log2(Math.max(width, height, 2))) / 2; step >= 1; step /= 2) {
    steps.push(step);
  }
  // A final extra pass at step 1 ("JFA+1") fixes most of jump flooding's rare misses.
  steps.push(1);
  return steps;
}

/**
 * Signed distance to the nearest letter edge, computed on the GPU with the jump
 * flood algorithm: ~log2(size) passes, each looking at 9 pixels.
 */
export class DistanceField {
  private readonly gpu: Gpu;
  private scratch: [Target, Target] | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
  }

  /** Reads coverage from `mask`'s red channel and writes millimetres into `out` (r16f). */
  compute(mask: WebGLTexture, out: Target, mmPerPx: number): void {
    const { gpu } = this;
    let [source, destination] = this.scratchFor(out.width, out.height);

    gpu.draw(gpu.program('jfa-init', () => shaderSource('jfa-init.frag')), source, { u_mask: mask });
    const step = gpu.program('jfa-step', () => shaderSource('jfa-step.frag'));
    for (const size of jumpFloodSteps(out.width, out.height)) {
      gpu.draw(step, destination, { u_seeds: source.texture, u_step: size });
      [source, destination] = [destination, source];
    }
    gpu.draw(gpu.program('jfa-distance', () => shaderSource('jfa-distance.frag')), out, {
      u_seeds: source.texture,
      u_mask: mask,
      u_mmPerPx: mmPerPx,
    });
  }

  /** Frees the scratch buffers (about 16 bytes per pixel) until the next compute. */
  release(): void {
    if (!this.scratch) return;
    for (const target of this.scratch) deleteTarget(this.gpu.gl, target);
    this.scratch = null;
  }

  private scratchFor(width: number, height: number): [Target, Target] {
    if (this.scratch && (this.scratch[0].width !== width || this.scratch[0].height !== height)) {
      this.release();
    }
    this.scratch ??= [
      createTarget(this.gpu.gl, width, height, 'rg32f'),
      createTarget(this.gpu.gl, width, height, 'rg32f'),
    ];
    return this.scratch;
  }
}

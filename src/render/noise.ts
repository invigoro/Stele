import { mulberry32 } from '../util/rng';
import type { Gpu } from './gl';
import { NOISE_TEXTURE } from './programs';
import { createTarget, type Target } from './targets';

/**
 * Texels per noise cell. Enough that filtering between texels is smooth even when a
 * cell spans many pixels (the slope error of linear filtering stays around 10%, which
 * on the shallow relief noise is used for is invisible).
 */
export const TEXELS_PER_CELL = 32;

/** Side of the random-bytes texture that cellular noise reads, one texel per cell. */
export const RANDOM_SIZE = 256;

/**
 * Noise read from textures instead of computed: shader compilers inline every call,
 * and computed noise made the big surface shaders slow to compile.
 */
export interface NoiseTextures {
  /** Smooth tiling gradient noise, for lib/noise.glsl. */
  noise: WebGLTexture;
  /** Noise cells across the noise texture, before it repeats. */
  period: number;
  /** Fixed random bytes, for lib/cellular.glsl. */
  random: WebGLTexture;
}

/** The same random bytes every time, so a given seed always renders the same image. */
export function randomBytes(size: number): Uint8Array {
  const random = mulberry32(0x5e1e);
  return Uint8Array.from({ length: size * size * 4 }, () => Math.floor(random() * 256));
}

const baked = new WeakMap<Gpu, NoiseTextures>();

/** The noise textures, made once per GPU context. */
export function noiseTextures(gpu: Gpu): NoiseTextures {
  let textures = baked.get(gpu);
  if (!textures) {
    const { gl } = gpu;
    const size = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
    const period = size / TEXELS_PER_CELL;
    const target: Target = createTarget(gl, size, size, 'r16f');
    gpu.draw(NOISE_TEXTURE, target, { u_size: [size, size], u_period: period });
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.deleteFramebuffer(target.framebuffer);

    const random = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, random);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, RANDOM_SIZE, RANDOM_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, randomBytes(RANDOM_SIZE));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    textures = { noise: target.texture, period, random };
    baked.set(gpu, textures);
  }
  return textures;
}

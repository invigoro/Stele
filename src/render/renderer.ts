import { FEATURE_ROWS, MAX_FEATURES, packFeatures } from '../damage/features';
import { lightDirection } from '../media/media';
import type { Scene } from '../scene';
import { rasterizeText } from '../text/rasterize';
import type { DistanceField } from './distanceField';
import type { Gpu } from './gl';
import { shaderSource, surfaceShader } from './shaders';
import {
  createMultiTarget,
  createTarget,
  deleteTarget,
  uploadCanvas,
  uploadFloatData,
  type MultiTarget,
  type Target,
} from './targets';

/** Straight-alpha RGBA, 0–1. */
export type Rgba = readonly [number, number, number, number];

export const TRANSPARENT: Rgba = [0, 0, 0, 0];
export const WHITE: Rgba = [1, 1, 1, 1];

/** Pixel size of the image for a scene at a given resolution. */
export function imageSize(scene: Scene, pxPerMm: number): { width: number; height: number } {
  return {
    width: Math.ceil((scene.width + 2 * scene.margin) * pxPerMm),
    height: Math.ceil((scene.height + 2 * scene.margin) * pxPerMm),
  };
}

/**
 * Renders scenes into an image texture, redoing only the stages whose inputs changed:
 * text rasterizing and the distance field only when the text or size does.
 */
export class SceneRenderer {
  private readonly gpu: Gpu;
  private readonly distanceField: DistanceField;
  private readonly maskCanvas = document.createElement('canvas');
  private mask: WebGLTexture | null = null;
  private features: WebGLTexture | null = null;
  private targets: { distance: Target; surface: MultiTarget; output: Target } | null = null;
  private maskKey = '';
  private featuresKey = '';

  constructor(gpu: Gpu, distanceField: DistanceField) {
    this.gpu = gpu;
    this.distanceField = distanceField;
  }

  render(scene: Scene, pxPerMm: number, background: Rgba): Target {
    const { gpu } = this;
    const { gl } = gpu;
    const { width, height } = imageSize(scene, pxPerMm);
    const targets = this.targetsFor(width, height);
    const originMm: [number, number] = [-scene.margin, -scene.margin];

    const maskKey = JSON.stringify([scene.font.family, scene.drawing, width, height, pxPerMm]);
    if (maskKey !== this.maskKey || !this.mask) {
      rasterizeText(scene.drawing, scene.font, { originMm, pxPerMm, width, height }, this.maskCanvas);
      this.mask = uploadCanvas(gl, this.mask, this.maskCanvas);
      this.distanceField.compute(this.mask, targets.distance, 1 / pxPerMm);
      this.maskKey = maskKey;
    }

    const packed = packFeatures(scene.chips, scene.stains);
    const featuresKey = JSON.stringify([scene.chips, scene.stains]);
    if (featuresKey !== this.featuresKey || !this.features) {
      this.features = uploadFloatData(gl, this.features, packed.data, MAX_FEATURES, FEATURE_ROWS);
      this.featuresKey = featuresKey;
    }

    const { medium } = scene;
    gpu.draw(gpu.program(`surface:${medium.shader}`, () => surfaceShader(medium.shader)), targets.surface, {
      u_sizeMm: [scene.width, scene.height],
      u_originMm: originMm,
      u_pxPerMm: pxPerMm,
      u_materialSeed: scene.offsets.material,
      u_fadeSeed: scene.offsets.fade,
      u_damageSeed: scene.offsets.damage,
      u_fade: scene.fade,
      u_damage: scene.damage,
      u_textSize: scene.drawing.runs.length > 0 ? scene.drawing.size : 0,
      u_textDistance: targets.distance.texture,
      u_textMask: this.mask,
      u_features: this.features,
      u_chipCount: packed.chipCount,
      u_stainCount: packed.stainCount,
    });

    const { light } = medium;
    const direction = lightDirection(light);
    // Look far enough toward the lamp to catch shadows from the deepest relief.
    const relief = 0.15 * scene.drawing.size + (scene.chips.length > 0 ? 6 : 0.5);
    const shadowReach = Math.min(30, relief / Math.tan((light.elevation * Math.PI) / 180));
    gpu.draw(gpu.program('shade', () => shaderSource('shade.frag')), targets.output, {
      u_surface: targets.surface.textures[0],
      u_albedo: targets.surface.textures[1],
      u_pxPerMm: pxPerMm,
      u_lightDir: direction,
      u_ambient: light.ambient,
      u_diffuse: light.diffuse,
      u_specular: light.specular,
      u_shininess: light.shininess,
      u_shadowReach: shadowReach,
      u_background: background,
    });
    return targets.output;
  }

  /** Reads the last rendered image back as straight-alpha RGBA rows, top row first. */
  readPixels(): ImageData {
    if (!this.targets) throw new Error('Nothing has been rendered yet');
    const { gl } = this.gpu;
    const { output } = this.targets;
    const pixels = new Uint8ClampedArray(output.width * output.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
    gl.readPixels(0, 0, output.width, output.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return new ImageData(pixels, output.width, output.height);
  }

  dispose(): void {
    const { gl } = this.gpu;
    this.releaseTargets();
    if (this.mask) gl.deleteTexture(this.mask);
    if (this.features) gl.deleteTexture(this.features);
    this.mask = null;
    this.features = null;
    this.maskKey = '';
    this.featuresKey = '';
  }

  private targetsFor(width: number, height: number) {
    if (this.targets && (this.targets.output.width !== width || this.targets.output.height !== height)) {
      this.releaseTargets();
    }
    if (!this.targets) {
      const { gl } = this.gpu;
      this.targets = {
        distance: createTarget(gl, width, height, 'r16f'),
        surface: createMultiTarget(gl, width, height, ['rgba16f', 'rgba8']),
        output: createTarget(gl, width, height, 'rgba8'),
      };
      this.maskKey = ''; // the distance field must be recomputed into the new target
    }
    return this.targets;
  }

  private releaseTargets(): void {
    if (!this.targets) return;
    const { gl } = this.gpu;
    deleteTarget(gl, this.targets.distance);
    deleteTarget(gl, this.targets.surface);
    deleteTarget(gl, this.targets.output);
    this.targets = null;
  }
}

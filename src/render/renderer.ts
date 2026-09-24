import { FEATURE_ROWS, MAX_FEATURES, packFeatures } from '../damage/features';
import { rasterizeCracks } from '../damage/rasterizeCracks';
import { lightDirection } from '../media/media';
import { shapeParams, SHAPES } from '../media/shapes';
import { WRITING_CODES } from '../media/writing';
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

interface Targets {
  distance: Target;
  cracks: Target;
  surface: MultiTarget;
  output: Target;
}

/**
 * Renders scenes into an image texture, redoing only the stages whose inputs changed:
 * text and cracks are rasterized, and their distance fields computed, only when they
 * or the image size change.
 */
export class SceneRenderer {
  private readonly gpu: Gpu;
  private readonly distanceField: DistanceField;
  private readonly canvas = document.createElement('canvas');
  private mask: WebGLTexture | null = null;
  private crackMask: WebGLTexture | null = null;
  private features: WebGLTexture | null = null;
  private targets: Targets | null = null;
  private keys = { mask: '', cracks: '', features: '' };

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
    const raster = { originMm, pxPerMm, width, height };

    const maskKey = JSON.stringify([scene.font.family, scene.drawing, width, height, pxPerMm]);
    if (maskKey !== this.keys.mask || !this.mask) {
      rasterizeText(scene.drawing, scene.font, raster, this.canvas);
      this.mask = uploadCanvas(gl, this.mask, this.canvas);
      this.distanceField.compute(this.mask, targets.distance, 1 / pxPerMm);
      this.keys.mask = maskKey;
    }

    const hasCracks = scene.cracks.length > 0;
    const cracksKey = JSON.stringify([scene.cracks, width, height, pxPerMm]);
    if (hasCracks && cracksKey !== this.keys.cracks) {
      rasterizeCracks(scene.cracks, raster, this.canvas);
      this.crackMask = uploadCanvas(gl, this.crackMask, this.canvas);
      this.distanceField.compute(this.crackMask, targets.cracks, 1 / pxPerMm);
      this.keys.cracks = cracksKey;
    }

    const packed = packFeatures(scene.features);
    const featuresKey = JSON.stringify(scene.features);
    if (featuresKey !== this.keys.features || !this.features) {
      this.features = uploadFloatData(gl, this.features, packed.data, MAX_FEATURES, FEATURE_ROWS);
      this.keys.features = featuresKey;
    }

    const { medium, method, fields } = scene;
    const color = method.color ?? [0, 0, 0];
    gpu.draw(gpu.program(`surface:${medium.shader}`, () => surfaceShader(medium.shader)), targets.surface, {
      u_sizeMm: [scene.width, scene.height],
      u_originMm: originMm,
      u_pxPerMm: pxPerMm,
      u_materialSeed: scene.offsets.material,
      u_fadeSeed: scene.offsets.fade,
      u_damageSeed: scene.offsets.damage,
      u_fade: scene.fade,
      u_textSize: scene.drawing.runs.length > 0 ? scene.drawing.size : 0,
      u_palette: scene.palette.flat(),
      u_grain: medium.grain ?? 0,
      u_writing: WRITING_CODES[method.kind],
      u_flatCut: method.flat ? 1 : 0,
      u_fill: method.fill ? 1 : 0,
      u_gilt: method.gilt ? 1 : 0,
      u_writingColor: color,
      u_writingAged: method.aged ?? color,
      u_shape: SHAPES[scene.shape].code,
      u_shapeParams: shapeParams(scene.shape, scene.width, scene.height),
      u_textDistance: targets.distance.texture,
      u_textMask: this.mask,
      u_features: this.features,
      u_chipCount: packed.counts.chips,
      u_stainCount: packed.counts.stains,
      u_holeCount: packed.counts.holes,
      u_burnCount: packed.counts.burns,
      u_tearCount: packed.counts.tears,
      u_foldCount: packed.counts.folds,
      u_smudgeCount: packed.counts.smudges,
      u_cutCount: packed.counts.cuts,
      u_crackDistance: targets.cracks.texture,
      u_hasCracks: hasCracks ? 1 : 0,
      u_soot: fields.soot,
      u_lichen: fields.lichen,
      u_pitting: fields.pitting,
      u_flaking: fields.flaking,
      u_rot: fields.rot,
      u_foxing: fields.foxing,
      u_fraying: fields.fraying,
      u_darkening: fields.darkening,
    });

    const { light } = scene;
    // Look far enough toward the lamp to catch shadows from the deepest relief.
    const deepDamage = scene.features.chips.length > 0 || scene.features.cuts.length > 0 || fields.flaking > 0;
    const relief = 0.15 * scene.drawing.size + (deepDamage ? 6 : 1) + (hasCracks ? 2.5 : 0);
    const shadowReach = Math.min(30, relief / Math.tan((light.elevation * Math.PI) / 180));
    gpu.draw(gpu.program('shade', () => shaderSource('shade.frag')), targets.output, {
      u_surface: targets.surface.textures[0],
      u_albedo: targets.surface.textures[1],
      u_pxPerMm: pxPerMm,
      u_lightDir: lightDirection(light),
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
    for (const texture of [this.mask, this.crackMask, this.features]) if (texture) gl.deleteTexture(texture);
    this.mask = null;
    this.crackMask = null;
    this.features = null;
    this.keys = { mask: '', cracks: '', features: '' };
  }

  private targetsFor(width: number, height: number): Targets {
    if (this.targets && (this.targets.output.width !== width || this.targets.output.height !== height)) {
      this.releaseTargets();
    }
    if (!this.targets) {
      const { gl } = this.gpu;
      this.targets = {
        distance: createTarget(gl, width, height, 'r16f'),
        cracks: createTarget(gl, width, height, 'r16f'),
        surface: createMultiTarget(gl, width, height, ['rgba16f', 'rgba8']),
        output: createTarget(gl, width, height, 'rgba8'),
      };
      // The distance fields must be recomputed into the new targets.
      this.keys.mask = '';
      this.keys.cracks = '';
    }
    return this.targets;
  }

  private releaseTargets(): void {
    if (!this.targets) return;
    const { gl } = this.gpu;
    for (const target of Object.values(this.targets)) deleteTarget(gl, target);
    this.targets = null;
  }
}

import * as twgl from 'twgl.js';
import { shaderSource } from './shaders';
import type { MultiTarget, Target } from './targets';

export class WebGL2UnavailableError extends Error {
  constructor() {
    super('Stele needs WebGL2, which this browser or device doesn’t support.');
    this.name = 'WebGL2UnavailableError';
  }
}

export interface GpuInfo {
  renderer: string;
  /** Largest texture side in pixels; caps the print size at a given DPI. */
  maxTextureSize: number;
  /** Rendering to float textures (EXT_color_buffer_float), for height and distance-field passes. */
  floatRenderTargets: boolean;
  /** Linear filtering of 32-bit float textures (OES_texture_float_linear). */
  floatLinearFiltering: boolean;
}

export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
  if (!gl) throw new WebGL2UnavailableError();
  return gl;
}

export function readGpuInfo(gl: WebGL2RenderingContext): GpuInfo {
  return {
    renderer: rendererName(gl),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    floatRenderTargets: gl.getExtension('EXT_color_buffer_float') !== null,
    floatLinearFiltering: gl.getExtension('OES_texture_float_linear') !== null,
  };
}

function rendererName(gl: WebGL2RenderingContext): string {
  // Firefox reports the real renderer directly (and warns if the debug extension is
  // used); Chrome and Safari report "WebKit WebGL" unless asked through the extension.
  const reported: string = gl.getParameter(gl.RENDERER);
  if (reported !== 'WebKit WebGL') return reported;
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  return debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : reported;
}

/** Compiles and links a vertex + fragment shader pair given as source code. */
export function createProgram(
  gl: WebGL2RenderingContext,
  name: string,
  vertexSource: string,
  fragmentSource: string,
): twgl.ProgramInfo {
  const errors: string[] = [];
  const program = twgl.createProgramInfo(gl, [vertexSource, fragmentSource], {
    errorCallback: (message: string) => errors.push(message),
  });
  // twgl returns null (despite its typings) when compiling or linking fails.
  if (!program) throw new Error(`Could not build shader ${name}:\n${errors.join('\n')}`);
  return program;
}

/** Holds the WebGL2 context and every compiled fullscreen-pass program. */
export class Gpu {
  readonly gl: WebGL2RenderingContext;
  private readonly programs = new Map<string, twgl.ProgramInfo>();
  private readonly vertexSource = shaderSource('fullscreen.vert');

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    // Needed for the float render targets that hold heights and distances.
    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('Stele needs float render targets (EXT_color_buffer_float), which this GPU lacks.');
    }
  }

  /** A fullscreen-pass program, compiled on first use. `source` gives the fragment shader. */
  program(name: string, source: () => string): twgl.ProgramInfo {
    let program = this.programs.get(name);
    if (!program) {
      program = createProgram(this.gl, name, this.vertexSource, source());
      this.programs.set(name, program);
    }
    return program;
  }

  /**
   * Runs a fullscreen pass into `target` (null draws to the canvas; then `viewport`
   * picks the area, in canvas pixels with the origin at the bottom left).
   */
  draw(
    program: twgl.ProgramInfo,
    target: Target | MultiTarget | null,
    uniforms: Record<string, unknown>,
    viewport?: readonly [number, number, number, number],
  ): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    if (target) gl.viewport(0, 0, target.width, target.height);
    else if (viewport) gl.viewport(...viewport);
    gl.useProgram(program.program);
    twgl.setUniforms(program, uniforms);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    for (const program of this.programs.values()) this.gl.deleteProgram(program.program);
    this.programs.clear();
  }
}

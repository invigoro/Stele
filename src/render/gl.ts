import * as twgl from 'twgl.js';
import type { ProgramSpec } from './programs';
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
  /** Shaders compile on worker threads without freezing the page (KHR_parallel_shader_compile). */
  parallelCompile: boolean;
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
    parallelCompile: gl.getExtension('KHR_parallel_shader_compile') !== null,
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

/** Appends the source lines that a compiler log's "0:<line>:" references point at. */
function withSourceLines(log: string, source: string): string {
  const lines = source.split('\n');
  const quoted = [...new Set([...log.matchAll(/\b0:(\d+):/g)].map((m) => Number(m[1])))]
    .slice(0, 5)
    .map((n) => `${n}: ${lines[n - 1]?.trim() ?? ''}`);
  return quoted.length ? `${log}\n${quoted.join('\n')}` : log;
}

interface Compiling {
  program: WebGLProgram;
  shaders: { shader: WebGLShader; source: string }[];
}

/**
 * Holds the WebGL2 context and every fullscreen-pass program. Compiling a big shader
 * takes over a second on some systems (Direct3D inlines every noise call), so programs
 * can be compiled in the background: prepare() starts one, whenReady() waits for it
 * without blocking, and program() gets it, finishing the compile first if need be.
 */
export class Gpu {
  readonly gl: WebGL2RenderingContext;
  /** Present when shaders compile on worker threads (KHR_parallel_shader_compile). */
  private readonly parallel: KHR_parallel_shader_compile | null;
  private readonly compiled = new Map<string, twgl.ProgramInfo>();
  private readonly compiling = new Map<string, Compiling>();
  private readonly vertexSource = shaderSource('fullscreen.vert');

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    // Needed for the float render targets that hold heights and distances.
    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('Stele needs float render targets (EXT_color_buffer_float), which this GPU lacks.');
    }
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
  }

  /** Whether programs compile in the background; without it, compiling blocks the page. */
  get compilesInBackground(): boolean {
    return this.parallel !== null;
  }

  /** Starts compiling a program, if it isn't compiled or compiling already. Doesn't wait. */
  prepare(spec: ProgramSpec): void {
    if (this.compiled.has(spec.name) || this.compiling.has(spec.name)) return;
    const { gl } = this;
    const program = gl.createProgram();
    const sources: [number, string][] = [
      [gl.VERTEX_SHADER, this.vertexSource],
      [gl.FRAGMENT_SHADER, spec.source()],
    ];
    const shaders = sources.map(([type, source]) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not create a shader');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
      return { shader, source };
    });
    gl.linkProgram(program);
    this.compiling.set(spec.name, { program, shaders });
  }

  /** Whether a program can be used without waiting for it to compile. */
  isReady(spec: ProgramSpec): boolean {
    if (this.compiled.has(spec.name)) return true;
    const pending = this.compiling.get(spec.name);
    if (!pending || !this.parallel) return false;
    return this.gl.getProgramParameter(pending.program, this.parallel.COMPLETION_STATUS_KHR) === true;
  }

  /** Resolves once all the programs are ready, checking every frame so the page stays responsive. */
  async whenReady(specs: readonly ProgramSpec[]): Promise<void> {
    for (const spec of specs) this.prepare(spec);
    if (this.parallel) {
      while (!specs.every((spec) => this.isReady(spec))) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
    }
    for (const spec of specs) this.program(spec);
  }

  /** A program, ready to draw with. Blocks while it compiles if it isn't ready yet. */
  program(spec: ProgramSpec): twgl.ProgramInfo {
    const ready = this.compiled.get(spec.name);
    if (ready) return ready;
    this.prepare(spec);
    const pending = this.compiling.get(spec.name);
    if (!pending) throw new Error(`Shader ${spec.name} did not start compiling`);
    this.compiling.delete(spec.name);

    const { gl } = this;
    const { program, shaders } = pending;
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const logs = [
        gl.getProgramInfoLog(program) ?? '',
        ...shaders.map(({ shader, source }) => withSourceLines(gl.getShaderInfoLog(shader) ?? '', source)),
      ].filter((log) => log.trim());
      gl.deleteProgram(program);
      for (const { shader } of shaders) gl.deleteShader(shader);
      throw new Error(`Could not build shader ${spec.name}:\n${logs.join('\n')}`);
    }
    for (const { shader } of shaders) {
      gl.detachShader(program, shader);
      gl.deleteShader(shader);
    }
    const info = twgl.createProgramInfoFromProgram(gl, program);
    this.compiled.set(spec.name, info);
    return info;
  }

  /**
   * Runs a fullscreen pass into `target` (null draws to the canvas; then `viewport`
   * picks the area, in canvas pixels with the origin at the bottom left).
   */
  draw(
    spec: ProgramSpec,
    target: Target | MultiTarget | null,
    uniforms: Record<string, unknown>,
    viewport?: readonly [number, number, number, number],
  ): void {
    const { gl } = this;
    const program = this.program(spec);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    if (target) gl.viewport(0, 0, target.width, target.height);
    else if (viewport) gl.viewport(...viewport);
    gl.useProgram(program.program);
    twgl.setUniforms(program, uniforms);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const { gl } = this;
    for (const info of this.compiled.values()) gl.deleteProgram(info.program);
    for (const { program, shaders } of this.compiling.values()) {
      gl.deleteProgram(program);
      for (const { shader } of shaders) gl.deleteShader(shader);
    }
    this.compiled.clear();
    this.compiling.clear();
  }
}

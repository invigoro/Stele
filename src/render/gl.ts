import * as twgl from 'twgl.js';
import { shaderSource } from './shaders';

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
  const gl = canvas.getContext('webgl2', { antialias: false });
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

/** Compiles and links a vertex + fragment pair from src/render/shaders. */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
): twgl.ProgramInfo {
  const errors: string[] = [];
  const program = twgl.createProgramInfo(gl, [shaderSource(vertex), shaderSource(fragment)], {
    errorCallback: (message: string) => errors.push(message),
  });
  // twgl returns null (despite its typings) when compiling or linking fails.
  if (!program) throw new Error(`Could not build ${vertex} + ${fragment}:\n${errors.join('\n')}`);
  return program;
}

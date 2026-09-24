import * as twgl from 'twgl.js';
import { createProgram } from './gl';

/**
 * Phase 0 renderer check: fills the canvas with a seeded procedural marble-like
 * pattern, proving that shader includes, noise and uniforms work on this device.
 */
export class TestPattern {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: twgl.ProgramInfo;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, 'fullscreen.vert', 'test-pattern.frag');
  }

  /** Draws the pattern at a seed-derived offset into noise space. */
  draw(offset: readonly [number, number]): void {
    const { gl, program } = this;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(program.program);
    twgl.setUniforms(program, {
      u_resolution: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      u_offset: offset,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

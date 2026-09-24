import type { MediumDef } from '../media/media';
import { shaderSource, surfaceShader } from './shaders';

/** A fullscreen-pass program: its cache key, and how to build its fragment shader. */
export interface ProgramSpec {
  name: string;
  source: () => string;
}

const file = (name: string): ProgramSpec => ({ name, source: () => shaderSource(name) });

export const BLIT = file('blit.frag');
export const SHADE = file('shade.frag');
export const JFA_INIT = file('jfa-init.frag');
export const JFA_STEP = file('jfa-step.frag');
export const JFA_DISTANCE = file('jfa-distance.frag');
export const NOISE_TEXTURE = file('noise-texture.frag');

/** The small programs every render uses. */
export const COMMON_PROGRAMS: readonly ProgramSpec[] = [JFA_INIT, JFA_STEP, JFA_DISTANCE, SHADE, BLIT];

/** A medium's surface pass (see shaders/media/<shader>.glsl). */
export function surfaceProgram(medium: Pick<MediumDef, 'shader'>): ProgramSpec {
  return { name: `surface:${medium.shader}`, source: () => surfaceShader(medium.shader) };
}

/** Every program needed to render and show a medium. */
export function programsFor(medium: Pick<MediumDef, 'shader'>): ProgramSpec[] {
  return [...COMMON_PROGRAMS, surfaceProgram(medium)];
}

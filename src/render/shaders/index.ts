import { expandIncludes } from './include';

/**
 * Every shader file in this folder, keyed by its path relative to it
 * (e.g. "lib/noise.glsl"). Convention: `.vert` and `.frag` files are entry points
 * that compile on their own; `.glsl` files are libraries that are only included.
 */
const files: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./**/*.{glsl,vert,frag}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([path, source]) => [path.replace(/^\.\//, ''), source]),
);

export const shaderFiles: readonly string[] = Object.keys(files);

/** The named shader with its #includes expanded, ready to compile. */
export function shaderSource(name: string): string {
  return expandIncludes(name, files);
}

/** Expands the #includes of a shader assembled at runtime; paths resolve from this folder. */
export function composeShader(source: string): string {
  return expandIncludes('(composed)', { ...files, '(composed)': source });
}

/** The surface-pass fragment shader for a medium (see media/<medium>.glsl). */
export function surfaceShader(medium: string): string {
  return composeShader(
    [
      '#version 300 es',
      'precision highp float;',
      '#include "surface/common.glsl"',
      `#include "media/${medium}.glsl"`,
      '#include "surface/main.glsl"',
    ].join('\n'),
  );
}

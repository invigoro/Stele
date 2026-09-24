import { expandIncludes } from './include';

/**
 * Every shader file in this folder, keyed by its path relative to it
 * (e.g. "lib/noise2d.glsl"). Convention: `.vert` and `.frag` files are entry points
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

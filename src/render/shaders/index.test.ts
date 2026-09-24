import { describe, expect, it } from 'vitest';
import { MEDIA } from '../../media/media';
import { shaderFiles, shaderSource, surfaceShader } from './index';

const entries = shaderFiles.filter((name) => /\.(vert|frag)$/.test(name));
const libraries = shaderFiles.filter((name) => name.endsWith('.glsl'));

describe('shader files', () => {
  it('are all picked up', () => {
    expect(entries).toEqual(
      expect.arrayContaining(['fullscreen.vert', 'jfa-init.frag', 'jfa-step.frag', 'jfa-distance.frag', 'shade.frag', 'blit.frag']),
    );
    expect(libraries).toEqual(expect.arrayContaining(['lib/noise2d.glsl', 'lib/fbm.glsl', 'surface/common.glsl']));
  });

  it.each(entries)('%s expands and starts with #version 300 es', (name) => {
    const source = shaderSource(name);
    expect(source.split('\n', 1)[0]).toBe('#version 300 es');
    expect(source).not.toMatch(/^\s*#include/m);
  });

  it.each(libraries)('%s expands without a #version line', (name) => {
    expect(shaderSource(name)).not.toMatch(/^\s*#version/m);
  });
});

describe('surfaceShader', () => {
  it.each(Object.values(MEDIA).map((medium) => medium.shader))('assembles the %s surface pass', (medium) => {
    const source = surfaceShader(medium);
    expect(source.split('\n', 1)[0]).toBe('#version 300 es');
    expect(source).toContain('void buildSurface(');
    expect(source).toContain('void main()');
    // Each library appears once even though several files include it.
    expect(source.match(/float snoise\(vec2 v\)/g)).toHaveLength(1);
  });
});

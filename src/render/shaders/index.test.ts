import { describe, expect, it } from 'vitest';
import { shaderFiles, shaderSource } from './index';

const entries = shaderFiles.filter((name) => /\.(vert|frag)$/.test(name));
const libraries = shaderFiles.filter((name) => name.endsWith('.glsl'));

describe('shader files', () => {
  it('are all picked up', () => {
    expect(entries).toEqual(expect.arrayContaining(['fullscreen.vert', 'test-pattern.frag']));
    expect(libraries).toEqual(expect.arrayContaining(['lib/noise2d.glsl', 'lib/fbm.glsl']));
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

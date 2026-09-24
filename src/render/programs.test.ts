import { describe, expect, it } from 'vitest';
import { MEDIA } from '../media/media';
import { randomBytes } from './noise';
import { COMMON_PROGRAMS, NOISE_TEXTURE, programsFor, surfaceProgram } from './programs';

describe('programs', () => {
  it('gives every medium its own surface program', () => {
    const names = Object.values(MEDIA).map((medium) => surfaceProgram(medium).name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('lists everything a render needs, with sources that build', () => {
    const specs = programsFor(MEDIA.marble);
    expect(specs.map((spec) => spec.name)).toEqual([...COMMON_PROGRAMS.map((spec) => spec.name), 'surface:marble']);
    for (const spec of [...specs, NOISE_TEXTURE]) expect(spec.source()).toMatch(/^#version 300 es\n/);
  });
});

describe('randomBytes', () => {
  it('is the same every time, so a seed always renders the same image', () => {
    expect(randomBytes(8)).toEqual(randomBytes(8));
    expect(randomBytes(8)).toHaveLength(8 * 8 * 4);
  });

  it('spreads across the whole byte range', () => {
    const bytes = randomBytes(64);
    const mean = bytes.reduce((sum, b) => sum + b, 0) / bytes.length;
    expect(mean).toBeGreaterThan(120);
    expect(mean).toBeLessThan(135);
    expect(Math.min(...bytes)).toBe(0);
    expect(Math.max(...bytes)).toBe(255);
  });
});

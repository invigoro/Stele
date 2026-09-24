import { describe, expect, it } from 'vitest';
import { applyPreset, PRESETS } from './presets';
import { buildScene } from './scene';
import { sanitizeSettings } from './share';
import type { Measure } from './text/layout';

const mono: Measure = { width: (text) => [...text].length * 0.5, ascent: 0.7, descent: 0.3 };
const seeds = { material: 1, hand: 2, damage: 3, fade: 4 };

describe('presets', () => {
  it.each(PRESETS.map((preset) => [preset.label, preset] as const))('%s is a valid, buildable handout', (_, preset) => {
    const settings = applyPreset(preset, seeds);
    // Every value survives validation unchanged, so nothing in a preset is out of range.
    expect(sanitizeSettings(settings)).toEqual(settings);
    const scene = buildScene(settings, mono);
    expect(scene.drawing.runs.length).toBeGreaterThan(0);
  });

  it('have distinct names', () => {
    expect(new Set(PRESETS.map((preset) => preset.label)).size).toBe(PRESETS.length);
  });
});

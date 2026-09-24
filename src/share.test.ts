import { describe, expect, it } from 'vitest';
import { MEDIA } from './media/media';
import { defaultSettings } from './settings';
import { decodeSettings, encodeSettings, sanitizeSettings, settingsFromUrl, urlHashFor } from './share';

const seeds = { material: 1, hand: 2, damage: 3, fade: 4 };

describe('share links', () => {
  it('round-trip settings through a URL-safe string', async () => {
    const settings = {
      ...defaultSettings('marble', seeds),
      text: 'HERE LIES [[BOB]] · “quoted” ünïcode',
      textEdited: true,
      variant: 'nero',
      method: 'gilt' as const,
      damage: 0.7,
      light: { azimuth: 200, elevation: 30 },
    };
    const encoded = await encodeSettings(settings);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeSettings(encoded)).toEqual(settings);
  });

  it('are short enough to paste around', async () => {
    const encoded = await encodeSettings(defaultSettings('paper', seeds));
    expect(encoded.length).toBeLessThan(600);
  });

  it('read settings from the page hash', async () => {
    const settings = defaultSettings('wood', seeds);
    expect(await settingsFromUrl(await urlHashFor(settings))).toEqual(settings);
    expect(await settingsFromUrl('#other')).toBeNull();
  });

  it('reject garbage', async () => {
    expect(await decodeSettings('not base64 !!!')).toBeNull();
    expect(await decodeSettings(await encodeSettings({ ...defaultSettings('marble', seeds), medium: 'cheese' as never }))).toBeNull();
  });
});

describe('sanitizeSettings', () => {
  it('fills in and clamps bad values from the medium’s defaults', () => {
    const settings = sanitizeSettings({
      medium: 'slate',
      variant: 'tartan',
      method: 'painted-red', // not a slate method
      shape: 'tabula', // not a slate shape
      font: 'comic-sans',
      damage: 7,
      fade: -1,
      textScale: 'big',
      damageMix: { flaking: 3, lichen: 0.2 },
      light: { azimuth: 400, elevation: 'low' },
      seeds: { material: 5.5, hand: 9 },
    });
    expect(settings).not.toBeNull();
    const slate = MEDIA.slate;
    expect(settings!.variant).toBe(Object.keys(slate.variants)[0]);
    expect(settings!.method).toBe(slate.methods[0]);
    expect(settings!.shape).toBe(slate.shapes[0]);
    expect(settings!.font).toBe(slate.font);
    expect([settings!.damage, settings!.fade, settings!.textScale]).toEqual([1, 0, 1]);
    expect(settings!.damageMix).toMatchObject({ flaking: 1, lichen: 0.2 });
    expect(settings!.light).toEqual({ azimuth: 360, elevation: slate.light.elevation });
    expect(settings!.seeds.hand).toBe(9);
    expect(Number.isInteger(settings!.seeds.material)).toBe(true);
  });

  it('needs at least a known medium', () => {
    expect(sanitizeSettings(null)).toBeNull();
    expect(sanitizeSettings({ medium: 'cheese' })).toBeNull();
    expect(sanitizeSettings({ medium: 'paper' })?.medium).toBe('paper');
  });
});

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

  it('starts damage types added since a handout was saved at nothing, so it looks the same', () => {
    const saved = sanitizeSettings({ medium: 'paper', damageMix: { water: 0.7, folds: 0.5 } });
    expect(saved!.damageMix).toMatchObject({ water: 0.7, folds: 0.5, blots: 0 });
    // With no mix at all, the medium's own defaults apply.
    expect(sanitizeSettings({ medium: 'paper' })!.damageMix).toEqual(MEDIA.paper.damage);
  });

  it('keeps a signature to one short line, in a known typeface', () => {
    const settings = sanitizeSettings({ medium: 'paper', signature: '  R.\n Hale  ', signatureFont: 'comic-sans' })!;
    expect(settings.signature).toBe('R. Hale');
    expect(settings.signatureFont).toBe(defaultSettings('paper').signatureFont);
    expect(sanitizeSettings({ medium: 'paper', signature: 'x'.repeat(500) })!.signature).toHaveLength(120);
  });

  it('keeps a linked or uploaded picture, and drops anything else', () => {
    const picture = (src: unknown) => sanitizeSettings({ medium: 'paper', writing: 'picture', picture: { src, use: 'dark', threshold: 7 } })!;
    expect(picture('https://example.com/map.png').picture).toEqual({ src: 'https://example.com/map.png', use: 'dark', threshold: 0.95 });
    expect(picture('upload:abc123').picture?.src).toBe('upload:abc123');
    expect(picture('javascript:alert(1)').picture).toBeNull();
    expect(picture('https://example.com/map.png').writing).toBe('picture');
    expect(sanitizeSettings({ medium: 'paper' })!.writing).toBe('text');
  });

  it('keeps pen lines finely, and their narrow widths', () => {
    const settings = sanitizeSettings({
      medium: 'marble',
      strokes: [
        { kind: 'pen', radius: 0.0006, points: [[0.12345, 0.5]], page: 0 },
        { kind: 'break', radius: 0.02, points: [[0.12345, 0.5]], page: 0 },
      ],
    })!;
    expect(settings.strokes.map((stroke) => [stroke.kind, stroke.radius, stroke.points[0][0]])).toEqual([
      ['pen', 0.0006, 0.1235],
      ['break', 0.02, 0.123],
    ]);
  });

  it('reads handouts saved before scripts existed as Latin', () => {
    expect(sanitizeSettings({ medium: 'clay', font: 'marcellus' })!.script).toBe('latin');
    expect(sanitizeSettings({ medium: 'granite', script: 'futhorc' })!.script).toBe('futhorc');
    expect(sanitizeSettings({ medium: 'granite', script: 'klingon' })!.script).toBe('latin');
  });

  it('needs at least a known medium', () => {
    expect(sanitizeSettings(null)).toBeNull();
    expect(sanitizeSettings({ medium: 'cheese' })).toBeNull();
    expect(sanitizeSettings({ medium: 'paper' })?.medium).toBe('paper');
  });
});

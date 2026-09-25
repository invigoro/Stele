import { describe, expect, it } from 'vitest';
import { MEDIA } from './media/media';
import { mainBlock, type Block, type TextBlock } from './blocks';
import { defaultSettings, newTextBlock, withText, type Settings } from './settings';
import { decodeSettings, encodeSettings, sanitizeSettings, settingsFromUrl, urlHashFor } from './share';

const seeds = { material: 1, hand: 2, damage: 3, fade: 4 };

describe('share links', () => {
  it('round-trip settings through a URL-safe string', async () => {
    const settings = {
      ...withText(defaultSettings('marble', seeds), { text: 'HERE LIES [[BOB]] · “quoted” ünïcode' }),
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

/** The main text block. */
const main = (settings: Settings | null) => mainBlock(settings!.blocks) as TextBlock;

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
    expect(main(settings).font).toBe(slate.font);
    expect([settings!.damage, settings!.fade, main(settings).size]).toEqual([1, 0, 1]);
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

  it('reads an older signature as a signature block: one short line, in a known typeface', () => {
    const settings = sanitizeSettings({ medium: 'paper', signature: '  R.\n Hale  ', signatureFont: 'comic-sans' })!;
    expect(settings.blocks.map((block) => block.role)).toEqual(['main', 'signature']);
    expect(settings.blocks[1]).toMatchObject({ text: 'R. Hale', font: 'mrs-saint-delafield', byHand: true, frame: null });
    const long = sanitizeSettings({ medium: 'paper', signature: 'x'.repeat(500) })!;
    expect((long.blocks[1] as TextBlock).text).toHaveLength(120);
    expect(sanitizeSettings({ medium: 'paper', signature: '' })!.blocks).toHaveLength(1);
  });

  it('reads an older picture as a picture block, keeping links and uploads and dropping anything else', () => {
    const picture = (src: unknown) => sanitizeSettings({ medium: 'paper', writing: 'picture', picture: { src, use: 'dark', threshold: 7 } })!;
    expect(picture('https://example.com/map.png').blocks).toEqual([
      expect.objectContaining({ kind: 'picture', role: 'main', src: 'https://example.com/map.png', use: 'dark', threshold: 0.95 }),
    ]);
    expect(picture('upload:abc123').blocks[0]).toMatchObject({ kind: 'picture', src: 'upload:abc123' });
    expect(picture('javascript:alert(1)').blocks[0].kind).toBe('text');
    expect(sanitizeSettings({ medium: 'paper' })!.blocks.map((block) => block.kind)).toEqual(['text']);
  });

  it('checks blocks from a link', () => {
    const settings = sanitizeSettings({
      medium: 'marble',
      blocks: [
        { id: 'a', kind: 'text', text: 'ONE', flow: true, frame: { cx: 9, cy: 0.5, w: 0.2, h: 0.1, angle: 540 }, font: 'comic-sans' },
        { id: 'a', kind: 'text', text: 'TWO', flow: true, size: 7, page: 500 }, // a repeated id, a second runner-on
        { id: 'p', kind: 'picture', src: 'javascript:alert(1)' },
        { id: 'q', kind: 'picture', src: 'https://example.com/x.png', use: 'sideways', size: 0 },
        { kind: 'sculpture' },
      ],
    })!;
    const [one, two, picture] = settings.blocks as [TextBlock, TextBlock, Block];
    expect(settings.blocks).toHaveLength(3);
    expect(one).toMatchObject({ id: 'a', flow: true, font: MEDIA.marble.font, frame: { cx: 1.5, cy: 0.5, w: 0.2, h: 0.1, angle: 180 } });
    expect(two.id).not.toBe('a');
    expect(two).toMatchObject({ flow: false, size: 1, page: 99, frame: null });
    expect(picture).toMatchObject({ id: 'q', use: 'opaque', size: 0.05 });
  });

  it('round-trips blocks through a link, leaving out the defaults on the way', async () => {
    const settings = { ...defaultSettings('marble', seeds) };
    settings.blocks = [
      ...settings.blocks,
      newTextBlock('extra', 'marble', { text: 'CAPTION', frame: { cx: 0.5, cy: 0.8, w: 0.6, h: 0.1, angle: -12 }, page: 1 }),
    ];
    expect(await decodeSettings(await encodeSettings(settings))).toEqual(settings);
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
    expect(main(sanitizeSettings({ medium: 'clay', font: 'marcellus' })).script).toBe('latin');
    expect(main(sanitizeSettings({ medium: 'granite', script: 'futhorc' })).script).toBe('futhorc');
    expect(main(sanitizeSettings({ medium: 'granite', script: 'klingon' })).script).toBe('latin');
  });

  it('needs at least a known medium', () => {
    expect(sanitizeSettings(null)).toBeNull();
    expect(sanitizeSettings({ medium: 'cheese' })).toBeNull();
    expect(sanitizeSettings({ medium: 'paper' })?.medium).toBe('paper');
  });
});

import { describe, expect, it } from 'vitest';
import { boundingBox, boxFrame, describeBlock, frameBox, inTurnedBox, mainBlock, normalizeAngle, turn } from './blocks';
import { defaultSettings, newSignature, newTextBlock } from './settings';
import { resizeBox, turnTowards } from './ui/arrange';

const close = (actual: number[], expected: number[]) => actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 9));

describe('frames', () => {
  it('turn a box in mm into a frame and back, on any object', () => {
    const box = { x: 30, y: 40, width: 80, height: 20 };
    const frame = boxFrame(box, Math.PI / 6, 240, 160);
    expect(frame).toMatchObject({ w: 0.5, h: 0.125 });
    expect(frame.angle).toBeCloseTo(30, 9);
    const back = frameBox(frame, 240, 160);
    close([back.box.x, back.box.y, back.box.width, back.box.height, back.angle], [30, 40, 80, 20, Math.PI / 6]);
  });

  it('keep their shape on an object of another shape', () => {
    const frame = { cx: 0.5, cy: 0.5, w: 0.4, h: 0.4, angle: 0 };
    for (const [width, height] of [[240, 160], [148, 210]]) {
      const { box } = frameBox(frame, width, height);
      expect(box.width).toBeCloseTo(box.height, 9);
    }
  });

  it('wrap angles into (-180, 180]', () => {
    expect([normalizeAngle(540), normalizeAngle(-190), normalizeAngle(-180), normalizeAngle(45)]).toEqual([180, 170, 180, 45]);
  });
});

describe('turning', () => {
  it('turns points clockwise (y points down)', () => {
    close(turn([10, 0], [0, 0], Math.PI / 2), [0, 10]);
  });

  it('knows what lies in a turned box, and the upright box around it', () => {
    const box = { x: -10, y: -1, width: 20, height: 2 }; // a long thin box round the origin
    expect(inTurnedBox([9, 0], box, 0)).toBe(true);
    expect(inTurnedBox([9, 0], box, Math.PI / 2)).toBe(false);
    expect(inTurnedBox([0, 9], box, Math.PI / 2)).toBe(true);
    close(Object.values(boundingBox(box, Math.PI / 2)), [-1, -10, 2, 20]);
  });
});

describe('arranging on the preview', () => {
  const box = { x: 0, y: 0, width: 40, height: 20 };

  it('resizes from a corner, keeping the opposite one put', () => {
    const bigger = resizeBox(box, 0, [1, 1], [60, 30], false);
    close([bigger.x, bigger.y, bigger.width, bigger.height], [0, 0, 60, 30]);
    // Turned half a turn, its own bottom-right corner is at the top left, and the corner
    // that stays put is at (40, 20).
    const turned = resizeBox(box, Math.PI, [1, 1], [-20, -10], false);
    close([turned.width, turned.height], [60, 30]);
    close(centre(turned), [10, 5]);
  });

  it('keeps a picture’s proportions, and never shrinks below a few mm', () => {
    const picture = resizeBox(box, 0, [1, 1], [80, 25], true);
    expect(picture.width / picture.height).toBeCloseTo(2, 9);
    expect(picture.width).toBeCloseTo(80, 9);
    const tiny = resizeBox(box, 0, [1, 1], [-100, -100], false);
    expect(Math.min(tiny.width, tiny.height)).toBeGreaterThanOrEqual(3);
  });

  it('turns to face the pointer, settling on right angles, or in steps of 15° with Shift', () => {
    expect(turnTowards(box, [20, -50], false)).toBeCloseTo(0, 9); // straight up
    expect(turnTowards(box, [70, 12], false)).toBeCloseTo(Math.PI / 2, 9); // 2° off facing right
    const free = turnTowards(box, [50, -20], false);
    expect(free).toBeGreaterThan(0.5);
    expect(((turnTowards(box, [50, -20], true) * 180) / Math.PI) % 15).toBeCloseTo(0, 6);
  });
});

describe('blocks', () => {
  it('start with the medium’s sample text as the main block', () => {
    const settings = defaultSettings('paper');
    expect(settings.blocks).toHaveLength(1);
    expect(mainBlock(settings.blocks)).toMatchObject({ role: 'main', frame: null, flow: true });
    expect(mainBlock([newTextBlock('x', 'paper'), newSignature('y', 'paper', 'Me')])?.id).toBe('x');
  });

  it('describe themselves for the list', () => {
    expect(describeBlock({ ...newTextBlock('x', 'paper'), text: 'Meet at [[the mill]] at dawn' })).toBe('Text · Meet at the mill at dawn');
    expect(describeBlock(newSignature('s', 'paper', 'R. Hale'))).toBe('Signature · R. Hale');
    const picture = { ...newTextBlock('p', 'paper'), kind: 'picture' as const, src: 'https://example.com/maps/cove.png?v=2', use: 'opaque' as const, threshold: 0.5 };
    expect(describeBlock(picture)).toBe('Picture · cove.png');
  });
});

function centre(box: { x: number; y: number; width: number; height: number }): [number, number] {
  return [box.x + box.width / 2, box.y + box.height / 2];
}

import type { FontId } from './text/fonts';
import type { Align, Box } from './text/layout';
import type { PictureSettings } from './text/picture';
import type { WordDivision } from './text/roman';
import type { ScriptId } from './text/scripts';

/**
 * Where a block goes when placed by hand: its centre as fractions of the object's width
 * and height, its size in units of the object's shorter side, and how far it's turned
 * (degrees, clockwise). So it keeps its place and shape when the object is resized or
 * the medium changes.
 */
export interface Frame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
}

/**
 * What the template does with a block it arranges itself: the main block fills the
 * text area, and a signature is signed below the block before it.
 */
export type BlockRole = 'main' | 'signature';

interface BlockCommon {
  id: string;
  /** Placed by hand, or null to be arranged with the template. */
  frame: Frame | null;
  /** Which page it's on; for text that runs on, the page it starts on. */
  page: number;
  role?: BlockRole;
  align: Align;
  /** Fraction of the largest size that fits (text 0.3–1, pictures 0.05–1). */
  size: number;
}

export interface TextBlock extends BlockCommon {
  kind: 'text';
  text: string;
  font: FontId;
  /** The script it's written in; the text itself stays in Latin letters. */
  script: ScriptId;
  /** Classical Roman letters: capitals, V for U, I for J. */
  roman: boolean;
  /** What goes between words: spaces, dots, or nothing. */
  words: WordDivision;
  /** A dot between sentences, in place of their full stops. */
  stops: boolean;
  /** Run on to more pages rather than shrinking (only the first such block does). */
  flow: boolean;
  /** Written with a pen even on a typed page, as a signature is. */
  byHand: boolean;
}

export interface PictureBlock extends BlockCommon, PictureSettings {
  kind: 'picture';
}

export type Block = TextBlock | PictureBlock;

/** Most blocks a handout keeps. */
export const MAX_BLOCKS = 40;

/** A new block id: short, and unlikely to repeat. */
export function newBlockId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** The block the template's text goes in: the main one, or else the first text block. */
export function mainBlock(blocks: readonly Block[]): Block | undefined {
  return blocks.find((block) => block.role === 'main') ?? blocks.find((block) => block.kind === 'text');
}

/** A frame's box in mm (before turning) and its angle in radians, on a width × height object. */
export function frameBox(frame: Frame, width: number, height: number): { box: Box; angle: number } {
  const short = Math.min(width, height);
  const w = frame.w * short;
  const h = frame.h * short;
  return { box: { x: frame.cx * width - w / 2, y: frame.cy * height - h / 2, width: w, height: h }, angle: (frame.angle * Math.PI) / 180 };
}

/** The frame for a box in mm turned by `angle` radians, on a width × height object. */
export function boxFrame(box: Box, angle: number, width: number, height: number): Frame {
  const short = Math.min(width, height);
  return {
    cx: (box.x + box.width / 2) / width,
    cy: (box.y + box.height / 2) / height,
    w: box.width / short,
    h: box.height / short,
    angle: normalizeAngle((angle * 180) / Math.PI),
  };
}

/** Degrees in (-180, 180]. */
export function normalizeAngle(degrees: number): number {
  const a = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return a === -180 ? 180 : a;
}

/** Turns a point about a centre by `angle` radians, clockwise (y points down). */
export function turn([x, y]: readonly [number, number], [cx, cy]: readonly [number, number], angle: number): [number, number] {
  if (angle === 0) return [x, y];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

/** The centre of a box. */
export function centre(box: Box): [number, number] {
  return [box.x + box.width / 2, box.y + box.height / 2];
}

/** The upright box that holds a box turned by `angle` radians about its centre. */
export function boundingBox(box: Box, angle: number): Box {
  if (angle === 0) return box;
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  const width = box.width * c + box.height * s;
  const height = box.width * s + box.height * c;
  const [cx, cy] = centre(box);
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Whether a point lies in a box turned by `angle` radians, allowing `slack` mm. */
export function inTurnedBox(point: readonly [number, number], box: Box, angle: number, slack = 0): boolean {
  const [x, y] = turn(point, centre(box), -angle);
  return x >= box.x - slack && x <= box.x + box.width + slack && y >= box.y - slack && y <= box.y + box.height + slack;
}

/** A short label for a block in the list: its first words, or what the picture is. */
export function describeBlock(block: Block): string {
  if (block.kind === 'picture') {
    const name = block.src.startsWith('upload:') ? 'uploaded' : (block.src.split('/').pop()?.split('?')[0] ?? 'picture');
    return `Picture · ${name}`;
  }
  const words = block.text.replace(/\[\[|\]\]|\{\{|\}\}/g, '').replace(/\s+/g, ' ').trim();
  const label = block.role === 'signature' ? 'Signature' : 'Text';
  return `${label} · ${words ? (words.length > 32 ? `${words.slice(0, 30)}…` : words) : '(empty)'}`;
}

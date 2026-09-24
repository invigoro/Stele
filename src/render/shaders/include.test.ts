import { describe, expect, it } from 'vitest';
import { expandIncludes } from './include';

describe('expandIncludes', () => {
  it('inlines includes relative to the including file', () => {
    const files = {
      'main.frag': '#version 300 es\n#include "lib/a.glsl"\nvoid main() {}',
      'lib/a.glsl': '#include "b.glsl"\nfloat a() { return b(); }',
      'lib/b.glsl': 'float b() { return 1.0; }',
    };
    expect(expandIncludes('main.frag', files)).toBe(
      '#version 300 es\nfloat b() { return 1.0; }\nfloat a() { return b(); }\nvoid main() {}',
    );
  });

  it('inlines a shared dependency once, before its first user', () => {
    const files = {
      'main.frag': '#include "a.glsl"\n#include "c.glsl"',
      'a.glsl': '#include "d.glsl"\nA',
      'c.glsl': '#include "d.glsl"\nC',
      'd.glsl': 'D',
    };
    expect(expandIncludes('main.frag', files)).toBe('D\nA\n\nC');
  });

  it('resolves .. and allows a trailing comment', () => {
    const files = {
      'passes/main.frag': '#include "../lib/n.glsl" // noise',
      'lib/n.glsl': 'N',
    };
    expect(expandIncludes('passes/main.frag', files)).toBe('N');
  });

  it('normalizes CRLF line endings', () => {
    const files = { 'main.frag': '#version 300 es\r\n#include "a.glsl"\r\n', 'a.glsl': 'A\r\n' };
    expect(expandIncludes('main.frag', files)).not.toContain('\r');
  });

  it('reports a missing include with its file and line', () => {
    const files = { 'main.frag': '#version 300 es\n#include "lib/missing.glsl"' };
    expect(() => expandIncludes('main.frag', files)).toThrow(
      'main.frag:2: cannot find #include "lib/missing.glsl"',
    );
  });

  it('rejects paths that leave the shader folder', () => {
    const files = { 'main.frag': '#include "../outside.glsl"' };
    expect(() => expandIncludes('main.frag', files)).toThrow('points outside the shader folder');
  });

  it('rejects circular includes', () => {
    const files = {
      'main.frag': '#include "a.glsl"',
      'a.glsl': '#include "b.glsl"',
      'b.glsl': '#include "a.glsl"',
    };
    expect(() => expandIncludes('main.frag', files)).toThrow('b.glsl:1: circular #include of a.glsl');
  });

  it('rejects #version in an included file', () => {
    const files = { 'main.frag': '#version 300 es\n#include "a.glsl"', 'a.glsl': '#version 300 es' };
    expect(() => expandIncludes('main.frag', files)).toThrow(
      'a.glsl:1: #version is only allowed in the entry shader',
    );
  });

  it('rejects an unknown entry shader', () => {
    expect(() => expandIncludes('nope.frag', {})).toThrow('Unknown shader: nope.frag');
  });
});

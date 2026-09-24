const INCLUDE = /^\s*#include\s+"([^"]+)"\s*(?:\/\/.*)?$/;
const VERSION = /^\s*#version\b/;

/**
 * Expands `#include "path"` directives in GLSL source, since GLSL has no include
 * mechanism of its own.
 *
 * - Paths resolve relative to the including file and may use `..`.
 * - Each file is inlined at most once per shader (like `#pragma once`), so a library
 *   can include its own dependencies without causing duplicate definitions.
 * - Only the entry file may contain `#version`, which GLSL requires on the first line.
 */
export function expandIncludes(entry: string, files: Readonly<Record<string, string>>): string {
  if (!(entry in files)) throw new Error(`Unknown shader: ${entry}`);
  const included = new Set<string>();

  function expand(path: string, ancestors: readonly string[]): string {
    included.add(path);
    return files[path]
      .split(/\r?\n/)
      .map((line, index) => {
        const where = `${path}:${index + 1}`;
        if (ancestors.length > 0 && VERSION.test(line)) {
          throw new Error(`${where}: #version is only allowed in the entry shader`);
        }
        const match = INCLUDE.exec(line);
        if (!match) return line;
        const target = resolve(path, match[1], where);
        if (!(target in files)) throw new Error(`${where}: cannot find #include "${match[1]}"`);
        if (target === path || ancestors.includes(target)) {
          throw new Error(`${where}: circular #include of ${target}`);
        }
        return included.has(target) ? '' : expand(target, [...ancestors, path]);
      })
      .join('\n');
  }

  return expand(entry, []);
}

/** Resolves `relative` against the folder containing `from`. */
function resolve(from: string, relative: string, where: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const part of relative.split('/')) {
    if (part === '..') {
      if (parts.length === 0) {
        throw new Error(`${where}: #include "${relative}" points outside the shader folder`);
      }
      parts.pop();
    } else if (part !== '.' && part !== '') {
      parts.push(part);
    }
  }
  return parts.join('/');
}

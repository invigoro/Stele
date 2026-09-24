/**
 * Classical Roman letter forms: capitals only, V for U and I for J (Latin had neither
 * U nor J), and a raised dot, the interpunct, between words. Damage markup brackets
 * are left alone.
 */
export function romanize(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .toLocaleUpperCase('en')
        .replace(/U/g, 'V')
        .replace(/J/g, 'I')
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0 && word !== '·')
        .join(' · '),
    )
    .join('\n');
}

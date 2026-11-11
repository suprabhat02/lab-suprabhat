/** Small CSS-aware scanning helpers: they skip strings, escapes, comments and nested brackets. */

export interface Range {
  readonly start: number;
  readonly end: number;
}

/** Returns the index just past a string, escape or comment starting at `i`, or `i` if none starts there. */
export function skipOpaque(text: string, i: number): number {
  const ch = text[i];
  if (ch === '\\') return Math.min(i + 2, text.length);
  if (ch === '"' || ch === "'") {
    let j = i + 1;
    while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
    return Math.min(j + 1, text.length);
  }
  if (ch === '/' && text[i + 1] === '*') {
    const close = text.indexOf('*/', i + 2);
    return close === -1 ? text.length : close + 2;
  }
  return i;
}

/** Index of the `)` matching the `(` at `open`, or -1 when unbalanced. */
export function findClosingParen(text: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const skipped = skipOpaque(text, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') {
      depth--;
      if (depth === 0) return ch === ')' ? i : -1;
    }
    i++;
  }
  return -1;
}

/** Splits `text[start, end)` on top-level occurrences of `separator`. */
export function splitTopLevel(text: string, separator = ',', start = 0, end = text.length): Range[] {
  const ranges: Range[] = [];
  let depth = 0;
  let from = start;
  let i = start;
  while (i < end) {
    const skipped = skipOpaque(text, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === separator && depth === 0) {
      ranges.push({ start: from, end: i });
      from = i + 1;
    }
    i++;
  }
  ranges.push({ start: from, end });
  return ranges;
}

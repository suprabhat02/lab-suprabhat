import { skipOpaque, splitTopLevel } from './scan';
import { err, ok } from './types';
import type { Result } from './types';

export const MAX_NESTING_LENGTH = 2000;

export interface ExpandedRule {
  /** The nested selector as written. */
  readonly source: string;
  /** Each complex selector after `&` has been expanded. */
  readonly selectors: ReadonlyArray<string>;
  /** `selectors` joined into one selector list. */
  readonly selector: string;
  /** 0 for top-level rules. */
  readonly depth: number;
  /** Enclosing conditional at-rules, outermost first, e.g. `@media (width > 40em)`. */
  readonly atRules: ReadonlyArray<string>;
  /** The rule's own declarations, e.g. `color: red; margin: 0`. */
  readonly declarations: string;
}

export interface NestingOutput {
  readonly rules: ReadonlyArray<ExpandedRule>;
  readonly notes: ReadonlyArray<string>;
}

const COMBINATOR = /^[>+~]/;
const BREAK_BEFORE = /[\s>+~(,]/;

function hasTopLevelCombinator(selector: string): boolean {
  const trimmed = selector.trim();
  let depth = 0;
  let i = 0;
  while (i < trimmed.length) {
    const skipped = skipOpaque(trimmed, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = trimmed[i] ?? '';
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (/\s/.test(ch) || COMBINATOR.test(ch))) return true;
    i++;
  }
  return false;
}

/** Offsets of each `&` that is a real nesting selector (not inside a string or escape). */
function nestingOffsets(selector: string): number[] {
  const found: number[] = [];
  let i = 0;
  while (i < selector.length) {
    const skipped = skipOpaque(selector, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    if (selector[i] === '&') found.push(i);
    i++;
  }
  return found;
}

/**
 * Expands one nested selector against its parent selector list.
 * A parent list becomes `:is(<list>)`; a single parent is substituted directly when that is equivalent.
 */
export function expandSelector(parents: ReadonlyArray<string>, child: string): string[] {
  const listForm = `:is(${parents.join(', ')})`;
  const single = parents.length === 1 ? (parents[0] ?? '').trim() : null;

  return splitTopLevel(child).map(({ start, end }) => {
    const item = child.slice(start, end).trim();
    const offsets = nestingOffsets(item);

    if (offsets.length === 0) {
      // A nested rule without `&` is treated as `& <rule>`.
      return `${single ?? listForm} ${item}`;
    }

    let out = '';
    let last = 0;
    for (const at of offsets) {
      const before = item.slice(0, at);
      const atStart = before.trim() === '';
      const prev = before.at(-1) ?? ' ';
      const glued = !BREAK_BEFORE.test(prev);
      let replacement = listForm;
      if (single !== null) {
        const startsWithType = /^[a-zA-Z_*|-]/.test(single) || /^\\/.test(single);
        if (atStart) replacement = single;
        else if (!hasTopLevelCombinator(single) && !(glued && startsWithType)) replacement = single;
        else replacement = `:is(${single})`;
      }
      out += item.slice(last, at) + replacement;
      last = at + 1;
    }
    return out + item.slice(last);
  });
}

interface Sink {
  add(declaration: string): void;
}

interface Frame {
  readonly parents: ReadonlyArray<string> | null;
  readonly atRules: ReadonlyArray<string>;
  readonly depth: number;
  readonly sink: Sink | null;
}

const CONDITIONAL = /^@(media|supports|container|layer|scope|starting-style)\b/i;

/** Expands nested CSS into flat rules. Never throws. */
export function expandNesting(css: string): Result<NestingOutput> {
  if (css.length > MAX_NESTING_LENGTH) {
    return err(
      `This CSS is ${css.length.toLocaleString('en')} characters long. The limit is 2,000; trim it and try again.`,
      MAX_NESTING_LENGTH,
    );
  }
  if (css.trim() === '') return err('Paste some nested CSS to expand it.');

  interface MutableRule {
    source: string;
    selectors: string[];
    depth: number;
    atRules: string[];
    declarations: string[];
  }
  const rules: MutableRule[] = [];
  const notes = new Set<string>();

  const ruleSink = (rule: MutableRule): Sink => ({ add: (d) => rule.declarations.push(d) });
  const lazySink = (make: () => MutableRule): Sink => {
    let rule: MutableRule | null = null;
    return {
      add(d) {
        rule ??= make();
        rule.declarations.push(d);
      },
    };
  };

  const stack: Frame[] = [{ parents: null, atRules: [], depth: 0, sink: null }];
  const opens: number[] = [];
  let i = 0;
  let from = 0;
  let depth = 0;

  const flushDeclaration = (end: number) => {
    const text = css
      .slice(from, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    const frame = stack.at(-1);
    if (text && frame?.sink) frame.sink.add(text.replace(/\s+/g, ' '));
  };

  while (i < css.length) {
    const skipped = skipOpaque(css, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = css[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && ch === ';') {
      flushDeclaration(i);
      from = i + 1;
    } else if (depth === 0 && ch === '{') {
      const prelude = css
        .slice(from, i)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();
      const frame = stack.at(-1) ?? { parents: null, atRules: [], depth: 0, sink: null };
      if (prelude === '') return err(`A rule needs a selector before \`{\` at character ${i + 1}.`, i);

      if (prelude.startsWith('@')) {
        const atRules = [...frame.atRules, prelude.replace(/\s+/g, ' ')];
        if (frame.parents) {
          notes.add(
            'Nested `@media` and `@supports` blocks become separate rules, which can change the order of appearance compared with how the code reads.',
          );
        }
        const parents = frame.parents;
        const sink = parents
          ? lazySink(() => {
              const rule: MutableRule = {
                source: '&',
                selectors: [...parents],
                depth: frame.depth,
                atRules,
                declarations: [],
              };
              rules.push(rule);
              return rule;
            })
          : null;
        if (!CONDITIONAL.test(prelude))
          notes.add(
            `\`${prelude.split(/\s/)[0] ?? prelude}\` isn't expanded; its contents are treated like a conditional block.`,
          );
        stack.push({ parents, atRules, depth: frame.depth, sink });
      } else {
        const ranges = splitTopLevel(prelude);
        if (ranges.some((r) => prelude.slice(r.start, r.end).trim() === '')) {
          return err(`The selector list before \`{\` at character ${i + 1} has an empty item.`, i);
        }
        let selectors: string[];
        if (frame.parents) {
          selectors = expandSelector(frame.parents, prelude);
        } else {
          selectors = ranges.map((r) => prelude.slice(r.start, r.end).trim());
          if (selectors.some((s) => nestingOffsets(s).length > 0)) {
            notes.add('`&` in a top-level rule means `:scope`, which matches the document root here.');
            selectors = selectors.map((s) => {
              const offsets = nestingOffsets(s);
              let out = '';
              let last = 0;
              for (const at of offsets) {
                out += `${s.slice(last, at)}:scope`;
                last = at + 1;
              }
              return out + s.slice(last);
            });
          }
        }
        const rule: MutableRule = {
          source: prelude.replace(/\s+/g, ' '),
          selectors,
          depth: frame.parents ? frame.depth + 1 : 0,
          atRules: [...frame.atRules],
          declarations: [],
        };
        rules.push(rule);
        stack.push({ parents: selectors, atRules: rule.atRules, depth: rule.depth, sink: ruleSink(rule) });
      }
      opens.push(i);
      from = i + 1;
    } else if (depth === 0 && ch === '}') {
      if (stack.length <= 1)
        return err(`Unexpected \`}\` at character ${i + 1}: there's no rule to close.`, i);
      flushDeclaration(i);
      stack.pop();
      opens.pop();
      from = i + 1;
    }
    i++;
  }

  const unclosed = opens.at(-1);
  if (unclosed !== undefined) {
    return err(`Missing \`}\`: the block opened at character ${unclosed + 1} is never closed.`, unclosed);
  }
  if (css.slice(from).trim() !== '' && rules.length === 0) {
    return err('No rules found. Write a selector followed by `{ … }`.');
  }
  if (rules.length === 0) return err('No rules found. Write a selector followed by `{ … }`.');

  return ok(
    Object.freeze({
      rules: Object.freeze(
        rules.map((r) =>
          Object.freeze({
            source: r.source,
            selectors: Object.freeze([...r.selectors]),
            selector: r.selectors.join(', '),
            depth: r.depth,
            atRules: Object.freeze([...r.atRules]),
            declarations: r.declarations.join('; '),
          }),
        ),
      ),
      notes: Object.freeze([...notes]),
    }),
  );
}

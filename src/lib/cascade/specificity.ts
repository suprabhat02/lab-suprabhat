import parse from 'css-tree/selector-parser';
import type {
  PseudoArgument,
  PseudoClassSelector,
  PseudoElementSelector,
  Selector,
  SelectorChild,
  SelectorList,
} from 'css-tree/selector-parser';
import { calculateForAST } from '@bramus/specificity/core';
import { findClosingParen, splitTopLevel } from './scan';
import { add, compareSpecificity, formatSpecificity, ZERO } from './math';
import { err, ok } from './types';
import type { ParseError, PartKind, Result, SelectorPart, Specificity, SpecificityResult } from './types';

export { add, compareSpecificity, formatSpecificity };

export const MAX_SELECTOR_LENGTH = 1000;

const ID: Specificity = [1, 0, 0];
const CLASS: Specificity = [0, 1, 0];
const TYPE: Specificity = [0, 0, 1];

const KNOWN_PSEUDO_CLASSES = new Set([
  'active',
  'any-link',
  'autofill',
  'blank',
  'buffering',
  'checked',
  'closed',
  'current',
  'default',
  'defined',
  'dir',
  'disabled',
  'empty',
  'enabled',
  'first',
  'first-child',
  'first-of-type',
  'focus',
  'focus-visible',
  'focus-within',
  'fullscreen',
  'future',
  'has',
  'has-slotted',
  'heading',
  'host',
  'host-context',
  'hover',
  'in-range',
  'indeterminate',
  'invalid',
  'is',
  'lang',
  'last-child',
  'last-of-type',
  'left',
  'link',
  'local-link',
  'modal',
  'muted',
  'not',
  'nth-child',
  'nth-col',
  'nth-last-child',
  'nth-last-col',
  'nth-last-of-type',
  'nth-of-type',
  'only-child',
  'only-of-type',
  'open',
  'optional',
  'out-of-range',
  'past',
  'paused',
  'picture-in-picture',
  'placeholder-shown',
  'playing',
  'popover-open',
  'read-only',
  'read-write',
  'required',
  'right',
  'root',
  'scope',
  'seeking',
  'stalled',
  'state',
  'target',
  'target-current',
  'target-within',
  'user-invalid',
  'user-valid',
  'valid',
  'visited',
  'volume-locked',
  'where',
  'matches',
  'any',
]);

const KNOWN_PSEUDO_ELEMENTS = new Set([
  'after',
  'backdrop',
  'before',
  'checkmark',
  'column',
  'cue',
  'cue-region',
  'details-content',
  'file-selector-button',
  'first-letter',
  'first-line',
  'grammar-error',
  'highlight',
  'marker',
  'part',
  'picker',
  'picker-icon',
  'placeholder',
  'scroll-button',
  'scroll-marker',
  'scroll-marker-group',
  'search-text',
  'selection',
  'slotted',
  'spelling-error',
  'target-text',
  'view-transition',
  'view-transition-group',
  'view-transition-image-pair',
  'view-transition-new',
  'view-transition-old',
]);

const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-letter', 'first-line']);

interface Described {
  readonly kind: PartKind;
  readonly contributes: Specificity;
  readonly note?: string;
  readonly warning?: string;
}

interface WalkContext {
  /** The trimmed text css-tree parsed; node offsets point into it. */
  readonly source: string;
}

const textOf = (
  node: { loc?: { start: { offset: number }; end: { offset: number } } | null },
  ctx: WalkContext,
) => (node.loc ? ctx.source.slice(node.loc.start.offset, node.loc.end.offset) : '');

const sum = (values: Iterable<Specificity>): Specificity => {
  let total = ZERO;
  for (const v of values) total = add(total, v);
  return total;
};

function valueOfNodes(nodes: Iterable<SelectorChild>, ctx: WalkContext): Specificity {
  const values: Specificity[] = [];
  for (const node of nodes) values.push(describe(node, ctx).contributes);
  return sum(values);
}

/** Highest specificity in a selector list, plus the text of the selector that produced it. */
function maxOfList(list: SelectorList, ctx: WalkContext): { value: Specificity; text: string } | null {
  let best: { value: Specificity; text: string } | null = null;
  for (const selector of list.children) {
    const value = valueOfNodes(selector.children, ctx);
    if (!best || compareSpecificity(value, best.value) > 0)
      best = { value, text: textOf(selector, ctx).trim() };
  }
  return best;
}

function argumentList(arg: PseudoArgument | null | undefined): SelectorList | null {
  if (!arg) return null;
  if (arg.type === 'SelectorList') return arg;
  if (arg.type === 'Raw') {
    try {
      return parse(arg.value, { context: 'selectorList' });
    } catch {
      return null;
    }
  }
  return null;
}

/** `:host()` and `::slotted()` take a compound selector; drop anything after a combinator. */
function compoundValue(arg: PseudoArgument | null | undefined, ctx: WalkContext): Specificity {
  if (!arg || arg.type !== 'Selector') return ZERO;
  const nodes: SelectorChild[] = [];
  for (const node of arg.children) {
    if (node.type === 'Combinator') break;
    nodes.push(node);
  }
  return valueOfNodes(nodes, ctx);
}

const nameOf = (node: PseudoClassSelector | PseudoElementSelector) => node.name.toLowerCase();
const isVendor = (name: string) => name.startsWith('-');

function describePseudoClass(node: PseudoClassSelector, ctx: WalkContext): Described {
  const name = nameOf(node);
  const first = node.children?.first;

  switch (name) {
    case 'where':
      return {
        kind: 'functional',
        contributes: ZERO,
        note: '`:where()` always adds zero, whatever is inside it.',
      };

    case 'is':
    case 'matches':
    case '-moz-any':
    case 'not':
    case 'has': {
      const list = argumentList(first);
      const best = list ? maxOfList(list, ctx) : null;
      if (!best) {
        return {
          kind: 'functional',
          contributes: ZERO,
          note: 'Empty argument list: adds nothing and matches nothing.',
        };
      }
      const which = `its most specific argument, \`${best.text}\` ${formatSpecificity(best.value)}`;
      const tail =
        name === 'not'
          ? 'even though it matches elements that are not that.'
          : name === 'has'
            ? 'even if a less specific argument is the one that matched.'
            : 'even for elements that only match a less specific argument.';
      return { kind: 'functional', contributes: best.value, note: `Counts ${which}, ${tail}` };
    }

    case 'any':
    case '-webkit-any':
      return first
        ? { kind: 'functional', contributes: CLASS, note: 'Legacy `:any()` counts as one pseudo-class.' }
        : { kind: 'functional', contributes: ZERO };

    case 'nth-child':
    case 'nth-last-child': {
      const ofList = first?.type === 'Nth' ? first.selector : null;
      const best = ofList ? maxOfList(ofList, ctx) : null;
      if (!best) return { kind: 'pseudo-class', contributes: CLASS };
      return {
        kind: 'functional',
        contributes: add(CLASS, best.value),
        note: `One pseudo-class plus its most specific \`of\` argument, \`${best.text}\` ${formatSpecificity(best.value)}.`,
      };
    }

    case 'host':
    case 'host-context': {
      if (!first) return { kind: 'pseudo-class', contributes: CLASS };
      return {
        kind: 'functional',
        contributes: add(CLASS, compoundValue(first, ctx)),
        note: `\`:${name}()\` counts as one pseudo-class plus its argument.`,
      };
    }

    default:
      if (LEGACY_PSEUDO_ELEMENTS.has(name)) {
        return {
          kind: 'pseudo-element',
          contributes: TYPE,
          note: `Old single-colon syntax for \`::${name}\`; it still counts as a pseudo-element.`,
        };
      }
      if (!KNOWN_PSEUDO_CLASSES.has(name) && !isVendor(name)) {
        const message = `\`:${node.name}\` isn't a known pseudo-class. It's counted as one, but browsers drop rules they don't understand.`;
        return { kind: 'pseudo-class', contributes: CLASS, note: message, warning: message };
      }
      return { kind: 'pseudo-class', contributes: CLASS };
  }
}

function describePseudoElement(node: PseudoElementSelector, ctx: WalkContext): Described {
  const name = nameOf(node);
  const first = node.children?.first;
  const isStar = first?.type === 'Raw' && first.value.trim() === '*';

  switch (name) {
    case 'slotted':
      return {
        kind: 'pseudo-element',
        contributes: add(TYPE, compoundValue(first, ctx)),
        note: '`::slotted()` counts as one pseudo-element plus its argument.',
      };
    case 'view-transition-group':
    case 'view-transition-image-pair':
    case 'view-transition-old':
    case 'view-transition-new':
      return isStar
        ? {
            kind: 'pseudo-element',
            contributes: ZERO,
            note: 'With `*` as its argument this pseudo-element adds nothing.',
          }
        : { kind: 'pseudo-element', contributes: TYPE };
    case 'highlight':
      if (!node.children || node.children.size === 0) return { kind: 'pseudo-element', contributes: ZERO };
      return isStar
        ? {
            kind: 'pseudo-element',
            contributes: ZERO,
            note: 'With `*` as its argument this pseudo-element adds nothing.',
          }
        : { kind: 'pseudo-element', contributes: TYPE };
    default:
      if (!KNOWN_PSEUDO_ELEMENTS.has(name) && !isVendor(name)) {
        const message = `\`::${node.name}\` isn't a known pseudo-element. It's counted as one, but browsers drop rules they don't understand.`;
        return { kind: 'pseudo-element', contributes: TYPE, note: message, warning: message };
      }
      return { kind: 'pseudo-element', contributes: TYPE };
  }
}

function describe(node: SelectorChild, ctx: WalkContext): Described {
  switch (node.type) {
    case 'IdSelector':
      return { kind: 'id', contributes: ID };
    case 'ClassSelector':
      return { kind: 'class', contributes: CLASS };
    case 'AttributeSelector':
      return { kind: 'attribute', contributes: CLASS };
    case 'TypeSelector': {
      const hasNamespace = node.name.includes('|');
      const local = hasNamespace ? node.name.slice(node.name.lastIndexOf('|') + 1) : node.name;
      if (local === '*') {
        return {
          kind: 'universal',
          contributes: ZERO,
          note: hasNamespace
            ? 'Universal selector with a namespace: adds nothing.'
            : 'The universal selector adds nothing.',
        };
      }
      return hasNamespace
        ? { kind: 'type', contributes: TYPE, note: 'The namespace prefix adds nothing; the type counts.' }
        : { kind: 'type', contributes: TYPE };
    }
    case 'Combinator':
      return { kind: 'combinator', contributes: ZERO, note: 'Combinators add nothing.' };
    case 'PseudoClassSelector':
      return describePseudoClass(node, ctx);
    case 'PseudoElementSelector':
      return describePseudoElement(node, ctx);
    case 'NestingSelector': {
      const message =
        '`&` only has a meaning inside nested CSS. Use the nesting expander to see what it becomes.';
      return { kind: 'functional', contributes: ZERO, note: message, warning: message };
    }
  }
}

function walkSelector(selector: Selector, ctx: WalkContext, base: number, original: string) {
  const parts: SelectorPart[] = [];
  const warnings: string[] = [];
  let pseudoElement: string | null = null;

  const nodes = selector.children.toArray();
  if (nodes[0]?.type === 'Combinator') {
    warnings.push(`Starting with \`${nodes[0].name}\` only works inside nested CSS or \`:has()\`.`);
  }
  nodes.forEach((node, index) => {
    const described = describe(node, ctx);
    if (described.warning) warnings.push(described.warning);

    const isPseudo = node.type === 'PseudoClassSelector' || node.type === 'PseudoElementSelector';
    if (pseudoElement && !isPseudo) {
      warnings.push(`Pseudo-element \`${pseudoElement}\` must come last, so browsers will drop this rule.`);
      pseudoElement = null;
    }
    if (described.kind === 'pseudo-element') pseudoElement = textOf(node, ctx);

    let start = (node.loc?.start.offset ?? 0) + base;
    let end = (node.loc?.end.offset ?? 0) + base;
    // css-tree gives the descendant (whitespace) combinator an empty location; span the gap instead.
    if (node.type === 'Combinator' && end <= start) {
      start = parts.at(-1)?.end ?? base;
      end = (nodes[index + 1]?.loc?.start.offset ?? start - base) + base;
    }
    const part: SelectorPart = {
      text: original.slice(start, end),
      start,
      end,
      kind: described.kind,
      contributes: described.contributes,
      ...(described.note === undefined ? {} : { note: described.note }),
    };
    parts.push(Object.freeze(part));
  });
  const last = nodes.at(-1);
  const trailingCombinator = last?.type === 'Combinator' ? last.name.trim() || ' ' : null;
  return { parts, warnings, trailingCombinator };
}

const FORGIVING = /:(?:is|where|matches|-webkit-any|-moz-any|any)\(/gi;

/**
 * `:is()` and `:where()` take forgiving lists: invalid arguments are dropped rather than
 * invalidating the selector. Blank them out (keeping offsets stable) so css-tree can parse the rest.
 */
export function forgiveLists(source: string): { text: string; dropped: string[] } {
  const chars = source.split('');
  const dropped: string[] = [];
  const opens = [...source.matchAll(FORGIVING)].map((m) => m.index + m[0].length - 1).reverse();

  for (const open of opens) {
    const current = chars.join('');
    const close = findClosingParen(current, open);
    if (close === -1) continue;
    const args = splitTopLevel(current, ',', open + 1, close);
    args.forEach((arg, k) => {
      const text = current.slice(arg.start, arg.end);
      let valid = text.trim().length > 0;
      if (valid) {
        try {
          parse(text, { context: 'selectorList' });
        } catch {
          valid = false;
        }
      }
      if (valid || (args.length === 1 && text.trim() === '')) return;
      dropped.push(text.trim());
      const isLast = k === args.length - 1;
      const prev = args[k - 1];
      const from = isLast && prev ? prev.end : arg.start;
      const to = isLast ? arg.end : arg.end + 1;
      for (let i = from; i < to; i++) chars[i] = ' ';
    });
  }
  return { text: chars.join(''), dropped };
}

function syntaxMessage(error: unknown, input: string, base: number): ParseError {
  const raw = error instanceof Error ? error.message : '';
  const offset =
    typeof error === 'object' && error !== null && 'offset' in error && typeof error.offset === 'number'
      ? error.offset + base
      : null;
  const trimmedEnd = input.trimEnd().length;
  let hint = '';
  const expected = /^"?(.+?)"? is expected$/.exec(raw);
  if (raw === 'Selector is expected') hint = ' Expected a selector there.';
  else if (raw === 'Identifier is expected' || raw === 'Name is expected') hint = ' Expected a name there.';
  else if (expected?.[1]) hint = ` Expected \`${expected[1]}\` there.`;

  if (offset === null)
    return { message: "This selector couldn't be parsed. Check it for typos.", position: null };
  if (offset >= trimmedEnd) {
    return { message: `This selector couldn't be parsed: it ends too early.${hint}`, position: trimmedEnd };
  }
  const ch = input[offset] ?? '';
  const shown = /\s/.test(ch) ? 'space' : `\`${ch}\``;
  return {
    message: `This selector couldn't be parsed: unexpected ${shown} at character ${offset + 1}.${hint}`,
    position: offset,
  };
}

/**
 * Calculates specificity for every selector in a (comma-separated) selector list.
 * Never throws: invalid input comes back as `{ ok: false, error }` with a character position.
 */
export function calculate(input: string): Result<ReadonlyArray<SpecificityResult>> {
  if (input.length > MAX_SELECTOR_LENGTH) {
    return err(
      `This selector is ${input.length.toLocaleString('en')} characters long. The limit is 1,000; shorten it and try again.`,
      MAX_SELECTOR_LENGTH,
    );
  }
  const source = input.trim();
  if (source === '') return err('Type a selector to see its specificity.');
  const base = input.length - input.trimStart().length;

  const warnings: string[] = [];
  let ast: SelectorList | null = null;
  let parsed = source;
  try {
    ast = parse(source, { context: 'selectorList', positions: true });
  } catch (error) {
    const forgiven = forgiveLists(source);
    if (forgiven.dropped.length > 0) {
      try {
        ast = parse(forgiven.text, { context: 'selectorList', positions: true });
        parsed = forgiven.text;
        for (const d of forgiven.dropped) {
          warnings.push(
            d === ''
              ? 'Ignored an empty argument in a forgiving list (`:is()` or `:where()`).'
              : `Ignored the invalid argument \`${d}\`: \`:is()\` and \`:where()\` skip arguments they can't parse.`,
          );
        }
      } catch {
        ast = null;
      }
    }
    if (!ast) return { ok: false, error: syntaxMessage(error, input, base) };
  }

  const ctx: WalkContext = { source: parsed };
  const results: SpecificityResult[] = [];
  try {
    for (const selector of ast.children) {
      const { parts, warnings: own, trailingCombinator } = walkSelector(selector, ctx, base, input);
      if (trailingCombinator) {
        return err(
          `This selector couldn't be parsed: it ends too early. Nothing follows the \`${trailingCombinator}\` combinator.`,
          input.trimEnd().length,
        );
      }
      const lib = calculateForAST(selector);
      const start = (selector.loc?.start.offset ?? 0) + base;
      const end = (selector.loc?.end.offset ?? source.length) + base;
      results.push(
        Object.freeze({
          selector: input.slice(start, end).trim(),
          value: Object.freeze([lib.a, lib.b, lib.c] as const),
          parts: Object.freeze(parts),
          warnings: Object.freeze([...warnings, ...own]),
        }),
      );
    }
  } catch {
    return err("This selector couldn't be parsed. Check it for typos.");
  }
  return ok(Object.freeze(results));
}

/** The highest-specificity selector in a list: what a rule with that list scores when that selector matches. */
export function strongest(results: ReadonlyArray<SpecificityResult>): SpecificityResult | null {
  let best: SpecificityResult | null = null;
  for (const r of results) if (!best || compareSpecificity(r.value, best.value) > 0) best = r;
  return best;
}

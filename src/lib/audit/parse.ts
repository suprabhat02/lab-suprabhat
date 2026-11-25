import parse from 'css-tree/parser';
import { ident } from 'css-tree/utils';
import type { Node, Declaration } from 'css-tree/parser';
import { expandNesting } from '../cascade/nesting';
import { skipOpaque, splitTopLevel } from '../cascade/scan';
import { calculate } from '../cascade/specificity';
import { err, ok } from '../cascade/types';
import type { Result } from '../cascade/types';
import { MAX_CSS_BYTES, validateCss } from './share';
import type { Entry, Stylesheet } from './types';

export const MAX_ENTRIES = 5000;
const GROUP = /^@(media|supports|container|layer|scope|starting-style|document)\b/i;

function hasNesting(selector: string): boolean {
  for (let i = 0; i < selector.length; i++) {
    const next = skipOpaque(selector, i);
    if (next !== i) i = next - 1;
    else if (selector[i] === '&') return true;
  }
  return false;
}

/** Mask nested preludes for css-tree's &-only block parser; preserve offsets and score the originals. */
function explicitNesting(css: string): Result<{ css: string; selectors: ReadonlyMap<number, string> }> {
  const stack: { style: boolean; value: boolean; at: number }[] = [];
  const brackets: string[] = [];
  const replacements: { start: number; end: number }[] = [];
  const selectors = new Map<number, string>();
  let from = 0;
  for (let i = 0; i < css.length; i++) {
    const next = skipOpaque(css, i);
    if (next !== i) {
      if (css.slice(i, i + 2) === '/*' && css.indexOf('*/', i + 2) < 0)
        return err('Unclosed CSS comment.', i);
      if ((css[i] === '"' || css[i] === "'") && css[next - 1] !== css[i])
        return err('Unclosed CSS string.', i);
      i = next - 1;
      continue;
    }
    const ch = css[i];
    if (ch === '(' || ch === '[') brackets.push(ch);
    else if (ch === ')' || ch === ']') {
      if (brackets.pop() !== (ch === ')' ? '(' : '[')) return err('Unbalanced CSS brackets.', i);
    } else if (!brackets.length) {
      if (ch === '{') {
        const prelude = css
          .slice(from, i)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .trim();
        const parent = stack.at(-1);
        const value = parent?.value === true || /^--[^:]+:/.test(prelude);
        if (!value && !prelude) return err('A block needs a selector or at-rule.', i);
        if (!value && parent?.style && !prelude.startsWith('@')) {
          let at = from;
          while (at < i) {
            if (/\s/.test(css[at] ?? '')) at++;
            else if (css.slice(at, at + 2) === '/*') at = skipOpaque(css, at);
            else break;
          }
          replacements.push({ start: at, end: i });
          selectors.set(at, prelude);
        }
        stack.push({
          value,
          at: i,
          style: !value && (prelude.startsWith('@') ? GROUP.test(prelude) && parent?.style === true : true),
        });
        from = i + 1;
      } else if (ch === '}') {
        if (!stack.pop()) return err('Unexpected closing brace.', i);
        from = i + 1;
      } else if (ch === ';') from = i + 1;
    }
  }
  if (stack.length || brackets.length)
    return err('Unclosed CSS block or bracket.', stack.at(-1)?.at ?? css.length);
  let result = '';
  let previous = 0;
  for (const { start, end } of replacements) {
    result += css.slice(previous, start) + '&' + css.slice(start + 1, end).replace(/[^\r\n]/g, ' ');
    previous = end;
  }
  return ok({ css: result + css.slice(previous), selectors });
}

interface Frame {
  readonly parents: string | null;
  readonly layer: string | null;
  readonly context: ReadonlyArray<string>;
}

export function parseStylesheet(css: string): Result<Stylesheet> {
  const valid = validateCss(css);
  if (!valid.ok) return valid;
  if (!css.trim()) return err('Paste a stylesheet to audit.');
  const normalized = explicitNesting(css);
  if (!normalized.ok) return normalized;
  const entries: Entry[] = [];
  const layerChildren = new Map<string, string[]>();
  const notes = new Set<string>();
  let rule = 0;
  let total = 0;
  let anonymous = 0;
  let layerBytes = 0;
  let failure: string | null = null;
  const register = (name: string, parent: string | null): string => {
    let path = parent ?? '';
    for (const range of splitTopLevel(name, '.')) {
      if (failure) break;
      const raw = name.slice(range.start, range.end).trim();
      const part = raw.startsWith('(anonymous ') ? raw : ident.encode(ident.decode(raw));
      const children = layerChildren.get(path) ?? [];
      const next = path ? `${path}.${part}` : part;
      if (!children.includes(next)) {
        layerBytes += new TextEncoder().encode(next).length;
        if (layerBytes > MAX_CSS_BYTES) {
          failure = 'Expanded layer paths exceed 100 KB. Shorten the layer names or nesting.';
          break;
        }
        children.push(next);
      }
      layerChildren.set(path, children);
      path = next;
    }
    return path;
  };
  const emit = (selector: string, line: number, declarations: ReadonlyArray<Declaration>, frame: Frame) => {
    rule++;
    const importantCount = declarations.filter(
      (item) => item.important === true || String(item.important).toLowerCase() === 'important',
    ).length;
    for (const range of splitTopLevel(selector)) {
      total++;
      if (entries.length >= MAX_ENTRIES) continue;
      const text = selector.slice(range.start, range.end).trim();
      const leading = selector.slice(range.start, range.end).search(/\S/);
      const selectorLine =
        line + (selector.slice(0, range.start + Math.max(0, leading)).match(/\n/g)?.length ?? 0);
      const scored = calculate(text);
      if (!scored.ok) {
        failure = `Line ${line}: ${scored.error.message}`;
        return;
      }
      const score = scored.value[0];
      if (!score) {
        failure = `Line ${line}: empty selector.`;
        return;
      }
      entries.push({
        index: entries.length,
        rule,
        selector: score.selector,
        specificity: score.value,
        line: selectorLine,
        context: frame.context,
        layer: frame.layer,
        declarations: declarations.length,
        important: importantCount > 0,
        importantCount,
        compounds: 1 + score.parts.filter((part) => part.kind === 'combinator').length,
        warnings: score.warnings,
      });
    }
  };
  const expand = (parent: string | null, child: string, line: number): string | null => {
    if (!parent && !hasNesting(child)) return child;
    const expanded = expandNesting(parent ? `${parent}{${child}{}}` : `${child}{}`);
    if (!expanded.ok) {
      failure = `Line ${line}: ${expanded.error.message}`;
      return null;
    }
    return expanded.value.rules.at(-1)?.selector ?? null;
  };
  const visit = (nodes: Iterable<Node>, frame: Frame, initialLine?: number) => {
    let declarations: Declaration[] = [];
    let first = initialLine !== undefined;
    const flush = () => {
      if (frame.parents && (first || declarations.length)) {
        const selector = first
          ? frame.parents
          : expand(frame.parents, '&', declarations[0]?.loc?.start.line ?? 1);
        if (selector)
          emit(
            selector,
            first ? (initialLine ?? 1) : (declarations[0]?.loc?.start.line ?? 1),
            declarations,
            frame,
          );
      }
      declarations = [];
      first = false;
    };
    for (const node of nodes) {
      if (failure) return;
      if (node.type === 'Declaration') {
        declarations.push(node);
        continue;
      }
      flush();
      if (node.type === 'Raw') {
        if (node.value.trim() && node.value.trim() !== ';')
          failure = `Unrecognized CSS near line ${node.loc?.start.line ?? 1}.`;
        continue;
      }
      if (node.type === 'Rule') {
        const line = node.loc?.start.line ?? 1;
        const source = normalized.value.selectors.get(node.loc?.start.offset ?? -1) ?? node.prelude.value;
        const selectors = expand(frame.parents, source, line);
        if (selectors) visit(node.block.children, { ...frame, parents: selectors }, line);
        continue;
      }
      const name = node.name.toLowerCase();
      const prelude = (
        node.prelude?.loc
          ? normalized.value.css.slice(node.prelude.loc.start.offset, node.prelude.loc.end.offset)
          : ''
      )
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();
      if (name === 'layer') {
        const names = splitTopLevel(prelude).map((range) => prelude.slice(range.start, range.end).trim());
        if (
          (!prelude && !node.block) ||
          (node.block && names.length > 1) ||
          (prelude && names.some((item) => !item))
        ) {
          failure = 'Invalid @layer declaration.';
          continue;
        }
        const paths = (prelude ? names : [`(anonymous ${++anonymous})`]).map((item) =>
          register(item, frame.layer),
        );
        if (node.block) visit(node.block.children, { ...frame, layer: paths[0] ?? null });
      } else if (GROUP.test(`@${name}`) && node.block) {
        visit(node.block.children, {
          ...frame,
          context: [...frame.context, `@${name}${prelude ? ` ${prelude}` : ''}`],
        });
      } else {
        notes.add(
          `@${name} is not audited${name === 'import' ? '; external stylesheets and resources are never fetched' : ' (not a supported style-rule group)'}.`,
        );
      }
    }
    flush();
  };
  try {
    const ast = parse(normalized.value.css, {
      context: 'stylesheet',
      positions: true,
      parseRulePrelude: false,
      parseAtrulePrelude: true,
      parseValue: false,
      onParseError(error) {
        throw error;
      },
    });
    visit(ast.children, { parents: null, layer: null, context: [] });
  } catch (error: unknown) {
    return err(
      `This stylesheet could not be parsed: ${error instanceof Error ? error.message : 'invalid CSS'}`,
    );
  }
  if (failure) return err(failure);
  const layers: string[] = [];
  const pending = [...(layerChildren.get('') ?? [])].reverse();
  while (pending.length) {
    const path = pending.pop();
    if (path === undefined) break;
    layers.push(path);
    pending.push(...[...(layerChildren.get(path) ?? [])].reverse());
  }
  return ok({ entries, layers, truncated: total > MAX_ENTRIES, notes: [...notes] });
}

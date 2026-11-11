/**
 * Builds view models from raw inputs. The specificity calculator is injected so the
 * browser can load it lazily while the build runs it eagerly.
 */
import { compare } from '../cascade/compare';
import { resolveCascade } from '../cascade/cascade';
import { compareSpecificity, formatSpecificity } from '../cascade/math';
import { expandNesting } from '../cascade/nesting';
import { suggestFixes } from '../cascade/suggest';
import type { CascadeDeclaration, CascadeResult } from '../cascade/cascade';
import type { Comparison } from '../cascade/compare';
import type { ExpandedRule } from '../cascade/nesting';
import type { AppInputs, CascadeRow } from '../cascade/share';
import type { Suggestion } from '../cascade/suggest';
import type { ParseError, Result, Specificity, SpecificityResult } from '../cascade/types';

export type Calc = (input: string) => Result<ReadonlyArray<SpecificityResult>>;

export interface ContenderModel {
  readonly input: string;
  /** Every selector in the input's list, or the parse error. */
  readonly parsed: Result<ReadonlyArray<SpecificityResult>>;
  /** The strongest selector in the list: what the rule scores. */
  readonly best: SpecificityResult | null;
}

export interface DuelModel {
  readonly contenders: ReadonlyArray<ContenderModel>;
  readonly comparison: Comparison | null;
  readonly targetIndex: number | null;
  readonly suggestions: ReadonlyArray<Suggestion>;
  readonly announcement: string;
}

export interface NestingRuleModel {
  readonly rule: ExpandedRule;
  readonly specificities: ReadonlyArray<Result<Specificity>>;
}

export type NestingModel =
  | {
      readonly ok: true;
      readonly rules: ReadonlyArray<NestingRuleModel>;
      readonly notes: ReadonlyArray<string>;
    }
  | { readonly ok: false; readonly error: ParseError };

export interface CascadeRowModel {
  readonly row: CascadeRow;
  readonly id: string;
  readonly error: ParseError | null;
  readonly specificity: Specificity | null;
}

export interface CascadeModel {
  readonly property: string;
  readonly layerOrder: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<CascadeRowModel>;
  readonly result: CascadeResult | null;
  readonly problem: string | null;
}

const spoken = (s: Specificity) => `${s[0]}, ${s[1]}, ${s[2]}`;

export function buildContender(input: string, calc: Calc): ContenderModel {
  const parsed = calc(input);
  let best: SpecificityResult | null = null;
  if (parsed.ok)
    for (const r of parsed.value) if (!best || compareSpecificity(r.value, best.value) > 0) best = r;
  return { input, parsed, best };
}

export function buildDuel(
  selectors: ReadonlyArray<string>,
  calc: Calc,
  requestedTarget: number | null = null,
): DuelModel {
  const contenders = selectors.map((s) => buildContender(s, calc));
  const valid = contenders.every((c) => c.best !== null);
  if (!valid || contenders.length < 2) {
    const broken = contenders.findIndex((c) => !c.parsed.ok);
    return {
      contenders,
      comparison: null,
      targetIndex: null,
      suggestions: [],
      announcement:
        broken >= 0 ? `Selector ${broken + 1} has a problem. ${messageOf(contenders[broken])}` : '',
    };
  }

  const ranked = contenders.map((c) => ({
    selector: c.best?.selector ?? c.input,
    value: c.best?.value ?? ([0, 0, 0] as const),
    parts: c.best?.parts ?? [],
  }));
  const comparison = compare(ranked);
  const winnerIndex = comparison.effectiveWinner;
  const targetIndex =
    requestedTarget !== null && requestedTarget !== winnerIndex && requestedTarget < contenders.length
      ? requestedTarget
      : comparison.runnerUp;

  const winner = ranked[winnerIndex];
  const target = ranked[targetIndex];
  const suggestions =
    winner && target && targetIndex !== winnerIndex
      ? suggestFixes({ winner, target, targetIsLater: targetIndex > winnerIndex })
      : [];

  const rival = ranked[comparison.runnerUp];
  let announcement = '';
  if (winner && rival) {
    announcement =
      comparison.winner === 'tie'
        ? `${winner.selector} wins because it is written later. Both have specificity ${spoken(winner.value)}.`
        : `${winner.selector} wins. Specificity ${spoken(winner.value)} versus ${spoken(rival.value)}.`;
  }
  return { contenders, comparison, targetIndex, suggestions, announcement };
}

function messageOf(c: ContenderModel | undefined): string {
  return c && !c.parsed.ok ? c.parsed.error.message : '';
}

export function buildNesting(css: string, calc: Calc): NestingModel {
  const expanded = expandNesting(css);
  if (!expanded.ok) return { ok: false, error: expanded.error };
  const rules = expanded.value.rules.map((rule) => ({
    rule,
    specificities: rule.selectors.map((s): Result<Specificity> => {
      const r = calc(s);
      if (!r.ok) return r;
      const first = r.value[0];
      return first
        ? { ok: true, value: first.value }
        : { ok: false, error: { message: 'Empty selector.', position: null } };
    }),
  }));
  return { ok: true, rules, notes: expanded.value.notes };
}

export function buildCascade(state: AppInputs['cascade'], calc: Calc): CascadeModel {
  const rows: CascadeRowModel[] = state.rows.map((row, i) => {
    const id = `d${i + 1}`;
    if (row.inline) return { row, id, error: null, specificity: null };
    const parsed = calc(row.selector);
    if (!parsed.ok) return { row, id, error: parsed.error, specificity: null };
    let best: Specificity | null = null;
    for (const r of parsed.value) if (!best || compareSpecificity(r.value, best) > 0) best = r.value;
    return { row, id, error: null, specificity: best };
  });

  const orders = state.rows.map((r) => r.order);
  let problem: string | null = null;
  if (rows.some((r) => r.error)) problem = 'Fix the highlighted selector to resolve the cascade.';
  else if (new Set(orders).size !== orders.length) {
    problem = 'Two declarations share the same source order. Give each one a different number.';
  }

  let result: CascadeResult | null = null;
  if (!problem) {
    const declarations: CascadeDeclaration[] = rows.map((r) => ({
      id: r.id,
      selector: r.row.inline ? 'style attribute' : r.row.selector.trim(),
      value: r.row.value,
      origin: 'author',
      context: 'outer',
      important: r.row.important,
      inline: r.row.inline,
      layer: r.row.inline ? null : r.row.layer,
      scope: r.row.inline ? null : r.row.scope,
      specificity: r.specificity ?? [0, 0, 0],
      order: r.row.order,
    }));
    const resolved = resolveCascade({ declarations, layerOrder: state.layerOrder });
    if (resolved.ok) result = resolved.value;
    else problem = resolved.error.message;
  }
  return { property: state.property, layerOrder: state.layerOrder, rows, result, problem };
}

/** CSS that the cascade inputs describe, for display. */
export function cascadeAsCss(model: CascadeModel): string {
  const property = model.property.trim() || 'color';
  const lines: string[] = [];
  const layers = model.result?.layerOrder ?? model.layerOrder;
  if (layers.length > 0) lines.push(`@layer ${layers.join(', ')};`, '');
  const sorted = [...model.rows].sort((a, b) => a.row.order - b.row.order);
  for (const { row } of sorted) {
    const decl = `${property}: ${row.value || 'initial'}${row.important ? ' !important' : ''};`;
    if (row.inline) {
      lines.push(`/* order ${row.order}: inline */`, `<el style="${decl}">`, '');
      continue;
    }
    let block = `${row.selector.trim() || '*'} { ${decl} }`;
    if (row.scope) block = `@scope (${row.scope.root}) {\n  ${block.replace(/\n/g, '\n  ')}\n}`;
    if (row.layer) block = `@layer ${row.layer} {\n  ${block.replace(/\n/g, '\n  ')}\n}`;
    lines.push(
      `/* order ${row.order}${row.scope ? `, ${row.scope.proximity} steps from ${row.scope.root}` : ''} */`,
      block,
      '',
    );
  }
  return lines.join('\n').trim();
}

export { formatSpecificity };

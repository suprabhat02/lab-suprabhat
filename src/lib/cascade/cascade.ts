import { compareSpecificity, formatSpecificity } from './math';
import { err, ok } from './types';
import type { Result, Specificity } from './types';

/** Cascade origins (css-cascade-6). v1 of the UI only uses `author`. */
export type Origin = 'user-agent' | 'user' | 'author' | 'animation' | 'transition';
/** Encapsulation context: `outer` is the light DOM, `inner` a shadow tree. v1 of the UI keeps it `outer`. */
export type Context = 'outer' | 'inner';
export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type StepOutcome = 'decided' | 'tie' | 'not-reached';

export interface ScopeInfo {
  /** The scoping root selector, e.g. `.card`. */
  readonly root: string;
  /** DOM generations between the scoping root and the element. */
  readonly proximity: number;
}

export interface CascadeDeclaration {
  readonly id: string;
  /** Selector text, shown in explanations. Ignored for inline styles. */
  readonly selector: string;
  readonly value: string;
  readonly origin: Origin;
  readonly context: Context;
  readonly important: boolean;
  readonly inline: boolean;
  /** Layer name, or `null` when unlayered. */
  readonly layer: string | null;
  readonly scope: ScopeInfo | null;
  readonly specificity: Specificity;
  /** Order of appearance; higher is later. */
  readonly order: number;
}

export interface CascadeInput {
  readonly declarations: ReadonlyArray<CascadeDeclaration>;
  /** Declared layer order, earliest first, as in `@layer a, b;`. */
  readonly layerOrder: ReadonlyArray<string>;
}

export interface CascadeStep {
  readonly step: StepNumber;
  readonly name: string;
  readonly outcome: StepOutcome;
  readonly explanation: string;
  /** Ids still in the running after this step. */
  readonly remaining: ReadonlyArray<string>;
}

export interface CascadeResult {
  readonly winnerId: string;
  /** `null` when there was only one declaration, so nothing had to be decided. */
  readonly decidedAtStep: StepNumber | null;
  readonly steps: ReadonlyArray<CascadeStep>;
  readonly summary: string;
  /** Layer order actually used: declared layers, then undeclared ones in order of first appearance. */
  readonly layerOrder: ReadonlyArray<string>;
}

export const STEP_NAMES: Readonly<Record<StepNumber, string>> = {
  1: 'Origin and importance',
  2: 'Context',
  3: 'Element-attached styles',
  4: 'Layers',
  5: 'Specificity',
  6: 'Scope proximity',
  7: 'Order of appearance',
};

const STEPS: readonly StepNumber[] = [1, 2, 3, 4, 5, 6, 7];

/** Precedence of origin + importance, highest first in css-cascade-6. */
function originRank(d: CascadeDeclaration): number {
  if (d.origin === 'transition') return 8;
  if (d.origin === 'animation') return 4;
  const table: Record<'user-agent' | 'user' | 'author', readonly [normal: number, important: number]> = {
    'user-agent': [1, 7],
    user: [2, 6],
    author: [3, 5],
  };
  return table[d.origin][d.important ? 1 : 0];
}

const isImportant = (d: CascadeDeclaration) =>
  d.important && d.origin !== 'animation' && d.origin !== 'transition';

const ORIGIN_NAMES: Record<Origin, string> = {
  'user-agent': 'browser default',
  user: 'user',
  author: 'author',
  animation: 'animation',
  transition: 'transition',
};

function bucketName(d: CascadeDeclaration): string {
  if (d.origin === 'animation' || d.origin === 'transition') return `${ORIGIN_NAMES[d.origin]} styles`;
  return `${isImportant(d) ? '`!important` ' : 'normal '}${ORIGIN_NAMES[d.origin]} declarations`;
}

/** Final layer order: declared names first, then any others in order of first appearance. */
export function resolveLayerOrder(input: CascadeInput): string[] {
  const order = [...new Set(input.layerOrder.map((l) => l.trim()).filter(Boolean))];
  const byAppearance = [...input.declarations].sort((x, y) => x.order - y.order);
  for (const d of byAppearance) if (d.layer && !order.includes(d.layer)) order.push(d.layer);
  return order;
}

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const list = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;

/** Resolves which declaration wins, following css-cascade-6 step by step. Never throws. */
export function resolveCascade(input: CascadeInput): Result<CascadeResult> {
  const all = input.declarations;
  if (all.length === 0) return err('Add at least one declaration to resolve.');
  if (new Set(all.map((d) => d.id)).size !== all.length) return err('Each declaration needs a unique id.');

  const layerOrder = resolveLayerOrder(input);
  const index = new Map(all.map((d, i) => [d.id, i]));
  const duplicates = new Set(
    all
      .filter((d, i) => all.findIndex((o) => o.selector === d.selector && o.inline === d.inline) !== i)
      .map((d) => d.selector),
  );
  const label = (d: CascadeDeclaration) => {
    const base = d.inline ? 'the inline style' : `\`${d.selector}\``;
    return duplicates.has(d.selector) || (d.inline && all.filter((o) => o.inline).length > 1)
      ? `${base} (declaration ${(index.get(d.id) ?? 0) + 1})`
      : base;
  };
  const Label = (d: CascadeDeclaration) => {
    const l = label(d);
    return l.charAt(0).toUpperCase() + l.slice(1);
  };

  const layerRank = (d: CascadeDeclaration, important: boolean): number => {
    const n = layerOrder.length;
    const i = d.layer && !d.inline ? layerOrder.indexOf(d.layer) : -1;
    if (important) return i === -1 ? -1 : n - i;
    return i === -1 ? n : i;
  };

  const comparators: Record<
    StepNumber,
    (x: CascadeDeclaration, y: CascadeDeclaration, important: boolean) => number
  > = {
    1: (x, y) => originRank(x) - originRank(y),
    2: (x, y, important) => {
      const rank = (d: CascadeDeclaration) =>
        important ? (d.context === 'inner' ? 1 : 0) : d.context === 'outer' ? 1 : 0;
      return rank(x) - rank(y);
    },
    3: (x, y) => Number(x.inline) - Number(y.inline),
    4: (x, y, important) => layerRank(x, important) - layerRank(y, important),
    5: (x, y) => (x.inline || y.inline ? 0 : compareSpecificity(x.specificity, y.specificity)),
    6: (x, y) => (y.scope?.proximity ?? Infinity) - (x.scope?.proximity ?? Infinity) || 0,
    7: (x, y) => x.order - y.order || (index.get(x.id) ?? 0) - (index.get(y.id) ?? 0),
  };

  /** Why `w` beat `l` at a step. */
  const reason = (
    step: StepNumber,
    w: CascadeDeclaration,
    l: CascadeDeclaration,
    important: boolean,
  ): string => {
    switch (step) {
      case 1:
        return `${Label(w)} is one of the ${bucketName(w)}, which beat ${bucketName(l)}.`;
      case 2:
        return important
          ? 'For `!important` declarations the shadow tree (inner context) beats the outer page.'
          : 'For normal declarations the outer page beats styles from inside a shadow tree.';
      case 3:
        return important
          ? 'An inline `style` with `!important` beats any author `!important` from a stylesheet.'
          : 'An inline `style` attribute beats every normal rule from a stylesheet, whatever its specificity.';
      case 4: {
        if (important) {
          return l.layer === null || l.inline
            ? `For \`!important\` the layer order reverses: layered \`!important\` (here \`${w.layer ?? ''}\`) beats unlayered \`!important\`.`
            : `For \`!important\` the layer order reverses: the earlier layer \`${w.layer ?? ''}\` beats \`${l.layer}\`.`;
        }
        return w.layer === null || w.inline
          ? 'The unlayered rule beats any layered rule for normal declarations, so specificity never got a vote.'
          : `Layer \`${w.layer}\` comes later than \`${l.layer ?? ''}\` in the layer order, and later layers win for normal declarations.`;
      }
      case 5:
        return `${Label(w)} has the higher specificity: ${formatSpecificity(w.specificity)} beats ${formatSpecificity(l.specificity)}.`;
      case 6:
        return l.scope === null
          ? `${Label(w)} is scoped (${w.scope?.proximity ?? 0} ${w.scope?.proximity === 1 ? 'step' : 'steps'} from \`${w.scope?.root ?? ''}\`); an unscoped rule counts as infinitely far away.`
          : `${Label(w)} is closer to its scope root: ${w.scope?.proximity ?? 0} ${w.scope?.proximity === 1 ? 'step' : 'steps'} versus ${l.scope?.proximity ?? 0}. Fewer steps wins.`;
      case 7:
        return `${Label(w)} is written later, so it wins.`;
    }
  };

  /** Why nobody was eliminated at a step. */
  const sameness = (step: StepNumber, ds: readonly CascadeDeclaration[]): string => {
    const first = ds[0];
    if (!first) return '';
    switch (step) {
      case 1:
        return `All are ${bucketName(first)}.`;
      case 2:
        return first.context === 'outer'
          ? 'All come from the page itself; no shadow tree is involved.'
          : 'All come from the same shadow tree.';
      case 3:
        return first.inline ? 'All are inline styles.' : 'None are inline styles.';
      case 4:
        return first.layer === null || first.inline
          ? 'All are unlayered.'
          : `All are in the same layer, \`${first.layer}\`.`;
      case 5:
        return first.inline
          ? "Inline styles have no selector, so there's no specificity to compare."
          : `All have the same specificity, ${formatSpecificity(first.specificity)}.`;
      case 6:
        return first.scope === null
          ? 'No `@scope` rules are involved.'
          : `All are the same distance from their scope root: ${first.scope.proximity} ${first.scope.proximity === 1 ? 'step' : 'steps'}.`;
      case 7:
        return 'They share the same position.';
    }
  };

  let alive = [...all];
  let decidedAtStep: StepNumber | null = null;
  const steps: CascadeStep[] = [];

  for (const step of STEPS) {
    const name = STEP_NAMES[step];
    if (alive.length === 1) {
      steps.push({
        step,
        name,
        outcome: 'not-reached',
        explanation: decidedAtStep
          ? 'Not reached: the winner was already decided.'
          : 'Only one declaration, so there is nothing to compare.',
        remaining: alive.map((d) => d.id),
      });
      continue;
    }
    const important = alive[0] ? isImportant(alive[0]) : false;
    const cmp = comparators[step];
    let best = alive[0];
    for (const d of alive) if (best && cmp(d, best, important) > 0) best = d;
    const top = best;
    if (!top) break;
    const survivors = alive.filter((d) => cmp(d, top, important) === 0);
    const losers = alive.filter((d) => cmp(d, top, important) !== 0);
    // The strongest of the eliminated declarations explains the decision best.
    let rival = losers[0];
    for (const d of losers) if (rival && cmp(d, rival, important) > 0) rival = d;

    if (survivors.length === 1 && rival) {
      decidedAtStep = step;
      steps.push({
        step,
        name,
        outcome: 'decided',
        explanation: reason(step, top, rival, important),
        remaining: [top.id],
      });
    } else if (rival) {
      steps.push({
        step,
        name,
        outcome: 'tie',
        explanation: `${reason(step, top, rival, important)} Still tied: ${list(survivors.map(label))}.`,
        remaining: survivors.map((d) => d.id),
      });
    } else {
      steps.push({
        step,
        name,
        outcome: 'tie',
        explanation: sameness(step, alive),
        remaining: alive.map((d) => d.id),
      });
    }
    alive = survivors;
  }

  const winner = alive[0] ?? all[0];
  if (!winner) return err('Add at least one declaration to resolve.');
  const decided = decidedAtStep ? steps[decidedAtStep - 1] : undefined;
  const summary =
    decidedAtStep && decided
      ? `Decided at step ${decidedAtStep}, ${STEP_NAMES[decidedAtStep].toLowerCase()}: ${lowerFirst(decided.explanation)}`
      : 'Only one declaration, so it wins without a contest.';

  return ok(
    Object.freeze({
      winnerId: winner.id,
      decidedAtStep,
      steps: Object.freeze(steps.map((s) => Object.freeze(s))),
      summary,
      layerOrder: Object.freeze(layerOrder),
    }),
  );
}

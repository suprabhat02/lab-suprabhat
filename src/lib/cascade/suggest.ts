import { compareSpecificity, formatSpecificity } from './math';
import type { SelectorPart, Specificity } from './types';

export type SuggestionKind = 'where' | 'layer' | 'raise' | 'important';

export interface Suggestion {
  readonly kind: SuggestionKind;
  readonly title: string;
  readonly detail: string;
  /** Example CSS, or `null` when the approach doesn't apply. */
  readonly code: string | null;
  readonly warning?: string;
}

export interface Ranked {
  readonly selector: string;
  readonly value: Specificity;
  readonly parts: ReadonlyArray<SelectorPart>;
}

export interface SuggestInput {
  /** The selector that currently wins. */
  readonly winner: Ranked;
  /** The selector you want to win. */
  readonly target: Ranked;
  /** Whether `target` is written after `winner`. */
  readonly targetIsLater: boolean;
}

/** Number of repeated classes `target` needs to beat `winner`, or null when only an ID would do. */
export function classesNeeded(winner: Specificity, target: Specificity, targetIsLater: boolean): number | null {
  if (winner[0] > target[0]) return null;
  if (target[0] > winner[0]) return 0;
  const gap = winner[1] - target[1];
  if (gap < 0) return 0;
  const winsOnRest = target[2] > winner[2] || (target[2] === winner[2] && targetIsLater);
  return gap + (winsOnRest ? 0 : 1);
}

function repeatLast(target: Ranked, kinds: ReadonlyArray<SelectorPart['kind']>, times: number): string | null {
  const offset = target.parts[0]?.start ?? 0;
  const part = [...target.parts].reverse().find((p) => kinds.includes(p.kind));
  if (!part) return null;
  const at = part.end - offset;
  return target.selector.slice(0, at) + part.text.repeat(times) + target.selector.slice(at);
}

/** Rule-based fixes for making `target` win, from least to most heavy-handed. */
export function suggestFixes({ winner, target, targetIsLater }: SuggestInput): ReadonlyArray<Suggestion> {
  const w = `\`${winner.selector}\``;
  const t = `\`${target.selector}\``;
  const suggestions: Suggestion[] = [];

  const zero: Specificity = [0, 0, 0];
  const afterWhere = compareSpecificity(target.value, zero);
  suggestions.push({
    kind: 'where',
    title: 'Lower the winner with :where()',
    detail:
      afterWhere > 0 || targetIsLater
        ? `Wrap ${w} in \`:where()\` so it scores (0,0,0). Then ${t} wins with ${formatSpecificity(target.value)}.`
        : `Wrap ${w} in \`:where()\` so it scores (0,0,0). ${t} also scores (0,0,0), so write it after ${w}.`,
    code: `:where(${winner.selector}) {\n  /* … */\n}`,
  });

  suggestions.push({
    kind: 'layer',
    title: 'Move the rules into ordered layers',
    detail: `Layers are compared before specificity. Put ${w} in an earlier layer and ${t} in a later one, and ${t} wins whatever the scores.`,
    code: `@layer base, components;\n\n@layer base {\n  ${winner.selector} { /* … */ }\n}\n\n@layer components {\n  ${target.selector} { /* … */ }\n}`,
  });

  const needed = classesNeeded(winner.value, target.value, targetIsLater);
  if (needed === null) {
    suggestions.push({
      kind: 'raise',
      title: 'Raise the loser',
      detail: `${w} has more IDs, and no number of classes beats an ID. Lower the winner or use layers instead.`,
      code: null,
    });
  } else if (needed > 0) {
    const raised =
      repeatLast(target, ['class'], needed) ?? repeatLast(target, ['attribute'], needed) ?? null;
    const value: Specificity = [target.value[0], target.value[1] + needed, target.value[2]];
    const outcome =
      compareSpecificity(value, winner.value) === 0
        ? `${formatSpecificity(value)} ties with ${formatSpecificity(winner.value)}, and ${t} is written later, so it wins`
        : `${formatSpecificity(value)} beats ${formatSpecificity(winner.value)}`;
    suggestions.push({
      kind: 'raise',
      title: 'Raise the loser by repeating a class',
      detail: raised
        ? `Repeat a class in ${t} to add ${needed} to the second column without adding an ID: ${outcome}.`
        : `${t} has no class to repeat. Add a class to the element and include it ${needed === 1 ? 'once' : `${needed} times`} in the selector: ${outcome}.`,
      code: raised ? `${raised} {\n  /* … */\n}` : `${target.selector}${'.your-class'.repeat(needed)} {\n  /* … */\n}`,
    });
  }

  suggestions.push({
    kind: 'important',
    title: 'Use !important (last resort)',
    detail: `Mark the declaration in ${t} as \`!important\`. It wins over every normal declaration, whatever the specificity.`,
    code: `${target.selector} {\n  color: rebeccapurple !important;\n}`,
    warning:
      'Only another `!important` can beat it, and inside layers the order reverses. It tends to start an arms race, so reach for it last.',
  });

  return Object.freeze(suggestions.map((s) => Object.freeze(s)));
}

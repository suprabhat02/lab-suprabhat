import { compare } from '../cascade/compare';
import type { Specificity } from '../cascade/types';
import type { Entry } from './types';

export function compareEntries(left: Entry, right: Entry): number {
  const result = compare([
    { selector: left.selector, value: left.specificity },
    { selector: right.selector, value: right.specificity },
  ]);
  return result.winner === 'tie' ? 0 : result.winner === 0 ? 1 : -1;
}

export interface Metrics {
  readonly selectors: number;
  readonly rules: number;
  readonly important: number;
  readonly ids: number;
  readonly maximum: Entry | null;
  readonly median: Specificity | null;
  readonly histogram: {
    readonly id: number;
    readonly class: number;
    readonly type: number;
    readonly zero: number;
  };
}

export function metrics(entries: ReadonlyArray<Entry>): Metrics {
  const sorted = [...entries].sort(compareEntries);
  const rules = new Map(entries.map((entry) => [entry.rule, entry.importantCount]));
  const histogram = { id: 0, class: 0, type: 0, zero: 0 };
  for (const {
    specificity: [a, b, c],
  } of entries)
    histogram[a ? 'id' : b ? 'class' : c ? 'type' : 'zero']++;
  return {
    selectors: entries.length,
    rules: rules.size,
    important: [...rules.values()].reduce((sum, count) => sum + count, 0),
    ids: histogram.id,
    maximum: sorted.at(-1) ?? null,
    median: sorted[Math.floor((sorted.length - 1) / 2)]?.specificity ?? null,
    histogram,
  };
}

export const displayValue = ([a, b, c]: Specificity): number =>
  Math.min(a, 9) * 100 + Math.min(b, 9) * 10 + Math.min(c, 9);

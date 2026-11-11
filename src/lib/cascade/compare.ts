import { compareSpecificity } from './math';
import type { Specificity } from './types';

export type Column = 'a' | 'b' | 'c';

export interface Contender {
  readonly selector: string;
  readonly value: Specificity;
}

export interface Comparison {
  /** Index of the winner, or `'tie'` when the top specificities are equal. */
  readonly winner: number | 'tie';
  /** Who actually applies: on a tie, the selector written later. */
  readonly effectiveWinner: number;
  /** The strongest rival of the effective winner. */
  readonly runnerUp: number;
  readonly decidedBy: Column | 'order';
  readonly reason: string;
}

const COLUMNS: readonly Column[] = ['a', 'b', 'c'];
const ORDINAL: Record<Column, string> = { a: 'first', b: 'second', c: 'third' };
const NOUNS: Record<Column, readonly [one: string, many: string]> = {
  a: ['ID', 'IDs'],
  b: ['class, attribute or pseudo-class', 'classes, attributes or pseudo-classes'],
  c: ['type or pseudo-element', 'types or pseudo-elements'],
};

export const columnIndex = (column: Column): 0 | 1 | 2 => (column === 'a' ? 0 : column === 'b' ? 1 : 2);

/** "1 ID beats 0", "3 classes, attributes or pseudo-classes beat 2". */
export function columnSentence(column: Column, winning: number, losing: number): string {
  const [one, many] = NOUNS[column];
  return `${winning} ${winning === 1 ? one : many} ${winning === 1 ? 'beats' : 'beat'} ${losing}`;
}

/** First column (A, B, C) where two specificities differ, or null when equal. */
export function decidingColumn(x: Specificity, y: Specificity): Column | null {
  for (const column of COLUMNS) {
    const i = columnIndex(column);
    if (x[i] !== y[i]) return column;
  }
  return null;
}

/** Compares any number of selectors written in order; later ones win ties. */
export function compare(contenders: ReadonlyArray<Contender>): Comparison {
  if (contenders.length < 2) {
    return { winner: 0, effectiveWinner: 0, runnerUp: 0, decidedBy: 'order', reason: 'Add another selector to compare.' };
  }

  let best = 0;
  contenders.forEach((c, i) => {
    const current = contenders[best];
    if (current && compareSpecificity(c.value, current.value) > 0) best = i;
  });
  const top = contenders[best]?.value ?? [0, 0, 0];
  const tied = contenders.flatMap((c, i) => (compareSpecificity(c.value, top) === 0 ? [i] : []));

  if (tied.length > 1) {
    const effectiveWinner = tied.at(-1) ?? best;
    const runnerUp = tied.at(-2) ?? best;
    const name = contenders[effectiveWinner]?.selector ?? '';
    return {
      winner: 'tie',
      effectiveWinner,
      runnerUp,
      decidedBy: 'order',
      reason: `Same specificity: the one written later wins, so \`${name}\` wins.`,
    };
  }

  let runnerUp = best === 0 ? 1 : 0;
  contenders.forEach((c, i) => {
    const current = contenders[runnerUp];
    if (i !== best && current && compareSpecificity(c.value, current.value) >= 0) runnerUp = i;
  });
  const winner = contenders[best];
  const rival = contenders[runnerUp];
  const column = winner && rival ? decidingColumn(winner.value, rival.value) : null;
  if (!winner || !rival || !column) {
    return { winner: best, effectiveWinner: best, runnerUp, decidedBy: 'order', reason: '' };
  }
  const i = columnIndex(column);
  const rivalNote = contenders.length > 2 ? ` Its closest rival is \`${rival.selector}\`.` : '';
  return {
    winner: best,
    effectiveWinner: best,
    runnerUp,
    decidedBy: column,
    reason: `\`${winner.selector}\` wins in the ${ORDINAL[column]} column: ${columnSentence(column, winner.value[i], rival.value[i])}.${rivalNote}`,
  };
}

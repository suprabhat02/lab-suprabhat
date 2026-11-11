import type { Specificity } from './types';

export const ZERO: Specificity = [0, 0, 0];

export const add = (x: Specificity, y: Specificity): Specificity => [x[0] + y[0], x[1] + y[1], x[2] + y[2]];

/** Negative when `x` is weaker, positive when stronger, 0 when equal. */
export const compareSpecificity = (x: Specificity, y: Specificity): number =>
  x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

export const formatSpecificity = (s: Specificity): string => `(${s[0]},${s[1]},${s[2]})`;

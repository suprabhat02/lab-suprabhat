import type { Specificity } from '../cascade/types';

export interface Entry {
  readonly index: number;
  readonly rule: number;
  readonly selector: string;
  readonly specificity: Specificity;
  readonly line: number;
  readonly context: ReadonlyArray<string>;
  readonly layer: string | null;
  readonly declarations: number;
  readonly important: boolean;
  readonly importantCount: number;
  readonly compounds: number;
  readonly warnings: ReadonlyArray<string>;
}

export interface Stylesheet {
  readonly entries: ReadonlyArray<Entry>;
  readonly layers: ReadonlyArray<string>;
  readonly truncated: boolean;
  readonly notes: ReadonlyArray<string>;
}

export type IssueCode =
  'id-selector' | 'important' | 'deep-selector' | 'duplicate-selector' | 'specificity-spike';
export interface Finding {
  readonly code: IssueCode;
  readonly message: string;
  readonly entries: ReadonlyArray<number>;
  readonly line: number;
  readonly fix: string;
  readonly snippet: string;
}

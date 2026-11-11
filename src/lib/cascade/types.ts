/** (A, B, C): IDs; classes, attributes and pseudo-classes; types and pseudo-elements. */
export type Specificity = readonly [a: number, b: number, c: number];

export type PartKind =
  | 'id'
  | 'class'
  | 'attribute'
  | 'pseudo-class'
  | 'type'
  | 'pseudo-element'
  | 'universal'
  | 'combinator'
  | 'functional';

export interface SelectorPart {
  readonly text: string;
  /** Offset into the original input, inclusive. */
  readonly start: number;
  /** Offset into the original input, exclusive. */
  readonly end: number;
  readonly kind: PartKind;
  readonly contributes: Specificity;
  readonly note?: string;
}

export interface SpecificityResult {
  readonly selector: string;
  readonly value: Specificity;
  readonly parts: ReadonlyArray<SelectorPart>;
  /** Things that parse but deserve attention, e.g. unknown pseudo-classes. */
  readonly warnings: ReadonlyArray<string>;
}

export interface ParseError {
  readonly message: string;
  /** Zero-based character offset into the input, when known. */
  readonly position: number | null;
}

export type Result<T, E = ParseError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = (message: string, position: number | null = null): Result<never> => ({
  ok: false,
  error: { message, position },
});

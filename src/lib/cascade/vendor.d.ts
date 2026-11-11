// Minimal typings for the parts of css-tree and @bramus/specificity the engine uses.

declare module 'css-tree/selector-parser' {
  export interface CssLocation {
    readonly start: { readonly offset: number };
    readonly end: { readonly offset: number };
  }

  interface NodeBase {
    readonly loc?: CssLocation | null;
  }

  /** css-tree's linked list; only iteration and size are used. */
  export interface CssList<T> extends Iterable<T> {
    readonly size: number;
    readonly first: T | null;
    forEach(fn: (item: T) => void): void;
    toArray(): T[];
  }

  export interface SelectorList extends NodeBase {
    readonly type: 'SelectorList';
    readonly children: CssList<Selector>;
  }
  export interface Selector extends NodeBase {
    readonly type: 'Selector';
    readonly children: CssList<SelectorChild>;
  }
  export interface IdSelector extends NodeBase {
    readonly type: 'IdSelector';
    readonly name: string;
  }
  export interface ClassSelector extends NodeBase {
    readonly type: 'ClassSelector';
    readonly name: string;
  }
  export interface AttributeSelector extends NodeBase {
    readonly type: 'AttributeSelector';
  }
  export interface TypeSelector extends NodeBase {
    readonly type: 'TypeSelector';
    readonly name: string;
  }
  export interface Combinator extends NodeBase {
    readonly type: 'Combinator';
    readonly name: string;
  }
  export interface Nth extends NodeBase {
    readonly type: 'Nth';
    readonly selector: SelectorList | null;
  }
  export interface Raw extends NodeBase {
    readonly type: 'Raw';
    readonly value: string;
  }
  export interface Identifier extends NodeBase {
    readonly type: 'Identifier';
    readonly name: string;
  }
  export type PseudoArgument = SelectorList | Selector | Nth | Raw | Identifier;
  export interface PseudoClassSelector extends NodeBase {
    readonly type: 'PseudoClassSelector';
    readonly name: string;
    readonly children: CssList<PseudoArgument> | null;
  }
  export interface PseudoElementSelector extends NodeBase {
    readonly type: 'PseudoElementSelector';
    readonly name: string;
    readonly children: CssList<PseudoArgument> | null;
  }
  export interface NestingSelector extends NodeBase {
    readonly type: 'NestingSelector';
  }

  export type SelectorChild =
    | IdSelector
    | ClassSelector
    | AttributeSelector
    | TypeSelector
    | Combinator
    | PseudoClassSelector
    | PseudoElementSelector
    | NestingSelector;

  export interface ParseOptions {
    readonly context: 'selectorList' | 'selector';
    readonly positions?: boolean;
  }

  /** Throws a SyntaxError carrying `offset` when the input can't be parsed. */
  export default function parse(source: string, options: ParseOptions): SelectorList;
}

declare module '@bramus/specificity/core' {
  import type { Selector, SelectorList } from 'css-tree/selector-parser';

  export interface SpecificityValue {
    readonly a: number;
    readonly b: number;
    readonly c: number;
  }

  export function calculate(selector: string | SelectorList | Selector): SpecificityValue[];
  export function calculateForAST(selector: Selector): SpecificityValue;
}

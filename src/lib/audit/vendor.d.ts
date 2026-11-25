// css-tree 3.2.1 ships no declarations. These shapes match lib/syntax/node and lib/parser/create.js.
declare module 'css-tree/utils' {
  export const ident: {
    decode(value: string): string;
    encode(value: string): string;
  };
}

declare module 'css-tree/parser' {
  import type { CssList } from 'css-tree/selector-parser';
  export interface Location {
    readonly start: { readonly offset: number; readonly line: number };
    readonly end: { readonly offset: number; readonly line: number };
  }
  interface Base {
    readonly loc: Location | null;
  }
  export interface Raw extends Base {
    readonly type: 'Raw';
    readonly value: string;
  }
  export interface Prelude extends Base {
    readonly type: 'AtrulePrelude';
  }
  export interface Declaration extends Base {
    readonly type: 'Declaration';
    readonly important: boolean | string;
    readonly property: string;
  }
  export interface Rule extends Base {
    readonly type: 'Rule';
    readonly prelude: Raw;
    readonly block: Block;
  }
  export interface Atrule extends Base {
    readonly type: 'Atrule';
    readonly name: string;
    readonly prelude: Raw | Prelude | null;
    readonly block: Block | null;
  }
  export type Node = Rule | Atrule | Declaration | Raw;
  export interface Block extends Base {
    readonly type: 'Block';
    readonly children: CssList<Node>;
  }
  export interface StyleSheet extends Base {
    readonly type: 'StyleSheet';
    readonly children: CssList<Node>;
  }
  export default function parse(
    source: string,
    options: {
      readonly context: 'stylesheet';
      readonly positions: true;
      readonly parseRulePrelude: false;
      readonly parseAtrulePrelude: true;
      readonly parseValue: false;
      readonly onParseError: (error: SyntaxError) => void;
    },
  ): StyleSheet;
}

# Engine API

`src/lib/cascade/` is framework-free TypeScript. It has no DOM or Astro imports, so it can be published as its own package later. Import from the barrel:

```ts
import {
  calculate,
  compare,
  expandNesting,
  resolveCascade,
  suggestFixes,
  encodeState,
  decodeState,
} from './lib/cascade';
```

No function throws on bad input. Fallible functions return a `Result`:

```ts
type Result<T, E = ParseError> = { ok: true; value: T } | { ok: false; error: E };
interface ParseError {
  message: string; // plain English, says what's wrong and how to fix it
  position: number | null; // zero-based character offset, when known
}
```

## `calculate(input)` (specificity.ts)

Scores every selector in a comma-separated list. Results are frozen.

```ts
const r = calculate('#nav a, .menu .link:hover');
if (r.ok) {
  r.value[0].value; // [1, 0, 1]
  r.value[1].selector; // '.menu .link:hover'
  r.value[1].parts.map((p) => [p.text, p.kind, p.contributes]);
  // [['.menu','class',[0,1,0]], [' ','combinator',[0,0,0]], ['.link','class',[0,1,0]], [':hover','pseudo-class',[0,1,0]]]
}

calculate('.menu a)');
// { ok: false, error: { message: "This selector couldn't be parsed: unexpected `)` at character 8.", position: 7 } }
```

```ts
interface SpecificityResult {
  selector: string;
  value: readonly [a: number, b: number, c: number];
  parts: ReadonlyArray<SelectorPart>;
  warnings: ReadonlyArray<string>; // unknown pseudo-classes, pseudo-element not last, dropped forgiving arguments
}
interface SelectorPart {
  text: string;
  start: number; // offsets into the original input
  end: number;
  kind:
    | 'id'
    | 'class'
    | 'attribute'
    | 'pseudo-class'
    | 'type'
    | 'pseudo-element'
    | 'universal'
    | 'combinator'
    | 'functional';
  contributes: readonly [number, number, number];
  note?: string; // e.g. why :where() adds zero, or which :is() argument counted
}
```

Edge cases: empty and whitespace-only input, 1,000-character cap, escapes (`#\31 23`), attribute values containing `,` or `)`, Unicode and emoji identifiers, empty `:is()`, and forgiving `:is()`/`:where()` lists (invalid arguments are dropped with a warning, offsets stay stable). `strongest(results)` returns the highest-scoring selector of a list.

The `value` comes from `@bramus/specificity`; the `parts` come from our own walk of the same css-tree AST. The tests assert that the parts always add up to the library's value.

## `compare(contenders)` (compare.ts)

```ts
compare([
  { selector: '#nav a', value: [1, 0, 1] },
  { selector: '.menu .link:hover', value: [0, 3, 0] },
]);
// { winner: 0, effectiveWinner: 0, runnerUp: 1, decidedBy: 'a',
//   reason: '`#nav a` wins in the first column: 1 ID beats 0.' }

compare([
  { selector: '.a', value: [0, 1, 0] },
  { selector: '.b', value: [0, 1, 0] },
]);
// { winner: 'tie', effectiveWinner: 1, decidedBy: 'order',
//   reason: 'Same specificity: the one written later wins, so `.b` wins.' }
```

Works for any number of contenders; with more than two, the reason names the closest rival.

## `expandNesting(css)` (nesting.ts)

```ts
const r = expandNesting('.a, #b { & .c { color: red } }');
// r.value.rules[1] → { source: '& .c', selectors: [':is(.a, #b) .c'], selector: ':is(.a, #b) .c',
//                      depth: 1, atRules: [], declarations: 'color: red' }
```

Handles multi-level nesting, `&` anywhere (`.x &`), implicit `&`, compound `&.b`, nested selector lists, `@media`/`@supports`/`@container`/`@layer`/`@scope` blocks (with a note that they can change order of appearance), comments and strings. A single parent is substituted directly when that's equivalent; a list, or a complex parent in a non-leading position, becomes `:is(…)`. `expandSelector(parents, child)` is exported for single selectors. Input is capped at 2,000 characters.

## `resolveCascade(input)` (cascade.ts)

```ts
const r = resolveCascade({
  layerOrder: ['x'],
  declarations: [
    {
      id: 'p',
      selector: 'p',
      value: 'red',
      origin: 'author',
      context: 'outer',
      important: false,
      inline: false,
      layer: null,
      scope: null,
      specificity: [0, 0, 1],
      order: 2,
    },
    {
      id: 'id',
      selector: '#id',
      value: 'blue',
      origin: 'author',
      context: 'outer',
      important: false,
      inline: false,
      layer: 'x',
      scope: null,
      specificity: [1, 0, 0],
      order: 1,
    },
  ],
});
// r.value.winnerId → 'p', r.value.decidedAtStep → 4
// r.value.summary → 'Decided at step 4, layers: the unlayered rule beats any layered rule for normal
//                    declarations, so specificity never got a vote.'
// r.value.steps → 7 × { step, name, outcome: 'decided' | 'tie' | 'not-reached', explanation, remaining }
```

Steps, in order: origin and importance (all five origins are modelled), context (shadow DOM: outer wins for normal, inner for `!important`), element-attached styles (inline is its own step), layers (unlayered wins and later layers win for normal; the order reverses for `!important`), specificity, `@scope` proximity (fewer hops wins, unscoped is infinitely far) and order of appearance. Layers used but not listed in `layerOrder` are appended in order of first appearance (`resolveLayerOrder`).

## `suggestFixes({ winner, target, targetIsLater })` (suggest.ts)

Returns, in this order: lower the winner with `:where()`, move rules into ordered `@layer`s, raise the loser by repeating a class (never by adding an ID; says so plainly when only an ID would do), and `!important` with a warning. `classesNeeded(winner, target, targetIsLater)` gives the minimal number of repeated classes.

## `encodeState(state)` / `decodeState(param)` (share.ts)

```ts
const encoded = encodeState({ v: 1, mode: 'anatomy', inputs }); // base64url JSON
decodeState(encoded.value); // { ok: true, value: state }
```

`decodeState` checks length and alphabet before decoding, caps the decoded JSON at 4 KB, decodes UTF-8 strictly, parses JSON in a `try`, rejects other versions, and rebuilds a clean object through a hand-written type guard (`readState`). Nothing is ever evaluated.

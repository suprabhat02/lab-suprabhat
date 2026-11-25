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

## Accessible Name Wars

`src/lib/accname/` computes markup-only accessible names and descriptions using [AccName 1.2, 4 November 2026 Working Draft, section 4.3.2](https://www.w3.org/TR/2026/WD-accname-1.2-20261104/#computation-steps) and [HTML-AAM](https://w3c.github.io/html-aam/#accname-computation). The core does not read a browser DOM. `AccNode` exposes a tag, read-only attributes and children, text, a parent, and same-tree ID lookup.

Trace IDs use letters for the computation substeps: `2C` is Embedded Control (third), `2D` is AriaLabel (fourth), and `2E` is Host Language Label (fifth). This matches the published draft's order; an embedded control's value can therefore precede its `aria-label` during label traversal.

- `adapters/parse5.ts`: `parseHtml(html)` creates the build-time tree.
- `adapters/dom.ts`: `parseDom(html)` uses an inert `DOMParser` document; `fromDocument(document)` adapts one already parsed.
- `computeName(node)` and `computeDescription(node)` return `{ value, source, trace }`. Each trace item contains a specification step ID, source, outcome (`used`, `skipped`, `empty`, `not-reached`), explanation, text, and nested traversal steps. Initialization is step `1`; descendant recursion includes `2H`. Description precedence uses `description-1` through `description-4`, with nested name-computation steps. HTML-AAM fallback sources retain `2E` even when the host-language order places them after `title`.
- `roleOf(node)` resolves valid explicit tokens and implicit HTML roles; naming permissions live in `ROLE_NAMES`.
- `checkName(node)` returns messages, suggested repairs, escaped-source examples, and WCAG references where applicable. Label-in-Name checking ignores case and ordinary punctuation; symbolic labels and visual proximity require manual review.
- `analyze(html, selected, parse)` validates a 4 KB UTF-8 markup limit before parsing and returns a `Result<Analysis>`. Empty input, no eligible elements, and an invalid element index are explicit errors.
- The interactive tool preserves the selected index across markup edits. If valid edited markup no longer contains that index, it selects the first eligible element; other validation errors remain visible. Only "Copy link" encodes the current input and updates the URL. Incoming `?s=` links still restore the shared input and selection.
- `encodeState` / `decodeState` use a separate versioned base64url payload containing `{ v, html, element }`. The markup limit remains 4096 bytes; the JSON envelope permits escaping overhead. Decoding checks size, alphabet, UTF-8, JSON, version, and types and rebuilds the object.

Hidden attributes, `aria-hidden`, and supported inline hiding declarations are recognized. Stylesheet rules, generated content, layout-dependent whitespace, shadow DOM, and script-updated control values are not available. Default submit/reset labels are English examples of implementation-defined browser strings. See [the adapter limits and oracle differences](decisions.md#accessible-name-adapters-and-oracle).

## Stylesheet Audit

`src/lib/audit/` is a headless stylesheet pipeline:

- `parseStylesheet(css)` returns `Result<Stylesheet>`. It checks the 100 KB UTF-8 limit before parsing with the installed css-tree parser. Entries contain source order, selector text, a full specificity triple, source line, conditional chain, layer path, declaration counts and importance. Only the first 5,000 entries are scored; `truncated` identifies a partial report.
- Nesting uses `expandNesting`, and specificity uses `calculate`, not a second scoring implementation. The existing 1,000-character selector and 2,000-character nesting-expansion limits remain explicit errors. The compatibility scanner masks nested selector preludes for css-tree's explicit-`&` parser while preserving every source offset and newline; the originals are passed to the nesting engine. It also rejects unbalanced blocks instead of accepting css-tree's EOF recovery.
- Empty style rules remain entries. Declarations after nested rules and inside nested conditional groups form separate declaration runs in source order. Rule metrics count these runs; comma-separated selector entries share a rule ID so declarations are not counted twice.
- Layer paths are grouped hierarchically in first-declared sibling order, including empty declarations and separately numbered anonymous layers. Escaped identifiers are normalized with css-tree's identifier utilities. Expanded layer-path text has a separate 100 KB bound to prevent quadratic growth from deeply dotted names. Unlayered entries have `layer: null`. Conditions are recorded, not evaluated. Imports, descriptors and unsupported at-rule groups are excluded with a note.
- `metrics(entries)` uses the existing `compare` function for lexicographic maximum and median. For an even count, the lower middle triple is the median. The histogram counts entries by their first non-zero column; “ID weight” excludes IDs neutralized by `:where()`.
- `issues(entries)` reports ID weight, important declarations, five-or-more-compound selectors, duplicates within the same layer/context, and spikes. A spike must exceed **every available** entry in the next ten positions, with at least one following entry. These are review signals, not proof of property-level conflicts. Only 200 findings are retained; counts and `omitted` include the rest.
- `analyze(css)` combines the parser, metrics and findings. The views use `h()` for both static HTML and browser DOM, including SVG; no CSS from input is applied.
- `encodeState` / `decodeState` use `{ v: 1, css }`, their own version, strict UTF-8/base64url decoding and hand validation. Sharing allows 8 KB of CSS, with room for JSON escaping. Only Copy link updates the URL.

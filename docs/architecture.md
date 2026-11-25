# Architecture

A static Astro site. Every page is HTML at build time; the specificity tool adds one plain TypeScript island on top.

## Folder map

```
src/
  lib/
    cascade/            Headless engine: pure TypeScript, no DOM or Astro imports
      specificity.ts    Wraps @bramus/specificity; walks the css-tree AST for per-part data
      compare.ts        Who wins a duel, which column decided it, and the sentence that says so
      nesting.ts        Expands `&` and nested rules into flat selectors
      cascade.ts        css-cascade-6 resolver: seven steps, outcome per step
      suggest.ts        Rule-based fix suggestions
      share.ts          Versioned, size-limited URL state with a hand-written type guard
      math.ts scan.ts types.ts vendor.d.ts index.ts
      __tests__/        Vitest suites
    app/                Glue between the engine and the page
      defaults.ts       The default demo state
      model.ts          Builds view models from inputs (the parser is injected)
      views.ts          View functions shared by build-time rendering and the island
    view/h.ts           Tiny view layer: renderToString (build) and renderToDom (browser)
    seo/entities.ts     schema.org Person and WebSite shared by every page's JSON-LD @graph
    seo/sitemap.ts      Reads page URLs from a built sitemap (used by the IndexNow script)
  components/           .astro components: Duel, Anatomy, NestingPanel, CascadeLadder, ToolPanels,
                        Explainer, ExplainerExample, CascadeExample, SiteHeader, SiteFooter,
                        ThemeToggle, SkipLink
  scripts/
    theme-inline.js     Pre-paint theme script, inlined and allowed by hash
    specificity-app.ts  Island entry: tabs and a lazy loader (about 1.7 KB gzipped)
    specificity-tool.ts The tool controller, loaded on first interaction
  layouts/BaseLayout.astro
  styles/               tokens.css, base.css, layout.css, components.css, utilities.css
  content/tools/        One Markdown file per tool (the `tools` collection)
  content.config.ts
  pages/                index, specificity/, about/, 404, og/[slug].png.ts
public/                 robots.txt, llms.txt, favicon.svg, manifest.webmanifest, <IndexNow key>.txt
scripts/                copy-fonts.mjs, report-sizes.mjs (budgets), lighthouse.mjs, submit-indexnow.mjs
tests/e2e/              Playwright + axe
docs/
```

## Rendering and the island strategy

1. **Build time.** `src/pages/specificity/index.astro` runs the real engine in frontmatter (`buildDuel`, `buildNesting`, `buildCascade`) and renders the results with the same view functions the browser uses (`renderToString`). Crawlers and visitors without JavaScript get a correct, complete answer and every explainer section.
2. **Page load.** Only `specificity-app.ts` runs. It turns the three stacked panels into an accessible tablist and waits. Nothing else is fetched.
3. **First interaction.** Focus, pointer down or input inside the tool imports `specificity-tool.ts`, which imports the selector parser (`@bramus/specificity` and `css-tree`). The controller reads whatever is already in the form, so keystrokes made while it loads aren't lost, and a click on an action button is replayed once it's ready.
4. **Updates.** Input is debounced (about 120 ms for rendering, 400 ms for the URL and the polite live region). Only the parts that change are re-rendered; inputs are never replaced while typing, so focus and caret stay put.
5. **Shared links.** If the URL has `?s=`, the tool loads immediately, validates the payload and either applies it or shows a calm notice and the default demo. The canonical URL is always `/specificity/`.

User input never reaches `innerHTML`: the view layer builds DOM nodes and text nodes, and escapes text when rendering strings at build time.

## Accessible Name Wars

The `/accessible-name/` page follows the same progressive-enhancement split. Its build-time result uses `src/lib/accname/adapters/parse5.ts`; its browser controller uses only `adapters/dom.ts`. Both adapt to the same read-only `AccNode` tree and share role data, computations, checks, models, and `h()` views. The parse5 dependency is build-only in usage and is not imported by the browser entry or controller.

`src/scripts/accessible-name.ts` is the small page entry. Focus, pointer input, or a share parameter loads `accessible-name-tool.ts`. It preserves text typed while loading, replays an early Copy link click, debounces editing, announces a verdict through a polite live region, and provides a focused manual-copy field if clipboard access fails.

The default name, recursive ladder, description, and repairs are static HTML. Only results and selection options are replaced after edits; the textarea retains focus. The selected markup is displayed as escaped code, never inserted into the live document. The engine receives neither the live page nor permission to fetch resources.

## Stylesheet Audit

`/stylesheet-audit/` runs `src/lib/audit/model.ts` at build time and pre-renders a complete default audit through the shared view layer. `stylesheet-audit.ts` lazily loads the controller on interaction or an incoming share link. The controller preserves the textarea, debounces edits, validates the byte cap and sends CSS to a local module worker. `stylesheet-audit-worker.ts` owns parsing and analysis; it does not fetch imports or resources.

Each edit invalidates the previous response and terminates obsolete work. A visible polite “Working…” status precedes analysis; a ten-second worker deadline reports an explicit error instead of leaving stale busy state. Results render through `h()` as a summary, inline SVG, full data table, findings and layer order. Sorting affects only the table, using real specificity triples, while the graph stays in source order. Roving keyboard focus and pointer highlighting link table rows and graph points by stable entry index. There is no animation.

No automatic URL state, input localStorage, analytics, stylesheet injection or third-party transport is used. The parser remains off the initial loading path; no dependency or asset budget was added or raised.

## CSS

`components/ToolWorkbench.astro` supplies named `input` and `output` slots.
Use a `Fragment slot="input"` for the form and short answer, followed by a
`Fragment slot="output"` for the detailed results. Both slots must contain the
build-time example as well as the client update targets. Do not replace form
controls when refreshing results.

Below 64rem the workbench is input-first; above it, CSS provides a 2:3 grid and
a viewport-bounded sticky input with internal scrolling. The `stacked` variant
applies the same output surface to tools with an existing independent input
layout, such as the specificity duel. No layout script is involved.

For more than two output sections, add a `results-nav` with
`aria-label="Results sections"` and plain fragment links to stable headings.
Keep these IDs in both server and client renderers. Explainers use
`section-explainer` for a full-width band with measure-limited prose.

`@layer reset, tokens, base, layout, components, utilities;` is declared first. Base styles use `:where()` for zero specificity, there are no IDs in selectors and no `!important` outside the reduced-motion override. Colours come from `light-dark()` driven by `color-scheme`, which the theme toggle sets through `data-theme`. Below-the-fold sections use `content-visibility: auto`.

## Budgets

`scripts/report-sizes.mjs` runs after every build. It follows each page's entry scripts through their static imports and fails the build if the specificity page ships more than 15 KB of gzipped JS before interaction, if home or about ship any bundled JS, or if CSS exceeds 20 KB gzipped.

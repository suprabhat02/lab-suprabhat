# Decisions

## No React, no shadcn, no Tailwind

- **React and shadcn** would hydrate a framework runtime on a page that needs one small island. The whole interactive part ships about 1.7 KB of gzipped JS before interaction; React alone is several times the 15 KB budget.
- **Tailwind** would hide the cascade behind utility classes. This site teaches specificity and layers, so its CSS is written by hand to show the approach: declared `@layer` order, `:where()` for zero-specificity base styles, no IDs in selectors, no `!important` except inside `prefers-reduced-motion`.

## Specificity library

`@bramus/specificity` 2.4.3 (MIT): passed all 40 reference vectors, scores each selector in a comma list separately, and is maintained. It doesn't expose per-part data, so `specificity.ts` walks the css-tree AST itself for the anatomy view. We import `@bramus/specificity/core` (its ES source) rather than the bundled entry so that it shares one copy of `css-tree/selector-parser` with our walker. `css-tree` is a direct dependency for that reason. The tests check that the parts always add up to the library's value.

The parser loads on first interaction: about 19 KB gzipped, plus 14 KB for the tool controller.

## Version notes (checked 2026-11-11 with `npm view`)

| Package                         | Used                                                                     | Note                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| astro                           | 7.4.10                                                                   |                                                                                                                                                 |
| @bramus/specificity             | 2.4.3                                                                    |                                                                                                                                                 |
| @astrojs/sitemap                | 3.7.4                                                                    |                                                                                                                                                 |
| astro-og-canvas                 | 0.13.3                                                                   | Loads the Geist Mono `woff2` directly; no TTF needed.                                                                                           |
| @fontsource-variable/geist-mono | 5.3.0                                                                    |                                                                                                                                                 |
| vitest                          | 5.1.0                                                                    |                                                                                                                                                 |
| @playwright/test                | 1.65.0                                                                   |                                                                                                                                                 |
| @axe-core/playwright            | 4.14.0                                                                   |                                                                                                                                                 |
| typescript                      | 6.0.3                                                                    | **Not** the latest (7.0.2): `@astrojs/check` 0.9.12 allows `^5 \|\| ^6` and `typescript-eslint` 8.72.2 allows `<6.1.0`. Move to 7 when they do. |
| eslint / typescript-eslint      | 10.14.0 / 8.72.2                                                         | `npm audit` reports a moderate `minimatch` advisory in this dev-only chain; the only fix is downgrading ESLint. Nothing ships to users.         |
| Node                            | 24 in CI                                                                 | Local was 24.x; `engines` allows `>=22.23.4` (Astro's minimum).                                                                                 |
| GitHub Actions                  | checkout v7, setup-node v7, upload-artifact v7, FTP-Deploy-Action v4.4.0 | Latest majors at the time.                                                                                                                      |

## Astro settings

- **`compressHTML: true`** instead of the v7 default `'jsx'`. JSX whitespace rules can join words across lines in prose; the lossless mode can't.
- **Markdown syntax highlighting off.** Shiki emits inline styles, which the CSP blocks. Code samples are plain `<pre><code>`.
- **No `<ClientRouter />`.** Cross-document view transitions come from CSS (`@view-transition { navigation: auto; }`), turned off under reduced motion, so pages stay JS-free.
- **CSP** is Astro's built-in `security.csp` (a hashed `<meta>` tag). The pre-paint theme script's hash is also computed in `astro.config.mjs` from the same file the layout inlines. `frame-ancestors` can't be set from `<meta>`, so `.htaccess` sends it as a header.

## Island split

The first version of the island was 14.6 KB gzipped, right at the budget. It's now an entry (`specificity-app.ts`, about 1.7 KB) that only sets up the tabs, plus the tool controller and the parser, both loaded on first focus, pointer down or input. The controller reads the current form values on start, and a click on an action button made before it loads is replayed. A shared `?s=` link loads everything straight away.

## Design details

- **Numerals** use `clamp(4rem, 30cqi, 11rem)` instead of `14vw`: the selector cards sit side by side and can number up to eight, so sizing against the card (container query units) keeps three huge digits inside it at every width.
- **Fallback fonts** are metric-matched to Geist Mono (600/1000 advance, 1005/-295 ascent/descent read from the font file): Consolas at 109.13% and Menlo/DejaVu Sans Mono at 99.65%. `ui-monospace` can't be referenced from `@font-face`, so it stays in the stack after the adjusted faces.
- **Fonts** are copied from the npm package into `public/fonts/` by `scripts/copy-fonts.mjs` (run before `dev` and `build`) so they're served from `/fonts/` with long-lived caching. Only Latin (preloaded) and Latin Extended are used.
- **`[hidden]`** lives in the `utilities` layer. In `reset` it lost to components that set `display`, which is exactly the kind of layer-order surprise the tool explains.
- **Nested `@media` declarations** expand to an `:is()` of the parent list, matching how browsers treat nested declarations blocks.
- **Final review:** removed the boxed background and border from the nesting callout. It's now a plain, slightly larger paragraph.

## Explainer

- **"On this page"** is one `<nav>` holding a `<details>`. Below 1024px it's a collapsed disclosure; at 1024px and up, `::details-content` keeps the list visible and the summary is hidden, so it works without JavaScript. A 0.6 KB script, imported only when the explainer comes within 600px of the viewport, marks the current section with `aria-current="location"`.
- **The tool panels section is no longer `content-visibility: auto`.** Its placeholder height was wrong, so deep links such as `/specificity/#layers` landed about 540px off. The explainer itself keeps it; links into it land correctly.
- **Live examples** render inside a declarative shadow root, so their `@layer`, `@scope` and selectors can't touch the page's own cascade, and they work without JavaScript. Each `color` declaration also sets a `--won` custom property with the same importance, and the demo text prints it, so the rendered result names its winner in words, not only colour. The demo `<style>` is allowed by a per-page hash (`Astro.csp.insertStyleHash`). The one demo with a real `style` attribute needs `style-src-attr 'unsafe-hashes'` plus that attribute's exact hash; no other inline style is allowed.
- **Code blocks wrap** instead of scrolling sideways, so none becomes an unfocusable scroll region (axe `scrollable-region-focusable`).
- **Prettier skips prose-heavy Astro files** (`.prettierignore`): the Astro formatter split text from inline elements and introduced stray spaces such as `:is() .`. An e2e test now fails if rendered prose has a space before punctuation.

## Hosting

- `.htaccess` uses `FilesMatch` rather than `<If>` for cache rules because LiteSpeed's support for `<If>` is limited. All JS and CSS are fingerprinted under `/_astro/`, so they get `immutable`.
- `Permissions-Policy` turns everything off except `clipboard-write=(self)`, which "Copy link" needs.

## Lighthouse

Medians of five runs against `npm run preview` (`npm run lighthouse 5`):

| Route           | Mobile (perf / a11y / bp / SEO) | Desktop               |
| --------------- | ------------------------------- | --------------------- |
| `/`             | 100 / 100 / 100 / 100           | 100 / 100 / 100 / 100 |
| `/specificity/` | 99 / 100 / 100 / 100            | 100 / 100 / 100 / 100 |
| `/about/`       | 100 / 100 / 100 / 100           | 100 / 100 / 100 / 100 |

The one gap is mobile performance on `/specificity/` (individual runs 96 to 100; LCP about 0.76 s, CLS 0). Under Lighthouse's simulated slow CPU, the web font arrives after first paint and `font-display: swap` triggers one re-layout of the long page, which shows up as about 100 ms of total blocking time. With web fonts blocked the page scores 100. The brief requires `swap`; `font-display: optional` would close the gap at the cost of sometimes showing the fallback font. Below-the-fold sections already use `content-visibility: auto` to keep that re-layout small.

## Testing notes

- Playwright disables JavaScript through DevTools, but Chromium's parser still treats scripting as on, so the no-JS test checks the `<noscript>` markup rather than its visibility. The pre-rendered results are checked directly.
- The axe scans use the WCAG 2.0 to 2.2 A/AA tags plus best practices and fail on any serious or critical violation, on every route in both themes, for each tab panel, and in forced-colors mode.

## Scaffold clean-up

The Astro template's `AGENTS.md` and `favicon.ico` were removed, and the template's initial commit was re-attributed to the repository author before anything was pushed.

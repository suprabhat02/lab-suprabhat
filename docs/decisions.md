# Decisions

## No React, no shadcn, no Tailwind

- **React and shadcn** would hydrate a framework runtime on a page that needs one small island. The whole interactive part ships about 1.7 KB of gzipped JS before interaction; React alone is several times the 15 KB budget.
- **Tailwind** would hide the cascade behind utility classes. This site teaches specificity and layers, so its CSS is written by hand to show the approach: declared `@layer` order, `:where()` for zero-specificity base styles, no IDs in selectors, no `!important` except inside `prefers-reduced-motion`. The typography, type scale and spacing copy tailwindcss.com's values as plain CSS tokens (the neutrals are a warm grey instead of Tailwind's gray; see "Warm page shell" below); the Tailwind package is still not a dependency.

## Specificity library

`@bramus/specificity` 2.4.3 (MIT): passed all 40 reference vectors, scores each selector in a comma list separately, and is maintained. It doesn't expose per-part data, so `specificity.ts` walks the css-tree AST itself for the anatomy view. We import `@bramus/specificity/core` (its ES source) rather than the bundled entry so that it shares one copy of `css-tree/selector-parser` with our walker. `css-tree` is a direct dependency for that reason. The tests check that the parts always add up to the library's value.

The parser loads on first interaction: about 19 KB gzipped, plus 14 KB for the tool controller.

## Version notes (checked 2026-11-11 with `npm view`; font rows 2026-11-27)

| Package                      | Used                                                                                      | Note                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| astro                        | 7.4.10                                                                                    |                                                                                                                                                 |
| @bramus/specificity          | 2.4.3                                                                                     |                                                                                                                                                 |
| @astrojs/sitemap             | 3.7.4                                                                                     |                                                                                                                                                 |
| astro-og-canvas              | 0.13.3                                                                                    | Loads the Latin Figtree `woff2` directly; no TTF needed.                                                                                        |
| @fontsource-variable/figtree | 5.3.0                                                                                     | Upright `wght` 300-900 only; italics are not copied. OG images only.                                                                            |
| inter-ui                     | 4.1.1 (exact)                                                                             | Official rsms Inter 4.1 variable build; subset at build time, keeping every layout feature.                                                     |
| @ibm/plex-mono               | 2.5.0 (exact)                                                                             | IBM's own split files, copied unmodified.                                                                                                       |
| subset-font / fontkitten     | 2.9.0 / 1.0.3 (exact, dev)                                                                | Subsetting and the GSUB/axis assertion. fontkitten was already installed through `@capsizecss/unpack`.                                          |
| vitest                       | 5.1.0                                                                                     |                                                                                                                                                 |
| @playwright/test             | 1.65.0                                                                                    |                                                                                                                                                 |
| @axe-core/playwright         | 4.14.0                                                                                    |                                                                                                                                                 |
| typescript                   | 6.0.3                                                                                     | **Not** the latest (7.0.2): `@astrojs/check` 0.9.12 allows `^5 \|\| ^6` and `typescript-eslint` 8.72.2 allows `<6.1.0`. Move to 7 when they do. |
| eslint / typescript-eslint   | 10.14.0 / 8.72.2                                                                          | `npm audit` reports a moderate `minimatch` advisory in this dev-only chain; the only fix is downgrading ESLint. Nothing ships to users.         |
| Node                         | 24 in CI                                                                                  | Local was 24.x; `engines` allows `>=22.23.4` (Astro's minimum).                                                                                 |
| GitHub Actions               | checkout v7, setup-node v7, upload-artifact v7, upload-pages-artifact v4, deploy-pages v4 | Latest majors at the time.                                                                                                                      |

## Astro settings

- **`compressHTML: true`** instead of the v7 default `'jsx'`. JSX whitespace rules can join words across lines in prose; the lossless mode can't.
- **Markdown syntax highlighting off.** Shiki emits inline styles, which the CSP blocks. Code samples are plain `<pre><code>`.
- **No `<ClientRouter />`.** Cross-document view transitions come from CSS (`@view-transition { navigation: auto; }`), turned off under reduced motion, so pages stay JS-free.
- **CSP** is Astro's built-in `security.csp` (a hashed `<meta>` tag). The pre-paint theme script's hash is also computed in `astro.config.mjs` from the same file the layout inlines. `frame-ancestors` can't be set from `<meta>`, and GitHub Pages can't send headers, so the site can be framed. It has no forms, sign-in or state worth clickjacking, so this is accepted.

## Island split

The first version of the island was 14.6 KB gzipped, right at the budget. It's now an entry (`specificity-app.ts`, about 1.7 KB) that only sets up the tabs, plus the tool controller and the parser, both loaded on first focus, pointer down or input. The controller reads the current form values on start, and a click on an action button made before it loads is replayed. A shared `?s=` link loads everything straight away.

## Design details

- **Numerals** use `clamp(4rem, 30cqi, 11rem)` instead of `14vw`: the selector cards sit side by side and can number up to eight, so sizing against the card (container query units) keeps three huge digits inside it at every width.
- **Fallback fonts** are generated, not hand-tuned. `scripts/font-fallbacks.mjs` (run by `npm run fonts` before `dev` and `build`, after `copy-fonts.mjs`) reads the served Latin files with `@capsizecss/unpack` and writes `src/styles/fonts.generated.css` with Capsize's `createFontStack`: `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override` for Inter (Arial, Segoe UI, Helvetica, with Liberation Sans sharing Arial's) and IBM Plex Mono (Consolas, Menlo, also matching DejaVu Sans Mono, and Courier New, also matching the metric-compatible Liberation Mono and Cousine). Courier New's metrics come from `@capsizecss/metrics`; Consolas and Menlo aren't in that collection, so their metrics are written into the script from the font files. `ui-monospace` can't be referenced from `@font-face`, so it stays in the stack after the adjusted faces. An e2e test checks fallback widths stay within 2% of each web font, and that delaying the web fonts by 1.5 s causes no layout shift.
- **Fonts:** `scripts/copy-fonts.mjs` writes everything in `public/fonts/`: the two Inter subsets, IBM's Plex Mono files and both OFL licences. Only `inter-latin.woff2` is preloaded.
- **`[hidden]`** lives in the `utilities` layer. In `reset` it lost to components that set `display`, which is exactly the kind of layer-order surprise the tool explains.
- **Nested `@media` declarations** expand to an `:is()` of the parent list, matching how browsers treat nested declarations blocks.
- **Final review:** removed the boxed background and border from the nesting callout. It's now a plain, slightly larger paragraph.

## Design-system font roles (historical, superseded by Figtree below)

Geist Sans and Geist Mono are self-hosted from Fontsource 5.3.0 (OFL-1.1).
Both served Latin files have unitsPerEm 1000, x-height 530, cap-height 710,
ascent 1005, descent -295 and line-gap 0. The Sans file adds 29,400 bytes;
Mono remains 23,128 bytes. Latin-ext stays demand-loaded.

| Role                                                                    | Family     |
| ----------------------------------------------------------------------- | ---------- |
| Prose, UI, labels, navigation, headings, findings, footer               | Geist Sans |
| Code, CSS/HTML inputs, selectors, scores, numeric table data, lab/ logo | Geist Mono |

The existing copy/Capsize pipeline handles both families. Sans fallbacks use
the installed Arial, Segoe UI and Helvetica metrics; Liberation Sans shares
Arial's overrides. Mono fallbacks are unchanged. Both Latin files are preloaded:
Sans paints the LCP text, and the Mono logo is above the fold on every route.
Preload URLs match the font-face URLs and use anonymous CORS.

Use weights 400/500/600 for body/UI/headings and 700 only for display h1.
Tabular figures are scoped to numeric data; Mono disables ligatures.
The old font tokens remain aliases until the release after the design-system
release, but new styles use `--font-sans` and `--font-mono`.

## Figtree as the sans (historical)

The owner chose Figtree (Fontsource 5.3.0, OFL-1.1) to replace Geist Sans; Geist
Mono stays for code, selectors, numbers and the logo. It is a brand choice, not
a legibility claim, and it saves about 9 KB: Latin Figtree is 20,156 bytes, so a
fresh page loads 43,284 bytes of fonts instead of 52,528. The OG images use the
same Latin file; they render the Bold and Regular instances correctly, so the
Geist Sans package was removed.

Verified in the installed files: one `wght` axis, 300-900, default instance
Light (300); GSUB keeps `tnum`, `pnum`, `frac`, `numr`, `dnom` but not `ss01`,
`ss02` or `case`; Latin and Latin-ext only. Because I and l look alike without
`ss02`, identifiers and data values render in Geist Mono through `code` and
`rich()`. Fallback overrides come from Capsize's Regular entry, since measuring
the variable file would describe Light and put Arial's `size-adjust` about 1.1%
off.

Figtree is lighter at the same number, so sans roles use 400 body, 500 UI, 650
headings and emphasis, and 750 display; Geist Mono keeps 600 for emphasis.
`--step-0` is unchanged: at 16-18px Figtree body text renders clearly on
Windows Chromium, and raising it would break the type ratios without
measurable benefit. The 12px and 14px sub-body steps are now whole pixels.
The prose measure moved from 66ch to 46ch after measuring characters per line.
Italics are synthesised rather than downloaded.

## Design-system color gate (historical, superseded by Tailwind gray below)

The warm OKLCH ramp uses hue 35 and chroma at most .010. Components consume
semantic tokens, not numbered grays. In light mode the page is a step-2 band
with step-1 paper panels; dark elevation runs from step 1 to 2 to 3.
This implements the light/dark elevation asymmetry without shadows.
Step 6 is decorative only. Required controls on filled surfaces use step 9,
not step 8, whose light inset contrast is below 3:1.

`npm run contrast` reads the actual token declarations, resolves both themes
and increased-contrast overrides, and checks 264 WCAG pairs offline. It runs
in CI and prebuild. Invalid colors, unresolved tokens, cycles, out-of-gamut
values and failed ratios are errors, not fallback values. The warning chroma
is .08 in light mode so it remains in sRGB.

Minimum normal-theme text contrast is 4.77:1 light / 5.01:1 dark across the
documented text roles and their allowed surfaces. Required borders are at
least 3.14:1 light / 3.37:1 dark. Focus reaches 4.89:1 / 4.49:1 even on active
fills. APCA Lc uses the verified 0.0.98G-4g equations as informational output,
never as a WCAG conformance rule.

Accent is reserved for links, focus, current navigation and primary actions.
Scores, syntax underlines and graph marks are neutral; their weights,
underline styles, labels and selected point shapes still convey meaning.
The fixed LiveExample canvas is demonstration content and intentionally
keeps its original white/dark colors.

## Design-system rhythm (historical, superseded by Tailwind gray below)

Type interpolates from 16px at 320px to 18px at 1280px, with ratios 1.2 and
1.25. Section space now uses rem/vi pairs rather than viewport height.
Only display h1 and headings have tightened tracking. Prose originally kept a 66ch
measure (now 46ch, see Figtree); workbench panes do not inherit that constraint.

Zero-specificity flow, stack, cluster and region primitives live in the
utilities layer so a parent can opt into a layout without specificity
escalation. Flow owns prose margins; components use grid/flex gaps. Hidden
siblings do not add flow gaps, and the hidden utility follows all primitives.
Both workbench panes are inline-size containers; metrics and pane grids use
container queries, while page columns still use viewport queries.

## Official Inter and IBM Plex Mono builds (Tailwind typography)

Fontsource builds were dropped because they strip the OpenType features this
design needs. Measured with fontkitten on 2026-11-27:

| File                                           |   Bytes | Axes      | GSUB features | `cv02`-`cv04`, `cv11` | `ss02`, `zero` |
| ---------------------------------------------- | ------: | --------- | ------------: | --------------------- | -------------- |
| Fontsource Inter 5.3.0 `inter-latin-opsz`      |  72,920 | opsz/wght |             8 | none                  | none           |
| Fontsource Geist Mono 5.3.0 Latin              |  23,128 | wght      |             5 | none                  | none           |
| inter-ui 4.1.1 `InterVariable.woff2` (full)    | 352,240 | opsz/wght |            39 | all                   | both           |
| Served `inter-latin.woff2` (our subset)        |  99,004 | opsz/wght |            37 | all                   | both           |
| Served `inter-latin-ext.woff2` (our subset)    |  66,436 | opsz/wght |            14 | `cv11` only           | `ss02` only    |
| IBM `IBMPlexMono-Regular-Latin1.woff2` (as-is) |  17,544 | none      |            20 | n/a                   | both           |

So the previous `font-feature-settings: 'cv11', 'ss01'` did nothing. The site
now copies tailwindcss.com's settings: Inter with `"cv02", "cv03", "cv04",
"cv11"`, `font-variation-settings: normal` and `font-optical-sizing: auto`, and
IBM Plex Mono with `"ss02", "zero"` on every mono element.

`copy-fonts.mjs` subsets Inter with `subset-font`, which keeps every layout
feature, then fails the build unless `opsz`, `wght` and each feature survived.
A subset only keeps a feature if it still holds a glyph the feature acts on.
Shaping with HarfBuzz shows `cv02`, `cv03` and `cv04` change only 4, 6 and 9,
and `zero` changes only 0. So the Latin-ext files can't contain them, and the
script requires them only in the Latin files. The script also checks that the
`unicode-range` in `tokens.css` matches each subset.

IBM Plex Mono is **not** subset. "Plex" is a Reserved Font Name under its OFL
licence, and subsetting counts as modification, which would require renaming.
IBM's own pre-split Latin1/Latin2 files and unicode-ranges are copied
unmodified, with no `local()` source, since an installed copy may lack `ss02`
and `zero`. Both OFL licence files are copied next to the fonts. Only
`inter-latin.woff2` is preloaded. Plex loads on demand (the `lab/` logo uses
SemiBold), and metric-matched fallbacks keep the swap free of layout shift.
Capsize's Arial fallback for Inter is 90.44% / 22.52% / 0% / 107.12%, close to
tailwindcss.com's 89.79% / 22.36% / 0% / 107.89%.

## Tailwind type scale, gray palette and spacing

Values were read from tailwindcss.com's production CSS on 2026-11-27. The fluid
Utopia scale was replaced by Tailwind's fixed `--text-*` scale, which steps up at
breakpoints. The warm hue-35 ramp was replaced by Tailwind gray (`--gray-50`
to `--gray-950`), keeping the semantic token names. Spacing uses fixed
multiples of `--spacing: 0.25rem`. The old `--step-*`, `--weight-heading` and
`--weight-display` names are aliases for one release.

Two pairs in the specified palette failed the contrast gate:

- Light `--text-faint` (gray-500) on `--surface-inset` (gray-100) is 4.39:1, so
  text inputs use `--bg` and faint text is gated on `--bg`, `--surface` and
  `--surface-overlay` only.
- Dark `--accent` on gray-800 is 4.43:1. Accent is no longer link or nav text
  (it marks running-text underlines and the focus ring), so accent text is gated
  on `--bg`, `--surface` and `--accent-subtle`. The focus ring keeps its 3:1 check
  on every surface and fill (at least 4.43:1).

Dark gray-700 fails both muted text (3.96:1) and the 3:1 control border
(2.13:1), so the dark fills are gray-900 / gray-800 / gray-800. Because dark
hover and active share a colour, pressed buttons add an inset ring, selected
tabs keep their 3px border and weight 600, and current nav and TOC links use
weight 600 (the TOC also uses its rail border).

## Workbench surfaces and type (historical baseline)

The elevation scale separates page (`--surface-0`), explainer/footer bands
(`--surface-1`), workbench panels and tool items (`--surface-2`), and code,
input and table-header insets (`--surface-3`). Existing `--bg`, `--bg-2`,
`--surface` and `--bg-3` respectively alias these roles. One-pixel `--line`
borders distinguish zones without shadows.

Geist Mono remains the heading, code, selector, numeric data, brand and
navigation face. Paragraphs, explanation lists, findings and footer prose use
the local system sans stack (`--font-prose`), with no font request or generated
fallback metrics. Default mono line-height is 1.5; prose is 1.6. The existing
mono fallback setup is unchanged; normal builds still run their prebuild hook.

WCAG relative-luminance contrast, light / dark, measured against every surface:

| Foreground         | Surface 0     | Surface 1     | Surface 2     | Surface 3     |
| ------------------ | ------------- | ------------- | ------------- | ------------- |
| `--text`           | 17.28 / 17.98 | 14.93 / 16.36 | 18.05 / 14.37 | 16.36 / 17.64 |
| `--text-2`         | 9.58 / 11.27  | 8.28 / 10.25  | 10.02 / 9.00  | 9.07 / 11.05  |
| `--text-3`         | 6.28 / 7.62   | 5.43 / 6.93   | 6.57 / 6.08   | 5.95 / 7.47   |
| `--accent` / focus | 6.32 / 5.94   | 5.46 / 5.40   | 6.60 / 4.74   | 5.98 / 5.82   |
| `--accent-strong`  | 8.03 / 11.68  | 6.94 / 10.62  | 8.40 / 9.33   | 7.61 / 11.45  |
| `--success`        | 6.21 / 10.48  | 5.37 / 9.53   | 6.49 / 8.37   | 5.88 / 10.28  |
| `--danger`         | 6.40 / 6.76   | 5.53 / 6.15   | 6.69 / 5.40   | 6.06 / 6.63   |
| `--line`           | 4.10 / 6.29   | 3.54 / 5.72   | 4.28 / 5.02   | 3.88 / 6.17   |
| `--control-border` | 3.72 / 4.08   | 3.22 / 3.71   | 3.89 / 3.26   | 3.52 / 4.00   |

All text pairs exceed 4.5:1, including small accent text; every border and focus
pair exceeds 3:1. Surface differences are quiet grouping cues, not the sole
indication of an interactive boundary.

The workbench uses CSS sticky inputs from 64rem and a native navigation
disclosure below 80rem, where the full five-link header no longer fits reliably.
The header remains one row, so its sticky offset stays equal to `--header-height`.
The menu opens and closes with Enter or Space on its summary; it is not a
scripted popup.

The specificity duel already compares side-by-side inputs. It keeps that layout
and uses the shared workbench's stacked output variant for suggestions and tabs,
without another sticky pane. Its pre-existing automatic URL synchronization is
unchanged, as agreed. Audit and Accessible Name remain Copy-link-only.
Presentation-only view functions were approved for refactoring; computation,
models, parsers and share codecs are unchanged.

Zero-count audit groups remain in the DOM with `hidden`; a single visible
sentence lists their names. Non-zero groups become visible again after edits.
Anatomy tables retain readable columns in their existing keyboard-focusable
scroll containers rather than breaking headings into individual letters.
Home summaries remain complete and wrap when needed instead of being clipped.

### Workbench validation on 2026-11-25

Lint, Astro/TypeScript checks (zero errors, warnings or hints), all 382 unit
tests, and the production build passed. Total CSS is 6.87 KB gzip; the largest
initial page JavaScript is 3.12 KB. Dependency manifests, generated font metrics,
engine computations and asset budgets are unchanged.

The complete Chromium, Firefox and WebKit run passed 316 tests. Its 170 skips
include 168 opt-in screenshot cases and two existing browser-specific skips.
The full 56-image matrix was run separately in Chromium: seven routes including
404, four viewports (1440x900, 1024x768, 768x1024, 320x640), and both themes.
All captures passed the document-overflow assertion and were visually reviewed,
with additional menu-focus and sticky-findings captures. Screenshots are local,
gitignored output under `.shots/review/`; run `SCREENSHOTS=1 npx playwright test
screenshots.spec.ts --project=chromium` to reproduce them.

New browser coverage checks input/result bounds at 1440, sticky source visibility
while reviewing findings, input-before-output order at 320, all header links and
current-page indicators, keyboard-only native disclosure, full-item home links,
per-selector scores and empty-finding groups. Footer links fit within the first
270 pixels of the footer at 1440x900.

Lighthouse 13.6.0, three-run medians (Performance / Accessibility / Best Practices / SEO):

| Route                | Mobile                | Desktop               | CLS, both |
| -------------------- | --------------------- | --------------------- | --------- |
| `/`                  | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | 0         |
| `/stylesheet-audit/` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | 0         |
| `/accessible-name/`  | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | 0         |

One initial accessible-name mobile performance sample was 97; the other two
were 100. A separate three-run mobile confirmation returned 100, 100, 100,
with CLS 0. Single mobile and desktop checks on `/specificity/`, `/playground/`
and `/about/` also returned all four 100s with CLS 0. These are local
measurements, not a guarantee about every device or run. The intentionally
non-indexable 404 page is covered by browser/accessibility and screenshot tests,
not the public-content Lighthouse SEO gate.

## Explainer

- **"On this page"** is one `<nav>` holding a `<details>`. Below 1024px it's a collapsed disclosure; at 1024px and up, `::details-content` keeps the list visible and the summary is hidden, so it works without JavaScript. A 0.6 KB script, imported only when the explainer comes within 600px of the viewport, marks the current section with `aria-current="location"`.
- **The tool panels section is no longer `content-visibility: auto`.** Its placeholder height was wrong, so deep links such as `/specificity/#layers` landed about 540px off. The explainer itself keeps it; links into it land correctly.
- **Live examples** render inside a declarative shadow root, so their `@layer`, `@scope` and selectors can't touch the page's own cascade, and they work without JavaScript. Each `color` declaration also sets a `--won` custom property with the same importance, and the demo text prints it, so the rendered result names its winner in words, not only colour. The demo `<style>` is allowed by a per-page hash (`Astro.csp.insertStyleHash`). The one demo with a real `style` attribute needs `style-src-attr 'unsafe-hashes'` plus that attribute's exact hash; no other inline style is allowed.
- **Code blocks wrap** instead of scrolling sideways, so none becomes an unfocusable scroll region (axe `scrollable-region-focusable`).
- **Prettier skips prose-heavy Astro files** (`.prettierignore`): the Astro formatter split text from inline elements and introduced stray spaces such as `:is() .`. An e2e test now fails if rendered prose has a space before punctuation.

## Hosting

- **GitHub Pages, not Hostinger FTP.** `lab.suprabhat-dev.com` already resolved to `suprabhat02.github.io`, like the main site, and the domain is verified for GitHub Pages on the account. Pages through Actions needs no stored secrets (OIDC), no DNS changes, and gives free HTTPS and a CDN.
- **What that gives up:** custom response headers. There is no `Strict-Transport-Security`, `Permissions-Policy`, `X-Content-Type-Options` or `frame-ancestors` from us, and caching is GitHub's fixed `max-age=600`, so fingerprinted `/_astro/` files aren't `immutable`. CSP and referrer policy still apply through `<meta>` tags. If headers become necessary, put a CDN that can set them in front, or move to a host that supports them.
- **No `CNAME` file in `public/`.** With an Actions-based Pages deploy the custom domain comes from the repository settings, and a `CNAME` file in the artifact is ignored.
- **IndexNow after each deploy.** The `indexnow` job in `deploy.yml` unpacks the deployed Pages artifact and posts every sitemap URL to `api.indexnow.org`. The key lives at `public/<key>.txt` (the standard location, so no `keyLocation`). It runs only for real pushes, not Dependabot, and a failed ping never fails the deploy.
- **Clean URLs and 404** work without rewrites: `build.format: 'directory'` emits `/<route>/index.html`, and Pages serves `dist/404.html` for missing paths.

## Lighthouse

Medians of five runs against `npm run preview` (`npm run lighthouse 5`):

| Route           | Mobile (perf / a11y / bp / SEO) | Desktop               |
| --------------- | ------------------------------- | --------------------- |
| `/`             | 100 / 100 / 100 / 100           | 100 / 100 / 100 / 100 |
| `/specificity/` | 99 / 100 / 100 / 100            | 100 / 100 / 100 / 100 |
| `/about/`       | 100 / 100 / 100 / 100           | 100 / 100 / 100 / 100 |

The one gap is mobile performance on `/specificity/` (individual runs 96 to 100; LCP about 0.76 s, CLS 0). Under Lighthouse's simulated slow CPU, the web font arrives after first paint and `font-display: swap` triggers one re-layout of the long page, which shows up as about 100 ms of total blocking time. With web fonts blocked the page scores 100. The brief requires `swap`; `font-display: optional` would close the gap at the cost of sometimes showing the fallback font. Below-the-fold sections already use `content-visibility: auto` to keep that re-layout small.

**Update.** A trace showed the bigger cost wasn't the font swap but the island: setting up the tabs hid two panels and a heading right after load, forcing a full re-layout inside a long task. The head script already sets `data-js` before first paint, so CSS now draws the tabbed layout from the start and the island only adds behaviour (no layout change). With that and the generated fallbacks, mobile `/specificity/` scored a median of 100 over five runs (runs 99 to 100, TBT about 90 ms, CLS 0).

**Re-measured.** Later runs score a median of 99 (TBT about 100 to 145 ms, CLS 0). The item 4 commit now measures the same, so the browser changed, not the site. Two tasks remain after first paint. One is the `swap` re-layout described above: with the web font blocked, the page scores 100 with 0 ms TBT. The other is current Chrome rendering the whole page about a second after load, which also lays out the skipped explainer. Laying the explainer out in idle-time slices made that late render cheap (48 ms down to 9 ms), but an interleaved A/B over eight pairs of runs showed it raised Lighthouse's TBT (median 153 ms against 100 ms), because the slices count as extra simulated tasks. So it wasn't kept. Reaching 100 again would need `font-display: optional`.

## Testing notes

- Playwright disables JavaScript through DevTools, but Chromium's parser still treats scripting as on, so the no-JS test checks the `<noscript>` markup rather than its visibility. The pre-rendered results are checked directly.
- The axe scans use the WCAG 2.0 to 2.2 A/AA tags plus best practices and fail on any serious or critical violation, on every route in both themes, for each tab panel, and in forced-colors mode.
- **Every e2e test runs in Chromium, Firefox and WebKit.** Differences handled in the tests, not the site:
  - Only Chromium lets a test grant clipboard permissions. Elsewhere the copy test accepts whichever path the browser takes, and two extra tests force the manual-copy fallback (no Clipboard API, and a refused write) in all three browsers.
  - Safari's default Tab order skips links (Option+Tab reaches them), so in WebKit the keyboard test focuses the skip link directly; buttons and fields are still reached with Tab.
  - Firefox and WebKit serialise `content: " " var(--won)` differently from Chromium, so the live-example test compares the words, not the string.
  - In Firefox, a Playwright role-and-name query on a tab panel followed immediately by an axe scan crashes the content process. The panel scan locates the panel by id instead. It doesn't happen in normal browsing.
  - Firefox ignores `@view-transition`; navigation works the same without the animation.

## Stylesheet Audit

- **Privacy:** pasted CSS may be proprietary. Parsing and analysis are local, with no input persistence, analytics or resource fetching. Only an explicit Copy link action encodes CSS in the URL; incoming links restore it. Base64url is not encryption, and opening a shared URL may expose its contents to browser history or server logs.
- **Display scale:** graph height is `min(A, 9) * 100 + min(B, 9) * 10 + min(C, 9)`. Capping makes a compact visualization, not a substitute for column-by-column ordering. The caption states this; sorting, maxima, medians and spike findings use full triples. Squares mark important entries, circles normal entries, and dashed lines mark layer changes. A labelled SVG and the full data table provide alternatives to color and position.
- **Parser compatibility:** css-tree 3.2.1's installed source and the repository's minimal type declarations were inspected. Its block parser recognizes nested selectors starting with `&`, but recovers implicit nesting as raw declarations. An offset-preserving prelude mask lets it parse the structure; original selectors still go through `expandNesting` and `calculate`. No replacement specificity engine or new runtime dependency is needed.
- **Bounds and responsiveness:** validate 100 KB before parsing, score at most 5,000 entries, retain at most 200 findings, and allow at most 8 KB of CSS in share links. A debounced worker keeps parsing off the main thread and shows a polite working state; superseded work is terminated and ten-second jobs fail explicitly. Existing selector/nesting limits are not raised.
- **Interpretation:** the agreed spike definition compares against every available following entry in a ten-entry window, not any one entry. Duplicates are scoped to the exact selector, layer and conditional chain. No claim is made that the selectors actually match the same element or declare the same property. Layer order statements distinguish normal from important declarations and acknowledge reversed important precedence.

### Audit validation on 2026-11-25

Lint, type checks, all 382 unit tests (69 audit cases), and the production build passed. The complete Chromium, Firefox and WebKit suite passed 295 tests, with 50 existing skips. This includes real 5,000-entry graph/table checks, keyboard sorting and cross-highlighting, both-theme axe scans, share restoration, no automatic URL state, and no requests for pasted imports or resource URLs.

Initial audit JavaScript is 2.44 KB gzip and total site CSS is 6.24 KB, within the unchanged budgets. The parser runs in a lazy 28.30 KB worker; the audit controller is 4.43 KB. There are no dependency changes.

Lighthouse 13.6.0 measured 100 in Performance, Accessibility, Best Practices and SEO in three mobile and three desktop audit runs. A further mobile/desktop pair confirmed all four 100s on the final build (LCP 916/258 ms, CLS 0, TBT 0). One mobile and one desktop run on each existing public route (`/`, `/specificity/`, `/playground/`, `/accessible-name/`, `/about/`) also scored all four 100s. These are local measurements, not a promise that every future environment will reproduce them.

A screenshot with a trial navigation link at 320 px showed that it wrapped onto another row. The trial was browser-only and removed; the header remains unchanged. The tool is discoverable through the generated home-page listing.

## Accessible name adapters and oracle

Sharing pasted HTML is opt-in: rendering and editing never encode it into the URL. Only pressing "Copy link" updates the URL and offers the share link; incoming `?s=` links still restore their saved state. Pasted markup may contain sensitive content, and URL-encoded data can persist in browser history or reach server logs when a link is opened. Base64url is not encryption.

The headless naming engine uses read-only snapshots rather than DOM globals. The browser adapter wraps an inert document created with `DOMParser`; the build adapter uses parse5 8.1.1, checked with `npm view`. This avoids shipping a second HTML parser to visitors. No pasted nodes are adopted into the live page. Unit tests use a script-capable jsdom environment with intercepted resources; browser tests separately assert no markup-triggered requests or dialogs.

The oracle dependencies are development-only: dom-accessibility-api 0.7.1 and jsdom 29.1.1, with declaration files inspected before use. jsdom 31.0.1 was checked but requires a newer Node 24 minor than the local environment; 29.1.1 supports the existing runtime. No runtime dependency other than parse5 was added.

The calculation follows the [published AccName 1.2 Working Draft of 4 November 2026](https://www.w3.org/TR/2026/WD-accname-1.2-20261104/#computation-steps) and the referenced HTML-AAM editor's draft as read on 2026-11-25, not a promise that every browser already implements every draft change. Section 4.3.2 lists Embedded Control third, AriaLabel fourth, and Host Language Label fifth. The trace's letter-based IDs therefore remain `2C`, `2D`, and `2E`, respectively; neither renumbering nor an execution-order change is warranted. Regression tests pin these IDs, native/ARIA precedence, and an embedded value competing with an aria-label.

The engine cannot evaluate stylesheet rules, generated content, layout, shadow trees, or script-mutated values. A class or style element triggers an additional notice. Inline hiding is recognized from markup; competing CSS declarations and visibility overrides still need verification on the rendered page.

The oracle is a cross-check, not authority. Both adapters must match every fixture, and expected engine results remain hand-specified. The following differences are pinned explicitly in the oracle tests, not skipped:

| Fixture or rule                             | Engine expectation           | Oracle result      | Specification                                                                                               |
| ------------------------------------------- | ---------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Title already used as name (three fixtures) | No repeated description      | Repeats title      | [Description precedence](https://w3c.github.io/accname/#mapping_additional_nd_description)                  |
| Text input with only a placeholder          | Uses placeholder             | Empty name         | [HTML-AAM text controls](https://w3c.github.io/html-aam/#accname-computation)                               |
| ARIA-named table with caption               | Caption is description       | Empty description  | [Native descriptions](https://w3c.github.io/html-aam/#accdesc-computation)                                  |
| Hidden referenced label with hidden child   | Includes both text portions  | Omits hidden child | [Hidden reference traversal](https://w3c.github.io/accname/#comp_hidden_not_referenced)                     |
| Focusable button with presentation role     | Keeps button name            | Empty name         | [Presentation conflicts](https://www.w3.org/TR/wai-aria-1.2/#presentational-roles-conflict-resolution)      |
| Generic div with aria-label                 | Naming prohibited            | Uses aria-label    | [Generic role](https://www.w3.org/TR/wai-aria-1.2/#generic)                                                 |
| Whitespace at an inline text boundary       | `Save this file`             | `Savethis file`    | [Text nodes](https://w3c.github.io/accname/#comp_text_node); also verified in Chromium, Firefox, and WebKit |
| Empty aria-labelledby target                | Falls through to aria-label  | Empty name         | [LabelledBy step](https://w3c.github.io/accname/#comp_labelledby)                                           |
| Empty applicable description (two fixtures) | Stops with empty description | Uses title         | [Description precedence](https://w3c.github.io/accname/#mapping_additional_nd_description)                  |

### Validation on 2026-11-25

Lint, type checks, all 311 unit tests, and the production build passed. The complete Chromium, Firefox, and WebKit suite passed 247 tests, with 50 existing skips. Initial JavaScript for `/accessible-name/` is 2.24 KB gzip; total CSS is 5.58 KB. Existing budgets are unchanged. Traversing all 22 client modules, including lazy imports, found no parse5 or oracle dependencies.

Lighthouse 13.6.0 against the local preview measured:

| Route               | Mobile performance samples | Mobile median | Desktop performance samples |
| ------------------- | -------------------------- | ------------- | --------------------------- |
| `/accessible-name/` | 96, 100, 100               | 100           | 100, 100, 100               |
| `/specificity/`     | 98, 99, 99                 | 99            | 100                         |
| `/about/`           | 89, 100, 98                | 98            | 100                         |

Accessibility, Best Practices, and SEO scored 100 in every measured run. Home and `/playground/` scored 100 in all four categories in one mobile and one desktop run each. The new page therefore has three-run medians of 100 in all four categories on both presets, but these measurements do **not** establish site-wide 100 performance. The existing-route results were accepted for this feature's scope; no existing-page performance behavior, budgets, or assertions were relaxed.

## Scaffold clean-up

The Astro template's `AGENTS.md` and `favicon.ico` were removed, and the template's initial commit was re-attributed to the repository author before anything was pushed.

## Warm page shell (2026-11-27)

Step 1 of the warm redesign: hatched rails, full-bleed hairlines, a hero with a real duel, warm greys and a defined accent. Values come from reading tailwindcss.com's live CSS on 2026-11-27; every colour pair is in the contrast gate.

- **Warm hue-55 greys replace Tailwind gray.** Tailwind's gray ramp is tinted blue (hue about 260), and on a mostly white and near-black site that tint is what made the pages feel cold. A warm grey at hue 55 sits next to the vermilion accent instead of fighting it. The semantic token names didn't change, so no component did either, and the `--gray-*` primitives are gone. Light faint text is `#706862`, not the more obvious `#78706a`, because `#78706a` measures 4.34:1 on the inset surface; with the darker value `--text-faint` passes on every surface, so the contrast gate checks it on `surface-inset` again.
- **No animation library.** The only motion is the nav links' 150ms colour and background transition, under `prefers-reduced-motion: no-preference`. CSS does that with no runtime, no extra JS and nothing that can shift layout. Scroll and page-transition motion is a later step, and CSS (`@view-transition`, scroll-driven animations) comes before any dependency.
- **`overflow-x: clip`, not `hidden`, on `.page-shell`.** The hairlines are `200vw` wide and must not widen the page at 320px. `overflow: hidden` would contain them too, but it makes the wrapper a scroll container, and a sticky element sticks to its nearest scroll container, so `.site-header` would stop sticking to the viewport. `clip` clips without creating a scroll container. Note that `content-visibility: auto` also clips paint, so a `.section-deferred` can't carry full-bleed hairlines.
- **The hero duel is computed, not typed.** `HeroDuel.astro` runs `buildDuel` with the real `calculate` at build time and renders it with the tool's own `scoreView` and `verdictView`. `Duel.astro` itself wasn't reused: it's the editable form, with inputs, ids and buttons that belong on the tool page. An e2e test reads the selectors from the page, runs `buildDuel` again and compares every numeral.
- **The hero h1 is three fixed lines, with caps in em.** The metric-matched Inter fallback is up to 11% wider at display sizes, so with free wrapping the swap changed the line count at many widths (2 to 3 lines at 320px, 3 to 4 at 1280px) and shifted the page by 0.02 to 0.04. With fixed lines, and sizes stepped (`5xl` → `6xl` at 80rem → `7xl` at 90rem) so the widest line still fits the 5/12 column in the fallback, CLS is 0 from 320 to 1720px. The "about 18ch / 50ch" caps are written as 11em / 32em: `ch` is measured from the current font's "0", so a `ch` cap also changes width during the swap.

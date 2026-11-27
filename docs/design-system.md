# Design system

Use semantic tokens from [tokens.css](../src/styles/tokens.css), not new local
colours, type sizes or vertical margins. The system is neutral, dark-first, and
progressively enhanced. No decorative motion, shadows or gradients are required.

## Fonts

Typography matches tailwindcss.com: Inter 4.1 for text and IBM Plex Mono for code.

| Role                                                                           | Family / token                | Weight                                           |
| ------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------ |
| Body, explanations, prose                                                      | Inter / `--font-sans`         | `--weight-regular` 400                           |
| Labels, buttons, navigation, summaries, page h1, home h2                       | Inter / `--font-sans`         | `--weight-medium` 500                            |
| Section and card headings, running-text links, `strong`, current/selected      | Inter / `--font-sans`         | `--weight-semibold` 600                          |
| Home hero h1                                                                   | Inter / `--font-sans`         | 500, then 400 from `lg`                          |
| Code, CSS/HTML inputs, selectors, specificity triples, numeric data, lab/ logo | IBM Plex Mono / `--font-mono` | 400; 500 for inline prose code; 600 to emphasise |
| Eyebrow labels (`.toc-title`, `.tool-category`)                                | IBM Plex Mono / `--font-mono` | 500, `--text-xs`, uppercase, `--tracking-widest` |

`--weight-bold` (700) exists, but no role uses it. Tabular numerals belong on
numeric data, not all prose. Mono ligatures are disabled. Font smoothing uses
antialiasing on macOS.

**OpenType features, copied from tailwindcss.com.** `html` sets
`font-feature-settings: "cv02", "cv03", "cv04", "cv11"` (open 4, 6 and 9, and a
single-storey a), `font-variation-settings: normal` and `font-optical-sizing:
auto`. Optical size follows the rendered size; never pin `opsz`. Every mono
element sets `"ss02", "zero"` (`--font-features-mono`): Plex's alternate
lowercase and a slashed zero. Mono selectors outside `code` need that too, or
they inherit Inter's `cv` settings.

**Identifiers are always mono.** Any string where I, l, 1, 0 and O
must be told apart (selectors, IDs, class names, at-rules, ARIA attributes,
specificity triples and data values) goes in `code` or another mono element.
`rich()` in [h.ts](../src/lib/view/h.ts) wraps backticked text and recognisable
identifiers and triples in `code`, so engine messages need no markup. Native
`<option>` text can't contain markup, so selects that list selectors use mono.

Upright only. The browser synthesises an oblique for `em` and `i`; the site has
no long italic passages, so a separate download isn't justified.

**Files.** `npm run fonts` (run before `dev` and `build`) writes
`public/fonts/` and regenerates
[fonts.generated.css](../src/styles/fonts.generated.css). Never hand-edit
generated adjustments, and never use a font CDN.

- Inter comes from `inter-ui` 4.1.1, the official rsms build. It's subset into
  `inter-latin.woff2` (about 97 KB) and `inter-latin-ext.woff2`. The script fails
  if either loses `opsz`, `wght` or a feature that applies to its glyphs, or if
  the `unicode-range` in `tokens.css` drifts from the subset.
- IBM Plex Mono comes from `@ibm/plex-mono` 2.5.0: Regular/Medium/SemiBold ×
  Latin1/Latin2, copied **unmodified** with IBM's own unicode-ranges. "Plex" is
  a Reserved Font Name, so never subset or rename these files. There is no
  `local()` source, because an installed copy may lack `ss02`/`zero`.
- `LICENSE-Inter.txt` and `LICENSE-IBM-Plex.txt` travel with the fonts (OFL-1.1).

Every page preloads only `/fonts/inter-latin.woff2`, with anonymous
`crossorigin` and the exact font-face URL so preload and CSS share one request.
Plex is not preloaded. The same-origin preview disables Vite's CORS
middleware: its `Vary: Origin` header otherwise makes WebKit refetch an
anonymous preload as a CSS font request. Font tests count requests at a local
forwarding origin, because WebKit's automation events also report memory-cache
reads as transfers.

Capsize generates fallbacks from the served Latin files. Inter gets Arial,
Segoe UI and Helvetica (Liberation Sans shares Arial's), measured at the
default instance (opsz 14, wght 400). Plex gets Consolas, Menlo and Courier New.
Matching metrics reduces layout shifts but does not guarantee zero shift.

Inter does not cover Arabic. Arabic and RTL roots use a system font stack, and
Arabic headings reset `letter-spacing` to 0 because negative tracking breaks
letter joining. The site is English-only today.

## Colour

### Warm greys

The neutrals are a warm grey at hue 55, not Tailwind's blue-tinted gray. There
are no primitive steps: components use the semantic tokens below, and the hex
values live only in `tokens.css`.

The light page is white with `#fbf8f7` panels. Dark elevation gets lighter:
page `#0c0a09` → panel `#13100f` → inset `#1b1816`. Don't introduce drop shadows.

### Surfaces and boundaries

In the contrast table below, **S** means `--bg`, `--surface`, `--surface-inset`,
`--surface-overlay`. **F** means `--fill`, `--fill-hover`, `--fill-active`.

| Token                                                                      | Light / dark                                                      | Use / allowed foreground                                   | Never use for                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| `--bg`                                                                     | `#ffffff` / `#0c0a09`                                             | Page, header, text inputs, hero panel; S foregrounds below | Text                                          |
| `--surface`                                                                | `#fbf8f7` / `#13100f`                                             | Panels, cards, explainer/footer bands; S foregrounds       | An input's only visual boundary               |
| `--surface-overlay`                                                        | `#ffffff` / `#13100f`                                             | Native menu surface; S foregrounds                         | A translucent effect                          |
| `--surface-inset`                                                          | `#f6f1ef` / `#1b1816`                                             | Code blocks, inline code, table headers                    | Input backgrounds                             |
| `--fill`, `--fill-hover`, `--fill-active`                                  | `#f6f1ef`, `#eee9e6`, `#e5dfdb` / `#1b1816`, `#221f1d`, `#2a2624` | Controls, nav hover pill; `--text` / `--text-muted`        | A selected or pressed state with no other cue |
| `--accent-tint`                                                            | `#fff7f4` / `#1c0f0c`                                             | Callout and eyebrow backgrounds; `--accent-text`           | Status meaning                                |
| `--accent-subtle`                                                          | unchanged                                                         | Accent context; `--accent` / `--accent-hover`              | Decorative score or syntax colours            |
| `--success-subtle`, `--warning-subtle`, `--danger-subtle`, `--info-subtle` | unchanged                                                         | Matching status foreground                                 | Unrelated status colours                      |
| `--pattern-fg` (`--border-subtle`)                                         | `#1c1714` at 5% / white at 10% (`color-mix`)                      | Hatched rails, full-bleed hairlines, decorative outlines   | The only outline of an input                  |
| `--border`                                                                 | `#d2cbc6` / `#403b37`                                             | Nonessential separators, hero contender cards              | Essential control identification              |

Pressed buttons add an inset ring, selected tabs keep a 3px border and weight
600, and the current nav link adds weight 600 and an accent bar, so no state
relies on a fill change alone.

### Foreground contrast contract

Numbers are **minimum WCAG ratios across every allowed background**, normal
contrast preference. APCA columns are the smallest-magnitude signed Lc across
the same backgrounds (informational, not a gate). Text passes 4.5:1; essential
borders and focus indicators pass 3:1.

| Token                      | Light / dark          | Use / allowed backgrounds                                      | WCAG light | WCAG dark | Lc light | Lc dark | Never use for                 |
| -------------------------- | --------------------- | -------------------------------------------------------------- | ---------: | --------: | -------: | ------: | ----------------------------- |
| `--text`                   | `#1c1714` / `#f0ecea` | Headings, links, primary text; S + F                           |      13.46 |     12.77 |     86.3 |   -92.7 | Disabled-state concealment    |
| `--text` on selection      |                       | Selected text on `--selection-bg`                              |      12.85 |     10.11 |     83.6 |   -88.2 |                               |
| `--text-body`              | `#3d3631` / `#d6d0cc` | Prose and intro paragraphs; S                                  |      10.59 |     11.57 |     89.4 |   -77.5 | Headings                      |
| `--text-muted`             | `#58514c` / `#bbb4b0` | Explanations, labels, nav at rest; S + F                       |       5.90 |      7.33 |     68.8 |   -59.2 | Hiding necessary instructions |
| `--text-faint`             | `#706862` / `#8c847f` | Metadata, placeholders; S                                      |       4.88 |      4.81 |     69.5 |   -36.2 | Text on fills                 |
| `--accent-text`            | `#b42300` / `#ff9874` | Eyebrows, winner label; bg, surface, accent-tint               |       6.24 |      8.90 |     77.0 |   -60.8 | Error or "loser" meaning      |
| `--accent`                 | `#b42300` / `#ff4d2a` | Alias of `--accent-solid`; as text only on bg, surface, subtle |       5.67 |      5.01 |     70.6 |   -40.7 | Link or nav text              |
| `--accent-hover`           |                       | Interactive hover; bg, surface, accent-subtle                  |       7.18 |      7.93 |     77.2 |   -59.6 | Passive decoration            |
| `--success`                |                       | Success text; S + success-subtle                               |       6.16 |      8.54 |     74.7 |   -64.1 | Meaning without words/icon    |
| `--warning`                |                       | Warning text; S + warning-subtle                               |       6.49 |      8.74 |     76.0 |   -64.8 | Meaning without words/icon    |
| `--danger`                 |                       | Error text; S + danger-subtle                                  |       6.97 |      7.57 |     76.2 |   -57.3 | Losing specificity scores     |
| `--info`                   |                       | Informational status; S + info-subtle                          |       6.49 |      8.23 |     75.8 |   -60.2 | Ordinary prose                |
| `--on-accent`              | `#ffffff` / `#0c0a09` | Text on accent, accent-hover, accent-solid(-hover)             |       6.60 |      5.97 |    -86.1 |    44.7 | Text on neutral surfaces      |
| `--accent-border`          | `#ee4b2b` / `#b94129` | Meaningful borders (the hero winner card); bg, surface         |       3.50 |      3.47 |     59.5 |   -25.0 | Text                          |
| `--border-strong`          | `#78706a` / `#8c847f` | Essential boundary; bg, surface                                |       4.60 |      5.16 |     69.8 |   -36.9 | Light text                    |
| `--border-control-on-fill` | `#78706a` / `#8c847f` | Form-control boundary; S + F                                   |       3.68 |      4.08 |     55.5 |   -34.1 | Body text                     |
| `--focus-ring`             | `#b42300` / `#ff4d2a` | Focus colour; S + F                                            |       5.00 |      4.53 |     62.7 |   -39.4 | An outline shorthand          |

Light faint text is `#706862`, not `#78706a`: `#78706a` is 4.34:1 on the inset
surface. Use `--focus-outline` for the complete 2px outline and keep its 2px
offset. Scores, charts and syntax stay neutral, and a deciding score also has a
non-colour indicator. Status always has readable wording. With
`prefers-contrast: more`, body, secondary and faint text become primary, and
borders and control borders become `#3d3631` / `#d6d0cc`.

Run `npm run contrast` for all 76 foreground/background pairs, both themes,
plus the increased-contrast variant: **304 checks**. It resolves actual tokens,
converts OKLCH to sRGB using CSS Color 4 matrices, and fails on missing tokens,
cycles, out-of-gamut colours or low WCAG contrast. `color-mix()` tokens
(`--pattern-fg`, `--border-subtle`, `--marker`) are decorative and not gated.
The APCA calculation reports 0.0.98G-4g / apca-w3 0.1.9 signed Lc but never
changes pass/fail. Build-time consumers must pass imported raw token CSS to
`readTokens`; do not depend on a bundled module's filesystem-relative default.

### Accent

Vermilion, used in a few fixed places only:

| Token                  | Light / dark          | Use                                                     |
| ---------------------- | --------------------- | ------------------------------------------------------- |
| `--accent-solid`       | `#b42300` / `#ff4d2a` | `.button-primary` fill, nav current bar, `accent-color` |
| `--accent-solid-hover` | `#981c00` / `#ff6e4a` | `.button-primary` hover and active                      |
| `--on-accent`          | `#ffffff` / `#0c0a09` | Text on the solid fills                                 |
| `--accent-text`        | `#b42300` / `#ff9874` | Small accent text: eyebrows, the hero "Wins" label      |
| `--accent-vivid`       | `#ff4d2a`             | Decorative only: running-text link underlines           |
| `--accent-tint`        | `#fff7f4` / `#1c0f0c` | Callout and eyebrow backgrounds                         |
| `--accent-border`      | `#ee4b2b` / `#b94129` | Meaningful borders                                      |
| `--glow`               | `#ffe0d8` / `#521a0f` | The hero's radial glow (decorative)                     |
| `--selection-bg`       | `#ffd1c6` / `#642114` | `::selection`, with `--text`                            |
| `--focus-ring`         | `#b42300` / `#ff4d2a` | 2px focus outline at a 2px offset                       |

The places: one primary button per view; eyebrow labels (`.tool-category`,
`.toc-title`); running-text link underlines; the focus ring (an outline, so
forced-colors mode keeps it); text selection; native checkboxes, radios and
ranges through `accent-color` on the root; the hero glow; and the current nav
link's bar.

- `#ff4d2a` is never small text in light mode (3.31:1 on white), never the
  light focus ring (2.92:1 on the tints), and white never sits on it.
- Vermilion never means "error" or "loser". Errors keep `--danger` plus an icon
  and text; a losing score stays neutral.
- The hero duel marks its winner with the text "Wins" and `--accent-text`, never
  colour alone. `--primary`, `--primary-hover` and `--on-primary` are now
  deprecated aliases of the solid accent tokens.

### Links

As on tailwindcss.com, **only links inside running text are underlined**, and
they stay underlined: the accent against body text is only about 2.7:1, so colour
alone can't mark a link. The base `a` rule gives `--text` colour, weight 600, a
1px `--accent-vivid` underline at a 3px offset, and 2px on hover. These opt out:

- Header nav: `--text-sm` in `--text-muted`, never underlined. Hover turns the
  text `--text` on a `--fill-hover` pill (0.5rem radius); only `color` and
  `background-color` transition, for 150ms, under
  `prefers-reduced-motion: no-preference`. `aria-current="page"` is `--text`,
  weight 600 and a 2px `--accent-solid` `border-block-end` (a border, not a
  shadow, so forced colors keep it).
- Footer: muted, never underlined; hover turns it `--text`.
- Breadcrumbs, results nav: muted, no underline at rest, underline on hover.
- TOC: Tailwind's docs-sidebar rail (see `.toc-link`).
- Buttons and `.button-quiet`: never underlined.
- Links inside headings: no underline styling.

Selector-anatomy `.part` underlines, `.numeral[data-decided]` and the decided
ladder outcome are state indicators, not link styling. Keep them.

## Type and rhythm

Tailwind's fixed scale. Sizes step up at breakpoints instead of using `clamp()`.
Every size has a matching `--text-<size>--line-height`.

| Token         |     Size | Line height | Typical role                                     |
| ------------- | -------: | ----------: | ------------------------------------------------ |
| `--text-xs`   |   .75rem |        1rem | Eyebrow labels (with a 1.5rem line height)       |
| `--text-sm`   |  .875rem |     1.25rem | Metadata, nav, TOC, code blocks, explainer prose |
| `--text-base` |     1rem |      1.5rem | Body, UI, card titles, tool intro                |
| `--text-lg`   | 1.125rem |     1.75rem | Home lead, inner-page and explainer h2           |
| `--text-xl`   |  1.25rem |     1.75rem | Logo, tabs, verdicts                             |
| `--text-2xl`  |   1.5rem |        2rem | Metric values, accessible-name verdict           |
| `--text-3xl`  | 1.875rem |     2.25rem | Tool and inner-page h1, explainer title          |
| `--text-4xl`  |  2.25rem |      2.5rem | Home hero h1 (base), footer slogan               |
| `--text-5xl`  |     3rem |           1 | Home hero h1 from `sm`, home footer slogan       |
| `--text-6xl`  |  3.75rem |           1 | Home hero h1 at `xl`                             |
| `--text-7xl`  |   4.5rem |           1 | Home hero h1 from 90rem                          |
| `--text-8xl`  |     6rem |           1 | Unused since the two-column hero                 |

Breakpoints (literals in `@media`): sm 40rem, md 48rem, lg 64rem, xl 80rem,
2xl 96rem. Tracking: `--tracking-tight` -.025em (h1, h2), `--tracking-tighter`
-.05em (home hero and home h2), `--tracking-widest` .1em (eyebrows). `html` sets
line-height 1.5; other line-height tokens are UI 1.4, body 1.6 and code 1.5.

The explainer body follows Tailwind's `.prose`: .875rem with line-height 2 in
`--text-body`, `h2` at `--text-lg` / 1.5556 with 5rem above, `h3` at
`--text-base` with 4rem above (1.5rem straight after an h2), square `ul`
markers in `--marker`, decimal `ol` markers in `--text` at 600. Inline code has
no pill, and its backticks are drawn with `content: "`" / ""` so screen readers
don't announce them. Home and card paragraphs keep their own roles.

Specificity score numerals use a separate container-relative data-display scale.

Spacing is fixed multiples of `--spacing: 0.25rem`:

| Space token (`--space-`) |  Value | Pair token | Below `sm` | From `sm` |
| ------------------------ | -----: | ---------- | ---------: | --------: |
| 3xs                      | .25rem | s-m        |       1rem |    1.5rem |
| 2xs                      |  .5rem | m-l        |     1.5rem |      2rem |
| xs                       | .75rem | l-xl       |       2rem |      3rem |
| s                        |   1rem | xl-2xl     |       3rem |      4rem |
| m                        | 1.5rem |            |            |           |
| l                        |   2rem |            |            |           |
| xl                       |   3rem |            |            |           |
| 2xl                      |   4rem |            |            |           |
| 3xl                      |   6rem |            |            |           |
| section                  |   5rem |            |            |           |

`--gutter` is `clamp(1rem, 4vw, 2.5rem)`.

The parent owns rhythm:

- `.flow`: normal siblings get `s`; preceding space for h2 is `l-xl`, for h3 `m`;
  heading-to-content is `xs`. Override with `--flow-space` for a group, or set
  `--flow-heading-space` on a heading (or on the element after one) to change
  its own preceding space.
- `.stack`: column flex with `--stack-space` (default `s`).
- `.cluster`: wrapping inline group with `--cluster-space` (default `2xs`).
- `.region`: block padding `xl-2xl`, never viewport-height sections.
- Group-to-group space should be at least 1.5 times within-group space.
  Do not add child top/bottom margins to compensate for a missing parent primitive.

Use logical properties, `minmax(0, 1fr)` and `min-inline-size: 0` in grids.
Workbench panes are query containers: internal layouts respond to available
pane width, not the viewport. DOM order stays input, then output.
Tables/code may scroll internally; code regions must be named and keyboard
focusable. Use [codeBlock](../src/lib/view/code.ts) for dynamic snippets.
Do not clip an outline to hide overflow.

## Layout

The page should never look like a narrow column in an empty window.

| Token              | Value                      | Use                                                    |
| ------------------ | -------------------------- | ------------------------------------------------------ |
| `--container-wide` | 90rem                      | `.wrap`: header, footer, hero, tool grid, workbenches  |
| `--container-page` | 64rem                      | `.wrap.wrap-page`: About, Methodology, the Tools index |
| `--measure`        | 68ch                       | Running text: `.prose`, explainers, `.home-body`       |
| `--rail`           | 2.5rem                     | Hatched side rails                                     |
| `--gutter`         | `clamp(1rem, 4vw, 2.5rem)` | Inline padding inside every container                  |
| `--section-space`  | `clamp(4rem, 8vw, 8rem)`   | Between `.section`s (each pads half on both sides)     |
| `--pattern-fg`     | see Colour                 | Rails, hairlines, the hero stage outline               |

- **Shell.** `BaseLayout` wraps header, main and footer in `.page-shell`. From
  `md` it is a three-column grid,
  `var(--rail) minmax(0, var(--container-wide)) var(--rail)`. The rails are empty
  `aria-hidden` elements that run the full page height, with a 1px
  `--pattern-fg` inline border and a fixed 10px `--hatch`. Below `md` there are
  no rails.
- **Hairlines.** `.hairlines` draws 1px `--pattern-fg` rules above and below a
  row with `200vw` pseudo-elements from `-100vw`. They are symmetric, so RTL
  needs nothing. The hero row and every section heading row
  (`.section-heading.hairlines`) use them, and a heading row's own rule replaces
  the section border above it.
- **Clipping.** `.page-shell` has `overflow-x: clip`. Never `hidden`: that makes
  it a scroll container and the sticky `.site-header` stops sticking.
- **Rhythm.** A heading sits close to its own content (`xs` plus the row's
  padding) and `--section-space` away from the section above.
- **Home hero.** From `lg`, `minmax(0, 5fr) minmax(0, 7fr)`: the h1 and lede on
  the left, and on the right a Specificity duel rendered at build time with
  `buildDuel` and the `scoreView`/`verdictView` helpers (`HeroDuel.astro`). The
  duel sits on a hatched double bezel (1rem outer radius and 0.5rem padding,
  0.5rem inner radius, 1px `--pattern-fg` outlines) over a decorative
  `--glow`. The h1 is three fixed lines so the font swap can't change its line
  count; its caps are in em, because `ch` follows the fallback's "0".
- **Forced colors.** The hatch, glow and hairlines are hidden; the hero stage
  gets a real `CanvasText` border, and cards and panes keep theirs.
- Every new grid track uses `minmax(0, …)`. Workbenches keep their own tracks.

## Adding a tool: ten steps

1. Add a collection entry with title, slug, summary (max 160 characters), status,
   category, keywords, publishedAt and updatedAt; ogTitle is optional.
2. Set a unique numeric `order` and concise `navLabel`.
3. Add two or three distinct `related` references, excluding the tool itself.
   [getTools](../src/lib/seo/tools.ts) validates and sorts these records.
4. Create the route with [ToolLayout](../src/layouts/ToolLayout.astro), passing
   the collection entry, title, heading and lead. It owns metadata, breadcrumbs,
   the single h1, WebApplication schema, no-JS notice and related links.
5. Put `ToolWorkbench` in the default slot. Supply a short `inputLabel` such as
   "CSS source", distinct from the form control's own label. It names the group
   through `aria-labelledby`; input goes before output, never CSS-reordered.
6. Place limits, units and privacy/sharing behaviour immediately under the input.
   Do not change existing URL behaviour as part of visual work.
7. Pre-render a useful result. Add labeled output sections and plain anchor
   navigation; reserve live regions for concise updates, not entire reports.
8. Use `ExplainerBand` in the `explainer` slot with measured inner prose.
   Keep headings sequential. The optional `after-tool` slot supports larger tools.
9. Keep engines headless, escape user data through the shared renderer, and
   enhance with a small controller. Add the collection summary to `llms.txt`,
   the title to the wrong-result issue form, and a methodology entry (checks and
   known limits). `/tools/` and the tool page's trust links are automatic.
10. Add route coverage for metadata, fonts, headings, keyboard use, both themes,
    no-JS and reflow. Run lint/check/tests/contrast/build/e2e and inspect screenshots.

## Deprecated aliases and exceptions

Every alias below is removed **in the release after the design-system release**.
Do not use them for new work.

| Alias                                  | Replacement                                                       |
| -------------------------------------- | ----------------------------------------------------------------- |
| `--font`                               | `--font-sans`                                                     |
| `--font-prose`                         | `--font-sans`                                                     |
| `--surface-0`                          | `--bg`                                                            |
| `--surface-1`, `--surface-2`, `--bg-2` | `--surface`                                                       |
| `--surface-3`, `--bg-3`                | `--surface-inset`                                                 |
| `--text-2`                             | `--text-muted`                                                    |
| `--text-3`                             | `--text-faint`                                                    |
| `--line`                               | `--border-subtle`                                                 |
| `--control-border`                     | `--border-strong` (filled inputs need `--border-control-on-fill`) |
| `--accent-strong`                      | `--accent-hover`                                                  |
| `--max-width`                          | `--container-wide`                                                |
| `--primary`, `--primary-hover`         | `--accent-solid`, `--accent-solid-hover`                          |
| `--on-primary`                         | `--on-accent`                                                     |

Legitimate numeric exceptions: font-face descriptors/generated metrics,
media/container query thresholds (custom properties cannot be used there),
structural zero/100%/grid counts, SVG geometry, and fixed-pixel OG canvases.
OG typography and colours still derive from tokens and use the Latin Figtree file; the image library selects the Bold and Regular instances from the variable axis. The image
library's single-colour `bgGradient` option creates a solid background.
`LiveExample` intentionally keeps fixed demo canvas colours and example CSS
inside a shadow root: these teach the cascade, not the site's palette. System
colours remain in forced-colour overrides. Accessibility-only reduced-motion
overrides and visually-hidden geometry are not ordinary UI spacing.

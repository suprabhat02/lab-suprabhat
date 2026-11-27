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

### Primitive ramp

Tailwind gray, read from tailwindcss.com's production CSS. Use the semantic
aliases in components, never the steps.

| Step | Hex       | Main roles (light / dark)                                         |
| ---- | --------- | ----------------------------------------------------------------- |
| 50   | `#f9fafb` | Light surface                                                     |
| 100  | `#f3f4f6` | Light inset and control fill                                      |
| 200  | `#e5e7eb` | Light separator, hover fill                                       |
| 300  | `#d1d5dc` | Light active fill / dark body text                                |
| 400  | `#99a1af` | Dark muted and faint text; never light text (2.6:1)               |
| 500  | `#6a7282` | Light faint text; control borders in both themes                  |
| 600  | `#4a5565` | Light muted text / dark primary-button hover                      |
| 700  | `#364153` | Light body text / dark primary button                             |
| 800  | `#1e2939` | Light primary-button hover / dark inset, hover, active, separator |
| 900  | `#101828` | Dark surface, overlay and fill                                    |
| 950  | `#030712` | Light text / dark page                                            |

The light page is white with gray-50 panels. Dark elevation gets lighter:
page (950) → panel (900) → inset (800). Don't introduce drop shadows.

### Surfaces and boundaries

In the contrast table below, **S** means `--bg`, `--surface`, `--surface-inset`,
`--surface-overlay`. **F** means `--fill`, `--fill-hover`, `--fill-active`.

| Token                                                                      | Light / dark                           | Use / allowed foreground                                  | Never use for                                  |
| -------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `--bg`                                                                     | white / 950                            | Page, header, text inputs; S foregrounds below            | Text                                           |
| `--surface`                                                                | 50 / 900                               | Panels, cards, explainer/footer bands; S foregrounds      | An input's only visual boundary                |
| `--surface-overlay`                                                        | white / 900                            | Native menu surface; S foregrounds                        | A translucent effect                           |
| `--surface-inset`                                                          | 100 / 800                              | Code blocks, inline code, table headers                   | Faint text or input backgrounds (4.39:1 light) |
| `--fill`, `--fill-hover`, `--fill-active`                                  | 100, 200, 300 / 900, 800, 800          | Controls and neutral selection; `--text` / `--text-muted` | A selected or pressed state with no other cue  |
| `--primary`, `--primary-hover`                                             | black, 800 / 700, 600                  | `.button-primary` only; `--on-primary` (white)            | More than one action per view                  |
| `--accent-subtle`                                                          | unchanged                              | Accent context; `--accent` / `--accent-hover`             | Decorative score or syntax colours             |
| `--success-subtle`, `--warning-subtle`, `--danger-subtle`, `--info-subtle` | unchanged                              | Matching status foreground                                | Unrelated status colours                       |
| `--border-subtle`                                                          | 950 at 5% / white at 10% (`color-mix`) | Decorative hairlines                                      | The only outline of an input                   |
| `--border`                                                                 | 200 / 800                              | Nonessential separators                                   | Essential control identification               |

Dark hover and active fills are both gray-800, because gray-700 fails muted
text (3.96:1) and control borders (2.13:1). Pressed buttons therefore add an
inset ring. Selected tabs keep a 3px border and weight 600, and current links
use weight 600 (the TOC also uses its rail border).

### Foreground contrast contract

Numbers are **minimum WCAG ratios across every allowed background**, normal
contrast preference. APCA columns are the smallest-magnitude signed Lc across
the same backgrounds (informational, not a gate). Text passes 4.5:1; essential
borders and focus indicators pass 3:1.

| Token                      | Light / dark        | Use / allowed backgrounds                                 | WCAG light | WCAG dark | Lc light | Lc dark | Never use for                 |
| -------------------------- | ------------------- | --------------------------------------------------------- | ---------: | --------: | -------: | ------: | ----------------------------- |
| `--text`                   | 950 / white         | Headings, links, primary text; S + F                      |      13.67 |     14.67 |     81.2 |  -104.3 | Disabled-state concealment    |
| `--text-body`              | 700 / 300           | Prose and intro paragraphs; S                             |       9.36 |      9.96 |     87.3 |   -77.3 | Headings                      |
| `--text-muted`             | 600 / 400           | Explanations, labels, nav rails; S + F                    |       5.13 |      5.64 |     61.6 |   -47.5 | Hiding necessary instructions |
| `--text-faint`             | 500 / 400           | Eyebrows, metadata, placeholders; bg, surface, overlay    |       4.63 |      6.82 |     70.5 |   -49.9 | Text on inset or fills        |
| `--accent`                 | `#b42300`/`#ff4d2a` | Underlines and focus; as text only on bg, surface, subtle |       5.67 |      5.01 |     70.6 |   -40.7 | Link or nav text              |
| `--accent-hover`           |                     | Interactive hover; bg, surface, accent-subtle             |       7.18 |      7.93 |     77.2 |   -59.6 | Passive decoration            |
| `--success`                |                     | Success text; S + success-subtle                          |       6.16 |      7.69 |     74.7 |   -62.7 | Meaning without words/icon    |
| `--warning`                |                     | Warning text; S + warning-subtle                          |       6.49 |      7.78 |     76.0 |   -63.3 | Meaning without words/icon    |
| `--danger`                 |                     | Error text; S + danger-subtle                             |       6.97 |      6.68 |     76.2 |   -55.7 | Losing specificity scores     |
| `--info`                   |                     | Informational status; S + info-subtle                     |       6.49 |      7.34 |     75.8 |   -60.2 | Ordinary prose                |
| `--on-accent`              | white / 950         | Text on accent or accent-hover fill                       |       6.60 |      6.09 |    -86.1 |    44.8 | Text on neutral surfaces      |
| `--on-primary`             | white               | Text on primary or primary-hover                          |      14.67 |      7.56 |   -104.3 |   -91.1 | Text on neutral surfaces      |
| `--border-strong`          | 500                 | Essential boundary; bg, surface                           |       4.63 |      3.67 |     70.5 |   -27.0 | Light text                    |
| `--border-control-on-fill` | 500                 | Form-control boundary; S + F                              |       3.28 |      3.03 |     48.9 |   -24.6 | Body text                     |
| `--focus-ring`             | accent              | Focus colour; S + F                                       |       4.48 |      4.43 |     56.2 |   -39.1 | An outline shorthand          |

Gray-500 text on gray-950 is only 4.16:1, which is why dark faint text is
gray-400. Use `--focus-outline` for the complete 3px outline and preserve its
offset. Accent works the way tailwindcss.com uses sky-400: running-text link
underlines and the focus ring. Scores, charts and syntax stay neutral, and a
deciding score also has a non-colour indicator. Status always has readable
wording. With `prefers-contrast: more`, body, secondary and faint text become
primary, and borders and control borders become gray-700 / gray-300.

Run `npm run contrast` for all 67 foreground/background pairs, both themes,
plus the increased-contrast variant: **268 checks**. It resolves actual tokens,
converts OKLCH to sRGB using CSS Color 4 matrices, and fails on missing tokens,
cycles, out-of-gamut colours or low WCAG contrast. `color-mix()` tokens
(`--border-subtle`, `--marker`) are decorative and not gated. The APCA
calculation reports 0.0.98G-4g / apca-w3 0.1.9 signed Lc but never changes
pass/fail. Build-time consumers must pass imported raw token CSS to
`readTokens`; do not depend on a bundled module's filesystem-relative default.

### Links

As on tailwindcss.com, **only links inside running text are underlined**:
`--text` colour, weight 600, a 1px `--accent` underline at a 3px offset, and 2px
on hover. That is the base `a` rule. These opt out:

- Header nav: `--text-sm`, no underline at rest, a 1px underline on hover,
  weight 600 for `aria-current`.
- Footer, breadcrumbs, results nav: muted, no underline at rest, underline on hover.
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
| `--text-5xl`  |     3rem |           1 | Home hero h1 at `sm`, home footer slogan         |
| `--text-6xl`  |  3.75rem |           1 | Home hero h1 at `lg`                             |
| `--text-8xl`  |     6rem |           1 | Home hero h1 at `xl`                             |

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

`--gutter` is 1rem, then 1.5rem at `sm` and 2rem at `lg`.

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

Legitimate numeric exceptions: font-face descriptors/generated metrics,
media/container query thresholds (custom properties cannot be used there),
structural zero/100%/grid counts, SVG geometry, and fixed-pixel OG canvases.
OG typography and colours still derive from tokens and use the Latin Figtree file; the image library selects the Bold and Regular instances from the variable axis. The image
library's single-colour `bgGradient` option creates a solid background.
`LiveExample` intentionally keeps fixed demo canvas colours and example CSS
inside a shadow root: these teach the cascade, not the site's palette. System
colours remain in forced-colour overrides. Accessibility-only reduced-motion
overrides and visually-hidden geometry are not ordinary UI spacing.

# Design system

Use semantic tokens from [tokens.css](../src/styles/tokens.css), not new local
colours, type sizes or vertical margins. The system is neutral, dark-first, and
progressively enhanced. No decorative motion, shadows or gradients are required.

## Fonts

| Role                                                                           | Family / token             | Weight token                              |
| ------------------------------------------------------------------------------ | -------------------------- | ----------------------------------------- |
| Body, explanations, prose                                                      | Figtree / `--font-sans`    | `--weight-regular` 400                    |
| Labels, buttons, navigation, summaries, table headers                          | Figtree / `--font-sans`    | `--weight-medium` 500                     |
| Headings, verdicts, `strong`, current/selected states                          | Figtree / `--font-sans`    | `--weight-heading` 650                    |
| Display h1                                                                     | Figtree / `--font-sans`    | `--weight-display` 750                    |
| Footer slogan                                                                  | Figtree / `--font-sans`    | `--weight-heading` 650, display tracking  |
| Code, CSS/HTML inputs, selectors, specificity triples, numeric data, lab/ logo | Geist Mono / `--font-mono` | 400; `--weight-semibold` 600 for emphasis |

Figtree is lighter than Geist at the same number (about 665 matches Geist 600),
so sans roles use 650 and 750 rather than 600 and 700. `--weight-semibold` is
for Geist Mono only. Tabular numerals belong on numeric data, not all prose.
Mono ligatures are disabled. Do not add `-webkit-font-smoothing`: it is
macOS-only and thins light text on dark backgrounds.

**Identifiers are always mono.** The Fontsource build of Figtree removes `ss01`,
`ss02` (the alternate that separates capital I from lowercase l) and `case`; only
`tnum`, `pnum`, fractions and kerning remain. Any string where I, l, 1, 0 and O
must be told apart (selectors, IDs, class names, at-rules, ARIA attributes,
specificity triples and data values) goes in `code` or another mono element.
`rich()` in [h.ts](../src/lib/view/h.ts) wraps backticked text and recognisable
identifiers and triples in `code`, so engine messages need no markup. Native
`<option>` text can't contain markup, so selects that list selectors use mono.

Figtree ships no italic here: italics are separate files, and the lab doesn't
load them. The browser synthesises an oblique for `em` and `i`; the site has no
long italic passages, so a separate download isn't justified.

Both Fontsource variable families are self-hosted, OFL-1.1, with `font-display:
swap` and separate Latin/Latin-ext unicode ranges. Never use a font CDN: it adds a
connection and a third-party request. Latin Figtree is **20,156 bytes** (axis
`wght` 300-900); Latin Geist Mono is **23,128 bytes**. Together they cost
**43,284 bytes** on a fresh load. Latin-ext (10,280 bytes for Figtree) is
demand-loaded, never preloaded. Figtree covers Latin and Latin-ext only:
Cyrillic, Greek, Arabic and Devanagari fall back to system fonts. The site is
English-only today.

All pages preload exactly the two Latin files: Figtree for prose and Mono for
the above-fold logo/data. Match the font-face URL and anonymous `crossorigin`
so preload and CSS share one request. The same-origin preview disables Vite's
CORS middleware: its `Vary: Origin` header otherwise makes WebKit refetch an
anonymous preload as a CSS font request. Font tests count requests at a local
forwarding origin, because WebKit's automation events also report memory-cache
reads as transfers.

Run `npm run fonts` to copy assets (stale files in `public/fonts/` are removed)
and regenerate [fonts.generated.css](../src/styles/fonts.generated.css); do not
hand-edit generated adjustments. Figtree's metrics per 1000 em: x-height 500,
cap height 700, ascent 950, descent 250, line gap 0. The variable file's default
instance is Light (300), so the fallback script uses the **Regular** entry from
`@capsizecss/metrics/figtree` instead of measuring the file. That gives Arial
ascent 94.32%, descent 24.82%, line gap 0% and size-adjust 100.72%; Segoe UI
and Helvetica get matching faces, and Liberation Sans shares Arial's. Geist Mono
(x-height 530, cap 710, ascent 1005, descent 295) still measures its own file
and uses Consolas, Menlo and Courier New. Inline code stays at `0.95em`, which
puts its x-height (503) within 1% of Figtree's (500).

The lead measure is 48rem: tested fallback/web-font line counts remain stable
there. Prose uses `--measure: 46ch`. Figtree's `0` is wide for its average
letter, so the old 66ch gave a median of 96 characters per full line; 46ch
measures a median of 65, p90 74 and max 77.

Figtree is a brand choice: a friendlier, rounder geometric sans that saves
about 9 KB on the Latin file compared with Geist. It is not sharper than Geist,
and no published comparison shows it to be more legible. Reverting is one
token plus the font files, the fallback entry and the preload.

## Colour

### Primitive ramp

`--gray-1` through `--gray-12` use `light-dark(oklch(...), oklch(...))`,
hue 35 and chroma no greater than .010. Use their semantic aliases in components.

| Step | Light L / dark L | Role                                         |
| ---- | ---------------- | -------------------------------------------- |
| 1    | 99% / 15.5%      | Light paper / dark page                      |
| 2    | 97.5% / 18.5%    | Light page / dark panel                      |
| 3    | 95% / 21.5%      | Insets, overlays, control fill               |
| 4    | 92.5% / 24.5%    | Hover fill                                   |
| 5    | 90% / 27.5%      | Active fill                                  |
| 6    | 87% / 31%        | Decorative hairline                          |
| 7    | 82% / 37%        | Ordinary separator                           |
| 8    | 64% / 52%        | Strong outline on page/paper                 |
| 9    | 52% / 64%        | Faint text, filled-control outline           |
| 10   | 47% / 68%        | Reserved neutral step; no component role yet |
| 11   | 43% / 80%        | Secondary text                               |
| 12   | 20.5% / 95.5%    | Primary text                                 |

Light elevation uses white-ish paper over a slightly darker page band, separated
by a hairline. Dark elevation gets lighter: page -> panel -> overlay/inset.
Do not copy the light mapping into dark mode or introduce drop shadows.

### Surfaces and boundaries

In the contrast table below, **S** means `--bg`, `--surface`, `--surface-inset`,
`--surface-overlay`. **F** means `--fill`, `--fill-hover`, `--fill-active`.

| Token                                                                      | Use / allowed foreground                                                                    | Never use for                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `--bg`                                                                     | Page and header; S foregrounds below                                                        | Text                                              |
| `--surface`                                                                | Panels, cards, explainer/footer bands; S foregrounds                                        | An input's only visual boundary                   |
| `--surface-overlay`                                                        | Native menu surface; S foregrounds                                                          | A translucent effect                              |
| `--surface-inset`                                                          | Code blocks and table headers; S foregrounds                                                | Primary action emphasis                           |
| `--fill`, `--fill-hover`, `--fill-active`                                  | Controls and neutral selection; `--text` / `--text-muted`                                   | Small faint/status text without a checked pairing |
| `--accent-subtle`                                                          | Accent context; `--accent` / `--accent-hover`                                               | Decorative score or syntax colours                |
| `--success-subtle`, `--warning-subtle`, `--danger-subtle`, `--info-subtle` | Matching status foreground                                                                  | Unrelated status colours                          |
| `--border-subtle`                                                          | Decorative panel/row/code separators; at least 1.28 light / 1.33 dark on page, panel, inset | The only outline of an input                      |
| `--border`                                                                 | Nonessential separators; at least 1.51 / 1.68 on page, panel, inset                         | Essential control identification                  |

Surfaces have no standalone contrast requirement; their allowed foreground ratios
are measured below. The decorative border figures are informational, not 3:1 claims.

### Foreground contrast contract

Numbers are **minimum WCAG ratios across every allowed background**, normal
contrast preference. APCA columns are the smallest-magnitude signed Lc across
the same backgrounds (informational, not a gate). Text passes 4.5:1; essential
borders and focus indicators pass 3:1.

| Token                      | Use / allowed backgrounds                                         | WCAG light | WCAG dark | Lc light | Lc dark | Never use for                 |
| -------------------------- | ----------------------------------------------------------------- | ---------: | --------: | -------: | ------: | ----------------------------- |
| `--text`                   | Primary text; S + F                                               |      13.28 |     13.03 |     85.1 |   -94.6 | Disabled-state concealment    |
| `--text-muted`             | Explanations, labels; S + F                                       |       6.02 |      7.94 |     68.6 |   -63.7 | Hiding necessary instructions |
| `--text-faint`             | Tertiary metadata; S                                              |       4.77 |      5.20 |     67.6 |   -39.2 | Text on hover/active fills    |
| `--accent`                 | Links, current navigation, primary action fill; S + accent-subtle |       5.67 |      5.01 |     70.6 |   -40.7 | Decorative numbers/syntax     |
| `--accent-hover`           | Interactive hover; S + accent-subtle                              |       7.18 |      7.93 |     77.2 |   -59.6 | Passive decoration            |
| `--success`                | Success text; S + success-subtle                                  |       6.11 |      8.54 |     74.2 |   -64.1 | Meaning without words/icon    |
| `--warning`                | Warning text; S + warning-subtle                                  |       6.49 |      8.74 |     76.0 |   -64.8 | Meaning without words/icon    |
| `--danger`                 | Error text; S + danger-subtle                                     |       6.97 |      7.57 |     76.2 |   -57.3 | Losing specificity scores     |
| `--info`                   | Informational status; S + info-subtle                             |       6.48 |      8.23 |     75.6 |   -61.7 | Ordinary prose                |
| `--on-accent`              | Text on accent or accent-hover fill                               |       6.60 |      5.91 |    -86.1 |    44.7 | Text on neutral surfaces      |
| `--border-strong`          | Essential boundary; bg, surface                                   |       3.14 |      3.37 |     56.2 |   -23.5 | Outline on inset/fill         |
| `--border-control-on-fill` | Filled-control boundary; S + F                                    |       4.09 |      4.41 |     58.0 |   -37.1 | Body text                     |
| `--focus-ring`             | Focus colour; S + F                                               |       4.89 |      4.49 |     61.3 |   -39.3 | An outline shorthand          |

Use `--focus-outline` for the complete 3px outline and preserve its offset.
Accent is fixed at light `#b42300` / dark `#ff4d2a`. Scores, charts and syntax
stay neutral; a deciding score also has a non-colour indicator. Status always
has readable wording. With `prefers-contrast: more`, secondary text becomes
primary and borders become stronger.

Run `npm run contrast` for all 66 foreground/background pairs, both themes,
plus the increased-contrast variant: **264 checks**. It resolves actual tokens,
converts OKLCH to sRGB using CSS Color 4 matrices, and fails on missing tokens,
cycles, out-of-gamut colours or low WCAG contrast. The APCA calculation reports
0.0.98G-4g / apca-w3 0.1.9 signed Lc but never changes pass/fail.
Build-time consumers must pass imported raw token CSS to `readTokens`;
do not depend on a bundled module's filesystem-relative default.

## Type and rhythm

Type interpolates from a 16px base / 1.2 ratio at 320px to 18px / 1.25 at 1280px.
The rem bounds still respond to browser font-size preferences. The two sub-body
steps are fixed at 12px and 14px (at the default root size) rather than fluid,
because fractional small text renders soft, especially on Windows.

| Token       | Min rem | Max rem | Typical role            |
| ----------- | ------: | ------: | ----------------------- |
| `--step--2` |     .75 |     .75 | Small data annotations  |
| `--step--1` |    .875 |    .875 | Metadata, code blocks   |
| `--step-0`  |       1 |   1.125 | Body, UI                |
| `--step-1`  |     1.2 |  1.4062 | Lead, workbench h3      |
| `--step-2`  |    1.44 |  1.7578 | h3, workbench h2        |
| `--step-3`  |   1.728 |  2.1973 | Section h2              |
| `--step-4`  |  2.0736 |  2.7466 | Tool h1                 |
| `--step-5`  |  2.4883 |  3.4332 | Home h1, footer display |

Line heights: display 1.1, heading 1.2, UI 1.4, body 1.6, code 1.5.
Tracking: -.02em display, -.01em headings, normal for body/code.
Specificity score numerals use a separate container-relative data-display scale.

| Space token (`--space-`) | Min rem | Max rem |
| ------------------------ | ------: | ------: |
| 3xs                      |     .25 |   .2812 |
| 2xs                      |      .5 |   .5625 |
| xs                       |     .75 |   .8438 |
| s                        |       1 |   1.125 |
| m                        |     1.5 |  1.6875 |
| l                        |       2 |    2.25 |
| xl                       |       3 |   3.375 |
| 2xl                      |       4 |     4.5 |
| 3xl                      |       6 |    6.75 |
| s-m                      |       1 |  1.6875 |
| m-l                      |     1.5 |    2.25 |
| l-xl                     |       2 |   3.375 |
| xl-2xl                   |       3 |     4.5 |

The parent owns rhythm:

- `.flow`: normal siblings get `s`; preceding space for h2 is `l-xl`, for h3 `m`;
  heading-to-content is `xs`. Override with `--flow-space` for a specific group.
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
| `--font`                               | `--font-mono`                                                     |
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

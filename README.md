# Suprabhat's Lab

**Web for all, all for web.**

[lab.suprabhat-dev.com](https://lab.suprabhat-dev.com) is a free, open home for frontend resources: tools and explainers that make CSS and UI easier for anyone. No sign-up, no paywall, no tracking, and support for every device and assistive technology.

The first tool is **CSS Specificity Wars** at [`/specificity/`](https://lab.suprabhat-dev.com/specificity/). It answers "which rule wins, and why?":

- **Duel:** compare up to eight selectors. Each gets its (A, B, C) score in huge numerals, the deciding column lights up, and one plain sentence explains the result.
- **Anatomy:** every part of each selector with what it adds and why, including `:is()`, `:not()`, `:has()`, `:where()` and `:nth-child(of S)`.
- **Nesting expander:** paste nested CSS and see the `:is()` form it really produces, with specificity.
- **Cascade resolver:** describe two to four competing declarations and watch all seven cascade steps decide: origin and importance, context, inline styles, layers, specificity, `@scope` proximity and order of appearance.
- **Fix suggestions** and **shareable links**, plus a long-form explainer on the same page.

**Selector Playground** at [`/playground/`](https://lab.suprabhat-dev.com/playground/) analyzes one input as you type, with highlighted selector parts, specificity contributions, and engine warnings. It uses the same anatomy renderer and pre-renders a worked example for visitors without JavaScript.

**Accessible Name Wars** at [`/accessible-name/`](https://lab.suprabhat-dev.com/accessible-name/) explains which label names a control, with a recursive computation ladder, a separate description, markup checks, and shareable links. Pasted HTML is parsed but never rendered or executed. A build-time example works without JavaScript.

**Stylesheet Audit** at [`/stylesheet-audit/`](https://lab.suprabhat-dev.com/stylesheet-audit/) graphs selectors in source order, with a sortable data table, layer order, metrics and focused maintenance findings. CSS is parsed locally in a worker, never applied or fetched. Only Copy link puts input in a URL; the default audit works without JavaScript.

At desktop widths, the single-input tools keep source and results side by side;
the source stays available while you scroll the report. Narrow screens stack
source before results. Audit and Accessible Name have plain links between
result sections. The header's native Menu disclosure exposes every tool on
small screens, including without JavaScript.

## Run it

Requires Node 22.23.4 or newer (CI uses Node 24) and npm.

```sh
npm install
npm run dev          # http://localhost:4321
npm run build        # static site in dist/, prints gzipped JS/CSS sizes and fails if a budget is exceeded
npm run preview      # serve the build
```

| Script               | What it does                                                 |
| -------------------- | ------------------------------------------------------------ |
| `npm run check`      | `astro check` and `tsc --noEmit`                             |
| `npm run contrast`   | Offline WCAG token-pair checks in both themes                |
| `npm test`           | Vitest: engine suites (specificity, cascade, nesting, share) |
| `npm run test:e2e`   | Playwright + axe against the built site (run `build` first)  |
| `npm run lint`       | ESLint (flat config, `typescript-eslint` strict, Astro)      |
| `npm run format`     | Prettier with `prettier-plugin-astro`                        |
| `npm run lighthouse` | Lighthouse medians; needs `npx astro preview --port 4330`    |

The first `npx playwright install chromium` downloads the browser for e2e tests.

## Add a new tool

Every tool is an entry in the `tools` content collection. The home page and sitemap are generated from it.

1. **Describe it.** Create `src/content/tools/<slug>.md`:

   ```md
   ---
   title: Contrast Checker
   slug: contrast
   summary: One sentence, 160 characters at most. It appears on the home page and in search results.
   status: in-progress # or live
   category: Colour
   order: 5
   navLabel: Contrast
   related: [specificity, playground]
   keywords: [contrast checker, wcag contrast]
   publishedAt: 2026-12-01
   updatedAt: 2026-12-01
   ogTitle: Is this colour pair readable? # optional
   ---

   A short paragraph about the tool.
   ```

   The schema lives in `src/content.config.ts`; the build fails if a field is missing or the summary is too long.

2. **Build the page** at `src/pages/<slug>/index.astro`, using `ToolLayout` with the collection entry, title, heading and lead. Use `ToolWorkbench` with named `input` and `output` slots and a short `inputLabel` such as "CSS source"; input comes first in the DOM and becomes sticky at 64rem. Put an `ExplainerBand` in the layout's `explainer` slot. Metadata, related tools and the OG image derive from the collection. Follow the [design-system checklist](docs/design-system.md#adding-a-tool-ten-steps).
3. **Keep logic headless.** Put pure TypeScript in `src/lib/<name>/` with Vitest tests in `__tests__/`, and render through `src/lib/view/h.ts` so the build can pre-render the default state.
4. **Enhance, don't depend.** Add one small `<script>` island. Load anything heavy on first interaction and keep the page under 15 KB of gzipped JS before interaction.
5. **Test.** Add the route to `ROUTES` in `tests/e2e/a11y.spec.ts`, write e2e tests, and add it to `public/llms.txt`.
6. Flip `status` to `live` when it's ready.

## Deploy

The site is hosted on **GitHub Pages**. `lab.suprabhat-dev.com` is a DNS `CNAME` to `suprabhat02.github.io` (managed at Hostinger), and the custom domain is set in **Settings → Pages**.

Pushes to `main` run `.github/workflows/deploy.yml`: `npm ci`, `npm run lint`, `npm run check`, `npm test`, `npm run build`, then `actions/upload-pages-artifact` and `actions/deploy-pages`. No secrets are needed; the deploy authenticates with the workflow's OIDC token. Pull requests run `.github/workflows/ci.yml` (lint, check, unit tests, build, then Playwright + axe as separate Chromium, Firefox and WebKit jobs).

One-time setup: **Settings → Pages → Source: GitHub Actions**, custom domain `lab.suprabhat-dev.com`, then **Enforce HTTPS** once the certificate is issued.

The page CSP and referrer policy are `<meta>` tags that Astro writes at build time. GitHub Pages can't send custom response headers; see [docs/decisions.md](docs/decisions.md#hosting).

## TODO

- [ ] Link to the lab from [suprabhat-dev.com](https://suprabhat-dev.com) (header or footer, and the projects page).

## Docs

- [docs/design-system.md](docs/design-system.md): fonts, colour contracts, type, spacing and new-tool checklist
- [docs/architecture.md](docs/architecture.md): folder map and island strategy
- [docs/engine.md](docs/engine.md): the cascade engine API
- [docs/decisions.md](docs/decisions.md): why things are the way they are
- [docs/contributing.md](docs/contributing.md): how to contribute

## License

[MIT](LICENSE) © Suprabhat Kumar

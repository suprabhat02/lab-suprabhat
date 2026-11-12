# Contributing

Thanks for helping. Every change should keep the lab free, fast, private and usable by everyone.

## Set up

```sh
npm install
npx playwright install chromium
npm run dev
```

## Before you open a pull request

```sh
npm run lint
npm run check
npm test
npm run build      # fails if a size budget is exceeded
npm run test:e2e   # Playwright + axe against the build
```

CI runs the same steps on every pull request, with the end-to-end tests split into one job per browser (Chromium, Firefox, WebKit), two workers and one retry. A failing job uploads its Playwright HTML report as an artifact.

## Ground rules

- **Types:** TypeScript strict (`astro/tsconfigs/strictest`), no `any`, no non-null `!` without a comment saying why.
- **Engine:** code in `src/lib/cascade/` stays pure: no DOM, no Astro, no throwing at the boundary (return a `Result`). Add a test for every behaviour change.
- **Security:** never put user input into `innerHTML`. Use the view layer in `src/lib/view/h.ts` or `textContent`. Validate anything read from the URL.
- **Privacy:** no cookies, no third-party requests, no analytics without updating `/about/` first.
- **CSS:** add rules to the right layer; use `:where()` for defaults; no IDs in selectors; no `!important` except in the reduced-motion block; logical properties.
- **Accessibility:** WCAG 2.2 AA. Visible labels, keyboard support, a text alternative for anything conveyed by colour or motion, and no serious or critical axe violations.
- **Copy:** plain, sentence case, active verbs. Buttons say exactly what happens. Errors say what's wrong and how to fix it, without apologising.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `perf:`, `chore:`. Keep commits small and focused. Don't add trailers.

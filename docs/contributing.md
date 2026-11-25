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

Every commit is authored and committed as Suprabhat Kumar, with
`suprabhatkumar02@gmail.com` or the account's GitHub noreply address. Messages
and pull-request text contain no co-author or session trailers, no
"generated with/by" lines, no tool or vendor names and no links to coding-session
pages.

`npm install` runs the `prepare` script, which sets `core.hooksPath` to
`.githooks`. Its `commit-msg` hook runs `scripts/check-attribution.mjs` on the
message and on `git var GIT_AUTHOR_IDENT` / `GIT_COMMITTER_IDENT`. If it rejects
a commit, fix the message or identity as printed. **Never bypass it with
`--no-verify`.** To enable the hook in an existing clone, run `npm run prepare`.

## Required checks

These CI jobs must pass before a pull request merges:

- `Commit and PR attribution` (job `attribution`): runs the same script on the
  pull request's own commits (`base..head`), its title and its body. Dependabot
  pull requests skip it, which GitHub counts as passing.
- `Lint, type check, unit tests and build` (job `verify`)
- `E2E and accessibility (chromium)`, `(firefox)` and `(webkit)` (job `e2e`)

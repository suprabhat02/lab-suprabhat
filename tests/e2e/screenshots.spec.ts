import { test } from '@playwright/test';

// Not part of the suite: full-page screenshots for visual review, saved to .shots/ (gitignored).
// Run with: SCREENSHOTS=1 npx playwright test screenshots --project chromium
test.skip(!process.env['SCREENSHOTS'], 'Set SCREENSHOTS=1 to capture review screenshots.');
// Lets the review add a style that renders content-visibility sections, which a full-page capture skips.
test.use({ bypassCSP: true });

const routes = [
  ['home', '/'],
  ['specificity', '/specificity/'],
  ['about', '/about/'],
  ['404', '/404.html'],
] as const;

for (const [name, path] of routes) {
  for (const width of [375, 1440]) {
    for (const theme of ['dark', 'light'] as const) {
      test(`${name} ${width}px ${theme}`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.addStyleTag({ content: '.section-deferred { content-visibility: visible; }' });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `.shots/review/${name}-${width}-${theme}.png`, fullPage: true });
      });
    }
  }
}

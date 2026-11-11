import { test } from '@playwright/test';

// Not part of the suite: captures screenshots for manual review. Run with SCREENSHOTS=1.
test.skip(!process.env['SCREENSHOTS'], 'Set SCREENSHOTS=1 to capture review screenshots.');

const widths = [320, 375, 768, 1024, 1440, 1920];

for (const width of widths) {
  for (const theme of ['dark', 'light'] as const) {
    test(`specificity ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/specificity/');
      await page.screenshot({ path: `.shots/specificity-${width}-${theme}.png`, fullPage: width === 1440 });
    });
  }
}

test('home and about', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.screenshot({ path: '.shots/home.png', fullPage: true });
  await page.goto('/about/');
  await page.screenshot({ path: '.shots/about.png', fullPage: true });
});

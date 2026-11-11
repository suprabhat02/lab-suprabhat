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

test('400% zoom equivalent (1280x1024 at 400%)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto('/specificity/');
  await page.screenshot({ path: '.shots/zoom-400.png' });
});

test('panels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/specificity/');
  for (const name of ['Nesting', 'Cascade']) {
    await page.getByRole('tab', { name }).click();
    const panel = page.getByRole('tabpanel', { name });
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `.shots/panel-${name.toLowerCase()}.png` });
  }
});

for (const width of [375, 1440]) {
  test(`explainer ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/specificity/#layers');
    await page.waitForFunction(() => window.scrollY > 0);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `.shots/explainer-${width}.png` });
  });
}

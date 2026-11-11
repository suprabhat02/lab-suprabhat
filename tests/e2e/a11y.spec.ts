import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ROUTES = ['/', '/specificity/', '/about/', '/404.html'];
const THEMES = ['dark', 'light'] as const;

// The specificity page is long; axe needs more than the default 30s when the suite runs in parallel.
test.describe.configure({ timeout: 90_000 });

async function seriousViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
    'best-practice',
  ]);
  if (include) builder.include(include);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5) }));
}

for (const theme of THEMES) {
  for (const route of ROUTES) {
    test(`${route} has no serious axe violations (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test(`every tool panel has no serious axe violations (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.goto('/specificity/');
    for (const name of ['Nesting', 'Cascade']) {
      await page.getByRole('tab', { name }).click();
      // A role-and-name query right before axe crashes Firefox's content process, so match the panel by id.
      const panel = page.locator(`#panel-${name.toLowerCase()}`);
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(await seriousViolations(page, '[data-tabs]')).toEqual([]);
    }
  });
}

test('forced colors mode keeps the page usable', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/specificity/');
  expect(await seriousViolations(page)).toEqual([]);
  await expect(page.locator('.decided-marker')).toContainText('decided here');
});

test('pages have one h1 and a skip link to #main', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main');
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  }
});

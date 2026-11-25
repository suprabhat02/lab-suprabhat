import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ROUTES = [
  '/',
  '/specificity/',
  '/playground/',
  '/accessible-name/',
  '/stylesheet-audit/',
  '/about/',
  '/404.html',
];
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
  await expect(page.locator('.numeral-caption[data-decided]')).toContainText('▲');
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

test('header exposes every tool and marks the current page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const links = [
    ['/specificity/', 'Specificity'],
    ['/playground/', 'Playground'],
    ['/accessible-name/', 'Accessible name'],
    ['/stylesheet-audit/', 'Audit'],
    ['/about/', 'About'],
  ] as const;
  for (const [route, label] of links) {
    await page.goto(route);
    const nav = page.getByRole('navigation', { name: 'Main', exact: true });
    for (const [href, name] of links) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    }
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    const current = nav.getByRole('link', { name: label, exact: true });
    await expect(current).toHaveAttribute('aria-current', 'page');
    expect(await current.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('underline');
  }
});

test('home lists tools in learning order with one full-item link each', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const links = page.locator('.tool-item a');
  await expect(links).toHaveText([
    'CSS Specificity Wars',
    'Selector Playground',
    'Stylesheet Audit',
    'Accessible Name Wars',
  ]);
  await expect(page.locator('.tool-item')).toHaveCount(4);
  const first = page.locator('.tool-item').first();
  await expect(first.locator('a, button, input, select')).toHaveCount(1);
  await expect(first.locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}/);
  await first.scrollIntoViewIfNeeded();
  const box = await first.boundingBox();
  if (!box) throw new Error('Missing tool item.');
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12);
  await expect(page).toHaveURL(/\/specificity\/$/);
});

test('native mobile menu opens and closes by keyboard without scripting', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 640 },
  });
  const page = await context.newPage();
  try {
    await page.goto('http://localhost:4322/playground/');
    const summary = page.locator('.menu-summary');
    const nav = page.locator('.site-nav');
    await expect(nav).toBeHidden();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(nav).toBeVisible();
    for (const link of await nav.locator('a').all()) {
      const box = await link.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(24);
      expect(box?.height).toBeGreaterThanOrEqual(24);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await summary.focus();
    await page.keyboard.press('Space');
    await expect(nav).toBeHidden();
    await expect(summary).toBeFocused();
  } finally {
    await context.close();
  }
});

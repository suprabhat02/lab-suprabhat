import { expect, test } from '@playwright/test';

test('analyzes typed selectors with highlighted parts and per-part contributions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/playground/');
  const input = page.getByRole('textbox', { name: 'CSS selector' });
  await input.fill('#hero > a.active:hover::before');
  const output = page.locator('#playground-anatomy');
  await expect(output.locator('.anatomy-title')).toHaveText(
    'Selector 1: #hero > a.active:hover::before (1,2,2)',
  );
  await expect(output.locator('.parts .part')).toHaveText([
    '#hero',
    '>',
    'a',
    '.active',
    ':hover',
    '::before',
  ]);
  await expect(output.getByRole('row').filter({ hasText: '#hero' })).toHaveText(
    '#heroID100Adds 1 to the first column.',
  );
  await expect(output.getByRole('row').filter({ hasText: '.active' })).toHaveText(
    '.activeClass010Adds 1 to the second column.',
  );
  await expect(output.locator('tfoot .num')).toHaveText(['1', '2', '2']);
  await expect(page.locator('.workbench-input #playground-score dd')).toHaveText('(1,2,2)');
  await expect(page.getByRole('status')).toContainText('specificity (1,2,2)');
  await expect(input).toBeFocused();
  expect(errors).toEqual([]);
});

test('shows functional selector rules, warnings, and each score in a selector list', async ({ page }) => {
  await page.goto('/playground/');
  const input = page.getByRole('textbox', { name: 'CSS selector' });
  const output = page.locator('#playground-anatomy');
  await input.fill(':where(#hero) :is(.link, #nav)');
  await expect(output.locator('tfoot .num')).toHaveText(['1', '0', '0']);
  await expect(output.locator('tbody')).toContainText('always adds zero');
  await expect(output.locator('[data-kind="functional"].part')).toHaveCount(2);

  await input.fill('a::before.active');
  await expect(output.locator('.message-warning')).toContainText('must come last');
  await expect(input).not.toHaveAttribute('aria-invalid');

  await input.fill('.item, #hero');
  await expect(output.locator('tfoot .num')).toHaveText(['0', '1', '0', '1', '0', '0']);
  await expect(page.locator('#playground-score dd')).toHaveText(['(0,1,0)', '(1,0,0)']);
  await expect(output.locator('.message-warning')).toHaveCount(0);
});

test('clears stale results on invalid or empty input and recovers', async ({ page }) => {
  await page.goto('/playground/');
  const input = page.getByRole('textbox', { name: 'CSS selector' });
  const output = page.locator('#playground-anatomy');
  await input.fill('.menu a)');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(output.locator('.message-error')).toContainText('unexpected ) at character 8');
  await expect(output.locator('table')).toHaveCount(0);
  await expect(page.locator('#playground-score dd')).toHaveCount(0);
  await input.fill('   ');
  await expect(output.locator('.message-error')).toContainText('Type a selector to see its specificity.');
  await input.fill('button');
  await expect(input).not.toHaveAttribute('aria-invalid');
  await expect(output.locator('.message-error')).toHaveCount(0);
  await expect(output.locator('tfoot .num')).toHaveText(['0', '0', '1']);
});

test('is discoverable and stays within a phone viewport', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Selector Playground', exact: true }).click();
  await expect(page).toHaveURL(/\/playground\/$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://lab.suprabhat-dev.com/playground/',
  );
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
  const sitemap = await request.get('/sitemap-0.xml');
  expect(await sitemap.text()).toContain('https://lab.suprabhat-dev.com/playground/');
  const image = await request.get('/og/playground.png');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('pre-renders the complete example and dark-first theme button', async ({ page }) => {
    await page.goto('/playground/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Selector Playground');
    await expect(page.getByRole('textbox', { name: 'CSS selector' })).toHaveValue(
      '#nav .link:hover > a::before',
    );
    await expect(page.locator('#playground-anatomy tfoot .num')).toHaveText(['1', '2', '2']);
    await expect(page.locator('#playground-score dd')).toHaveText('(1,2,2)');
    await expect(page.locator('#playground-anatomy tbody tr')).toHaveCount(7);
    expect(await page.locator('noscript').evaluate((node) => node.innerHTML)).toContain('JavaScript is off');
    const toggle = page.locator('[data-theme-toggle]');
    await expect(toggle.locator('[data-theme-label]')).toHaveText('Dark theme');
    await expect(toggle).toHaveAttribute('data-state', 'dark');
    await expect(toggle.locator('svg.lucide-moon')).toHaveCount(1);
  });
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const route = '/stylesheet-audit/';
const css = '.a { color: red; }\n#hero { color: blue !important; }\na { color: green; }';

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('pre-renders metrics, graph, full table, findings and layers', async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('[data-audit-table] tbody tr')).toHaveCount(7);
    await expect(page.locator('[data-audit-graph]')).toHaveAttribute('role', 'img');
    await expect(page.locator('[data-audit-graph]')).toHaveAttribute(
      'aria-label',
      /7 selectors.*Display peak/,
    );
    await expect(page.locator('[data-audit-summary]')).toContainText('Maximum specificity');
    await expect(page.locator('[data-audit-findings="important"]')).toContainText('Line 12');
    await expect(page.locator('[data-audit-layers]')).toContainText('components');
    await expect(page.locator('[data-audit-empty]')).toContainText('deep selectors');
    await expect(page.locator('[data-audit-findings="deep-selector"]')).toHaveCount(1);
  });
});

test('keeps input beside the first results and sticky while reviewing findings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(route);
  await page.evaluate(() => document.fonts.ready);
  const pane = page.locator('.workbench-input');
  const first = page.locator('[data-audit-summary]');
  const inputBox = await pane.boundingBox();
  const resultBox = await first.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(resultBox).not.toBeNull();
  if (!inputBox || !resultBox) throw new Error('Missing workbench boxes.');
  expect(inputBox.x + inputBox.width).toBeLessThan(resultBox.x);
  for (const box of [inputBox, resultBox]) {
    expect(box.y).toBeGreaterThanOrEqual(64);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
  }
  await page.locator('#audit-findings').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-audit-css]')).toBeInViewport({ ratio: 1 });
  const sticky = await pane.boundingBox();
  expect(sticky?.y).toBeGreaterThanOrEqual(64);
  await page.locator('[data-audit-css]').fill('a{}');
  await expect(page.locator('[data-audit-empty]')).toContainText('specificity spikes');
  await expect(page.locator('[data-audit-findings="id-selector"]')).toBeHidden();
  await page.locator('[data-audit-css]').fill('#hero{} a{}');
  await expect(page.locator('[data-audit-findings="id-selector"]')).toBeVisible();
});

test('stacks input before results without horizontal overflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(route);
  await page.evaluate(() => document.fonts.ready);
  const input = await page.locator('.workbench-input').boundingBox();
  const output = await page.locator('.workbench-output').boundingBox();
  if (!input || !output) throw new Error('Missing workbench boxes.');
  expect(input.y + input.height).toBeLessThan(output.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('typing updates metrics, graph and table without putting CSS in the URL', async ({ page }) => {
  await page.goto(route);
  await page.getByLabel('Your CSS', { exact: true }).fill(css);
  await expect(page.locator('[data-audit-live]')).toHaveText('3 selectors, 1 important declarations.');
  await expect(page.locator('[data-audit-table] tbody tr')).toHaveCount(3);
  await expect(page.locator('[data-audit-point]')).toHaveCount(3);
  await expect(page.locator('[data-audit-summary] dd').first()).toHaveText('3');
  await expect(page.locator('[data-audit-findings="id-selector"]')).toContainText('Line 2');
  expect(await page.evaluate(() => location.search)).toBe('');
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== 'theme'))).toEqual([]);
});

test('200% text zoom preserves stacked panes, controls and internal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto(route);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.evaluate(() => document.fonts.ready);
  const input = await page.locator('.workbench-input').boundingBox();
  const output = await page.locator('.workbench-output').boundingBox();
  if (!input || !output) throw new Error('Missing zoomed workbench boxes.');
  expect(input.y + input.height).toBeLessThan(output.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
  const metrics = await page.locator('.audit-metrics > div').evaluateAll((els) =>
    els.map((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, right: b.right, bottom: b.bottom };
    }),
  );
  expect(metrics.length).toBeGreaterThan(1);
  let previousBottom = 0;
  for (const metric of metrics) {
    expect(metric.y).toBeGreaterThanOrEqual(previousBottom);
    previousBottom = metric.bottom;
  }
  for (const control of await page.locator('.workbench-input :is(textarea, button)').all()) {
    const box = await control.boundingBox();
    if (!box) throw new Error('Missing zoomed control.');
    expect(box.x).toBeGreaterThanOrEqual(input.x);
    expect(box.x + box.width).toBeLessThanOrEqual(input.x + input.width);
    expect(box.y + box.height).toBeLessThanOrEqual(input.y + input.height);
  }
  await page.getByLabel('Your CSS', { exact: true }).fill('a{}');
  await expect(page.locator('[data-audit-table] tbody tr')).toHaveCount(1);
});

test('sorts by real specificity with a keyboard header and linked focus/hover', async ({ page }) => {
  await page.goto(route);
  await page.getByLabel('Your CSS', { exact: true }).fill(css);
  await expect(page.locator('[data-audit-live]')).toContainText('3 selectors');
  const sort = page.getByRole('button', { name: 'Sort by specificity' });
  await sort.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('th[aria-sort]')).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('[data-audit-table] tbody tr td:nth-child(2)')).toHaveText(['a', '.a', '#hero']);
  await expect(sort).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('th[aria-sort]')).toHaveAttribute('aria-sort', 'descending');
  await expect(page.locator('[data-audit-table] tbody tr td:nth-child(2)')).toHaveText(['#hero', '.a', 'a']);
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-audit-row="1"]')).toBeFocused();
  await expect(page.locator('[data-audit-point="1"]')).toHaveAttribute('data-active', '');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-audit-row="0"]')).toBeFocused();
  await page.locator('[data-audit-point="2"]').hover();
  await expect(page.locator('[data-audit-row="2"]')).toHaveAttribute('data-active', '');
  await page.mouse.move(0, 0);
  await page.locator('[data-audit-point="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-audit-point="1"]')).toBeFocused();
  await expect(page.locator('[data-audit-row="1"]')).toHaveAttribute('data-active', '');
});

test('explicit Copy link restores CSS and retains the clipboard fallback', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await page.goto(route);
  await page.getByLabel('Your CSS', { exact: true }).fill(css);
  await expect(page.locator('[data-audit-live]')).toContainText('3 selectors');
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  const fallback = page.getByLabel('Link to this audit');
  await expect(fallback).toBeFocused();
  const shared = await fallback.inputValue();
  await expect(page).toHaveURL(shared);
  await page.getByLabel('Your CSS', { exact: true }).fill('p{}');
  await expect(page.locator('[data-audit-live]')).toContainText('1 selectors');
  await expect(page).toHaveURL(shared);
  await page.goto(shared);
  await expect(page.getByLabel('Your CSS', { exact: true })).toHaveValue(css);
  await expect(page.locator('[data-audit-table] tbody tr')).toHaveCount(3);
});

test('enforces input, share and selector caps and reports malformed input', async ({ page }) => {
  await page.goto(`${route}?s=bad!`);
  await expect(page.locator('[data-audit-notice]')).toContainText('could not be read');
  const input = page.locator('[data-audit-css]');
  await input.fill('/*' + 'x'.repeat(8192) + '*/a{}');
  await expect(page.locator('[data-audit-copy-status]')).toContainText('above 8 KB');
  await expect(page.locator('[data-audit-copy]')).toHaveAttribute('aria-disabled', 'true');
  await input.fill('a'.repeat(102401));
  await expect(page.locator('[data-audit-output]')).toContainText('100 KB');
  await input.fill('a{');
  await expect(page.locator('[data-audit-output]')).toContainText('Unclosed CSS');
  await input.fill('a{}'.repeat(5001));
  // Rendering the maximum-size table in WebKit can exceed 5s under parallel browser load.
  await expect(page.locator('[data-audit-truncated]')).toContainText('first 5,000', { timeout: 15_000 });
  await expect(page.locator('[data-audit-point]')).toHaveCount(5000);
  await expect(page.locator('[data-audit-table] tbody tr')).toHaveCount(5000);
  await input.fill('b{}');
  await expect(page.locator('[data-audit-table] tbody tr')).toHaveCount(1);
  await expect(input).not.toHaveAttribute('aria-invalid');
});

test('never applies CSS or fetches import and url resources', async ({ page }) => {
  await page.goto(route);
  const input = page.getByLabel('Your CSS', { exact: true });
  await input.fill('a{}');
  await expect(page.locator('[data-audit-live]')).toContainText('1 selectors');
  const requests: string[] = [];
  const dialogs: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(new URL(page.url()).origin + '/')) requests.push(request.url());
  });
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await input.fill(
    '@import url(https://example.test/x.css); a{background:url(https://example.test/y.png)} body{display:none} [title="<img src=x onerror=alert(1)>"]{}',
  );
  await expect(page.locator('[data-audit-live]')).toContainText('3 selectors');
  await expect(input).toBeVisible();
  await expect(page.locator('[data-audit-table]')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('[data-audit-output] img')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(requests).toEqual([]);
  expect(dialogs).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`passes axe in ${theme} mode after editing`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    await page.goto(route);
    await page.locator('[data-audit-css]').fill(css);
    await expect(page.locator('[data-audit-live]')).toContainText('3 selectors');
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
}

test('is discoverable, has an OG image, and fits at 320px with reduced motion', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('link', { name: 'Stylesheet Audit', exact: true }).click();
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const og = await request.get('/og/stylesheet-audit.png');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toContain('image/png');
});

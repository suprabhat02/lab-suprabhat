import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const route = '/accessible-name/';

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('pre-renders the default verdict, full ladder, description, and fix', async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('[data-name-verdict]')).toHaveText('The name is "Search"');
    await expect(page.locator('[data-name-description]')).toHaveText('Search tools');
    const ladder = page.locator('[data-name-output] > ol');
    await expect(ladder.locator('[data-step="2D"] .ladder-outcome')).toHaveText('Used');
    await expect(ladder.locator('[data-step="2E"]').first()).toHaveAttribute('data-outcome', 'not-reached');
    await expect(page.locator('[data-check="label-in-name"]')).toContainText('Search the lab');
  });
});

test('typing updates the verdict, live region, and element selection', async ({ page }) => {
  await page.goto(route);
  const input = page.getByLabel('Your HTML', { exact: true });
  await input.fill('<button>Save</button><a href="/">Home</a>');
  await expect(page.locator('[data-name-verdict]')).toHaveText('The name is "Save"');
  await expect(page.locator('[data-name-live]')).toHaveText('The name is "Save".');
  await expect(input).toBeFocused();
  const select = page.getByLabel('Element to check');
  await expect(select.locator('option')).toHaveText(['button: button', 'link: a']);
  await input.press('Tab');
  await expect(select).toBeFocused();
  await select.selectOption('1');
  await expect(page.locator('[data-name-verdict]')).toHaveText('The name is "Home"');
  await expect(page.locator('[data-name-live]')).toHaveText('The name is "Home".');
  await expect(select).toBeFocused();
});

test('keeps the chosen index across edits and resets when that index disappears', async ({ page }) => {
  await page.goto(route);
  const input = page.getByLabel('Your HTML', { exact: true });
  const select = page.getByLabel('Element to check');
  const verdict = page.locator('[data-name-verdict]');
  await input.fill('<button>Save</button><button>Delete</button><a href="/">Home</a>');
  await select.selectOption('2');
  await expect(verdict).toHaveText('The name is "Home"');

  await input.fill('<button>Save changes</button><button>Delete</button><a href="/">Homepage</a>');
  await expect(verdict).toHaveText('The name is "Homepage"');
  await expect(select).toHaveValue('2');
  await expect(input).toBeFocused();
  await page.reload();
  await expect(select).toHaveValue('2');
  await expect(verdict).toHaveText('The name is "Homepage"');

  await input.fill('<button>Save changes</button><button>Delete</button>');
  await expect(verdict).toHaveText('The name is "Save changes"');
  await expect(select).toHaveValue('0');
  await expect(input).not.toHaveAttribute('aria-invalid');
  await page.reload();
  await expect(select).toHaveValue('0');
  await expect(verdict).toHaveText('The name is "Save changes"');
});

test('reports an icon-only button without a name and CSS limits', async ({ page }) => {
  await page.goto(route);
  await page.getByLabel('Your HTML', { exact: true }).fill('<button class="icon"><img alt=""></button>');
  await expect(page.locator('[data-name-verdict]')).toHaveText('This element has no accessible name');
  await expect(page.locator('[data-check="empty-name"]')).toContainText('WCAG 4.1.2');
  await expect(page.locator('[data-check="empty-image-label"]')).toBeVisible();
  await expect(page.locator('[data-css-limit]')).toContainText('CSS-generated content');
});

test('restores HTML and the selected element from a shared link', async ({ page }) => {
  await page.goto(route);
  const html = '<button>Save</button><button aria-label="Delete">X</button>';
  await page.getByLabel('Your HTML', { exact: true }).fill(html);
  await page.getByLabel('Element to check').selectOption('1');
  await expect(page.locator('[data-name-verdict]')).toHaveText('The name is "Delete"');
  await expect(page).toHaveURL(/\?s=[A-Za-z0-9_-]+$/);
  const url = page.url();
  await page.goto(url);
  await expect(page.getByLabel('Your HTML', { exact: true })).toHaveValue(html);
  await expect(page.getByLabel('Element to check')).toHaveValue('1');
  await expect(page.locator('[data-name-verdict]')).toHaveText('The name is "Delete"');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://lab.suprabhat-dev.com/accessible-name/',
  );
});

test('copy falls back to a focused, selected link when clipboard access is unavailable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await page.goto(route);
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  const field = page.getByLabel('Link to this calculation');
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(/\/accessible-name\/\?s=/);
  expect(
    await field.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd]),
  ).toEqual([0, (await field.inputValue()).length]);
});

test('rejects oversized HTML and malformed links without stale results', async ({ page }) => {
  await page.goto(`${route}?s=invalid!`);
  await expect(page.locator('[data-name-notice]')).toContainText('could not be read');
  await expect(page.locator('[data-name-verdict]')).toHaveText('The name is "Search"');
  const input = page.getByLabel('Your HTML', { exact: true });
  await input.fill('x'.repeat(4097));
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-name-output]')).toContainText('limited to 4 KB');
  await expect(page.locator('[data-name-verdict]')).toHaveCount(0);
  await input.fill('<button>Try again</button>');
  await expect(input).not.toHaveAttribute('aria-invalid');
  await expect(page.locator('[data-name-verdict]')).toHaveText('The name is "Try again"');
});

test('pasted markup never loads resources, executes scripts, or opens dialogs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(route);
  const input = page.getByLabel('Your HTML', { exact: true });
  await input.fill('<button>Ready</button>');
  await expect(page.locator('[data-name-verdict]')).toHaveText('The name is "Ready"');
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  const dialogs: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.route('https://example.test/**', (request) => request.abort());
  const html =
    '<button id="danger">Save<img src="https://example.test/x" onerror="alert(1)"></button><script>alert(2)</script><iframe src="https://example.test/frame"></iframe>';
  await input.fill(html);
  await expect(page.locator('[data-name-verdict]')).toHaveText('The name is "Save"');
  await page.getByText('Show selected element as source', { exact: true }).click();
  await expect(page.locator('[data-name-output] pre').first()).toContainText('onerror="alert(1)"');
  await page.waitForTimeout(300);
  expect(requests).toEqual([]);
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
  await expect(page.locator('#danger, img[src*="example.test"], iframe[src*="example.test"]')).toHaveCount(0);
});

for (const theme of ['dark', 'light']) {
  test(`updated results pass axe in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    await page.goto(route);
    // Avoid Firefox's accessibility-query/axe crash, as in the existing panel scans.
    await page.locator('[data-name-html]').fill('<button aria-label="Search">Find</button>');
    await expect(page.locator('[data-name-verdict]')).toHaveText('The name is "Search"');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('fits a 320px viewport and has a working listing and OG image', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Accessible Name Wars', exact: true }).click();
  await expect(page).toHaveURL(/\/accessible-name\/$/);
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const image = await request.get('/og/accessible-name.png');
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
});

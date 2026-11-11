import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'On this page' });

async function headerBottom(page: Page) {
  return page.locator('.site-header').evaluate((el) => el.getBoundingClientRect().bottom);
}

test.describe('explainer navigation, wide screens', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('shows a sticky list beside the content and marks the current section', async ({ page }) => {
    await page.goto('/specificity/');
    const links = nav(page).getByRole('link');
    await expect(links).toHaveCount(10);
    await expect(nav(page).locator('ol')).toHaveCount(1);
    await expect(links.first()).toBeVisible();

    const navBox = await nav(page).boundingBox();
    const bodyBox = await page.locator('.explainer-body').boundingBox();
    expect(navBox && bodyBox && navBox.x > bodyBox.x).toBe(true);

    await page.locator('#layers').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.getElementById('layers')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const layersLink = nav(page).getByRole('link', { name: 'Does @layer beat specificity?' });
    await expect(layersLink).toHaveAttribute('aria-current', 'location', { timeout: 15_000 });
    await expect(nav(page).locator('[aria-current]')).toHaveCount(1);
    await expect(layersLink).toBeInViewport();
  });

  test('links scroll the heading below the sticky header', async ({ page }) => {
    await page.goto('/specificity/');
    await page.locator('[data-explainer]').scrollIntoViewIfNeeded();
    await nav(page).getByRole('link', { name: 'What is @scope proximity?' }).click();
    await expect(page).toHaveURL(/#scope$/);
    await expect(page.locator('#scope')).toBeInViewport();
    const top = await page.locator('#scope').evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(await headerBottom(page));
    await expect(nav(page).getByRole('link', { name: 'What is @scope proximity?' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  test('a deep link lands on its heading', async ({ page }) => {
    await page.goto('/specificity/#layers');
    await page.waitForFunction(() => window.scrollY > 0);
    await expect(async () => {
      const top = await page.locator('#layers').evaluate((el) => el.getBoundingClientRect().top);
      expect(top).toBeGreaterThanOrEqual(await headerBottom(page));
      expect(top).toBeLessThan(300);
    }).toPass();
  });
});

test.describe('explainer navigation, narrow screens', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('collapses into a details element at the top of the explainer', async ({ page }) => {
    await page.goto('/specificity/');
    const summary = nav(page).locator('summary');
    await expect(summary).toHaveText('On this page');
    await summary.scrollIntoViewIfNeeded();
    await expect(summary).toBeVisible();
    const link = nav(page).getByRole('link', { name: 'The cascade order' });
    await expect(link).toBeHidden();
    await summary.click();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/#cascade-order$/);
    await expect(page.locator('#cascade-order')).toBeInViewport();
  });
});

test.describe('explainer navigation without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });

  test('is a list of plain anchor links', async ({ page }) => {
    await page.goto('/specificity/');
    const link = nav(page).getByRole('link', { name: 'Where do inline styles fit?' });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/#inline$/);
    const top = await page.locator('#inline').evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(await headerBottom(page));
  });
});

test.describe('live examples', () => {
  const expected = [
    ['A nested rule takes its strongest parent', 'crimson', 'rgb(220, 20, 60)'],
    ['Unlayered beats layered', 'crimson', 'rgb(220, 20, 60)'],
    ['!important reverses the layer order', 'red', 'rgb(255, 0, 0)'],
    ['Specificity is checked before proximity', 'purple', 'rgb(128, 0, 128)'],
    ['A normal inline style beats any selector', 'crimson', 'rgb(220, 20, 60)'],
  ] as const;

  test('render the real cascade in the browser and name the winner', async ({ page }) => {
    await page.goto('/specificity/');
    for (const [caption, name, rgb] of expected) {
      const figure = page.locator('figure.example-live', { hasText: caption });
      await expect(figure.getByRole('link', { name: /^Try this in the/ })).toHaveCount(1);
      const result = await figure.locator('[data-demo]').evaluate((host) => {
        const p = host.shadowRoot?.querySelector('p');
        if (!p) return null;
        const style = getComputedStyle(p);
        return {
          color: style.color,
          won: style.getPropertyValue('--won').trim().replace(/'/g, '"'),
          after: getComputedStyle(p, '::after').content,
        };
      });
      expect(result, caption).toEqual({ color: rgb, won: `"${name}"`, after: `" ${name}"` });
    }
  });

  test('sit side by side on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/specificity/');
    const figure = page.locator('figure.example-live').first();
    await figure.scrollIntoViewIfNeeded();
    const code = await figure.locator('.example-code').boundingBox();
    const result = await figure.locator('.example-result').boundingBox();
    expect(code && result && result.x > code.x + code.width - 1 && Math.abs(result.y - code.y) < 2).toBe(
      true,
    );
  });

  test('stack on narrow screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/specificity/');
    const figure = page.locator('figure.example-live').first();
    await figure.scrollIntoViewIfNeeded();
    const code = await figure.locator('.example-code').boundingBox();
    const result = await figure.locator('.example-result').boundingBox();
    expect(code && result && result.y >= code.y + code.height).toBe(true);
  });
});

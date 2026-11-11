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
    await page.evaluate(() => document.getElementById('layers')?.scrollIntoView({ block: 'start' }));
    const layersLink = nav(page).getByRole('link', { name: 'Does @layer beat specificity?' });
    await expect(layersLink).toHaveAttribute('aria-current', 'location');
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

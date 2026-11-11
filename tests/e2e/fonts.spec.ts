import { expect, test } from '@playwright/test';

test.describe('font loading', () => {
  test('the fallback stack matches Geist Mono widths closely', async ({ page }) => {
    await page.goto('/specificity/');
    await page.evaluate(() => document.fonts.ready);
    const widths = await page.evaluate(() => {
      const sample = 'Which CSS selector wins? #nav a .menu .link:hover 0123456789';
      const measure = (family: string) => {
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;white-space:nowrap;font-size:20px;font-family:${family}`;
        span.textContent = sample;
        document.body.append(span);
        const width = span.getBoundingClientRect().width;
        span.remove();
        return width;
      };
      const stack = getComputedStyle(document.documentElement).getPropertyValue('--font');
      return {
        geist: measure(stack),
        fallback: measure(stack.replace(/'Geist Mono Variable',\s*'Geist Mono',/, '')),
      };
    });
    expect(Math.abs(widths.fallback - widths.geist) / widths.geist).toBeLessThan(0.02);
  });

  test('swapping in the web font causes no layout shift', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'The Layout Instability API is Chromium-only.');
    await page.route('**/*.woff2', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    for (const path of ['/', '/specificity/', '/about/']) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(cls, path).toBeLessThan(0.01);
    }
  });
});

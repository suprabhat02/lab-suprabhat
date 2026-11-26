import { expect, test } from '@playwright/test';
import { createServer, get } from 'node:http';
import { once } from 'node:events';

test.describe('font loading', () => {
  for (const path of [
    '/',
    '/specificity/',
    '/playground/',
    '/accessible-name/',
    '/stylesheet-audit/',
    '/about/',
    '/tools/',
    '/methodology/',
    '/404.html',
  ]) {
    test(`font roles and Latin requests match the contract on ${path}`, async ({ page, baseURL }) => {
      if (!baseURL) throw new Error('Font tests require the preview baseURL.');
      const requests: string[] = [];
      // Count origin requests: WebKit also reports memory-cache reads as network events.
      const server = createServer((request, response) => {
        if (!request.url) {
          response.destroy(new Error('Missing request URL.'));
          return;
        }
        const url = new URL(request.url, baseURL);
        if (url.pathname.endsWith('.woff2')) requests.push(url.href);
        get(url, (upstream) => {
          response.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(response);
        }).on('error', (error) => response.destroy(error));
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing font-test server port.');
      try {
        await page.goto(`http://127.0.0.1:${address.port}${path}`);
        await page.evaluate(() => document.fonts.ready);
        const sans = await page
          .locator('body, h1, h2, .site-nav a, button, p:not(.parts)')
          .evaluateAll((elements) =>
            elements.map((el) => ({ tag: el.tagName, family: getComputedStyle(el).fontFamily })),
          );
        for (const item of sans) expect(item.family, item.tag).toMatch(/^["']?Inter Variable["']?,/);
        const settings = await page.locator('body').evaluate((body) => {
          const style = getComputedStyle(body);
          return { features: style.fontFeatureSettings, variations: style.fontVariationSettings };
        });
        expect(settings.features).toContain('"cv11"');
        expect(settings.features).toContain('"ss01"');
        expect(settings.variations).toBe('"opsz" 32');
        const mono = await page
          .locator(
            'code, textarea, .input-selector, .parts, .numeral, .selector-scores dd, .audit-metrics dd, [data-fix-target]',
          )
          .evaluateAll((elements) =>
            elements.map((el) => ({ tag: el.tagName, family: getComputedStyle(el).fontFamily })),
          );
        for (const item of mono) expect(item.family, item.tag).toMatch(/^["']?Geist Mono Variable["']?,/);
        const preloads = page.locator('link[rel="preload"][as="font"]');
        const expected = await preloads.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
        expect(expected).toHaveLength(2);
        expect(expected[0]).toMatch(/inter-latin-opsz-normal.*\.woff2$/);
        expect(expected[1]).toBe('/fonts/geist-mono-latin-wght-normal.woff2');
        for (const preload of await preloads.all()) await expect(preload).toHaveAttribute('crossorigin');
        // Each preload must be byte-for-byte the URL its @font-face requests, or the file downloads twice.
        const faces = await page.evaluate(() =>
          [...document.styleSheets].flatMap((sheet) =>
            [...sheet.cssRules]
              .filter((rule): rule is CSSFontFaceRule => rule instanceof CSSFontFaceRule)
              .map((rule) => ({
                family: rule.style.getPropertyValue('font-family').replace(/["']/g, ''),
                url: /url\(["']?([^"')]+)/.exec(rule.style.getPropertyValue('src'))?.[1] ?? '',
              })),
          ),
        );
        expect(faces.filter((face) => expected.includes(face.url))).toEqual([
          { family: 'Inter Variable', url: expected[0] },
          { family: 'Geist Mono Variable', url: expected[1] },
        ]);
        expect(requests.map((url) => new URL(url).pathname).sort()).toEqual([...expected].sort());
        expect(new Set(requests).size).toBe(requests.length);
      } finally {
        await page.goto('about:blank');
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });
  }

  test('Arabic and RTL roots use the system font stack', async ({ page }) => {
    await page.goto('/');
    for (const attributes of [{ lang: 'ar', dir: 'ltr' }, { lang: 'en', dir: 'rtl' }]) {
      const family = await page.evaluate(({ lang, dir }) => {
        document.documentElement.lang = lang;
        document.documentElement.dir = dir;
        return getComputedStyle(document.body).fontFamily;
      }, attributes);
      expect(family).not.toContain('Inter Variable');
      expect(family).toContain('Noto Sans Arabic');
    }
  });

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
      const stack = getComputedStyle(document.documentElement).getPropertyValue('--font-mono');
      return {
        geist: measure(stack),
        fallback: measure(stack.replace(/'Geist Mono Variable',\s*'Geist Mono',/, '')),
      };
    });
    expect(Math.abs(widths.fallback - widths.geist) / widths.geist).toBeLessThan(0.02);
  });

  test('the sans fallback stack matches Inter widths closely', async ({ page }) => {
    await page.goto('/about/');
    await page.evaluate(() => document.fonts.ready);
    const widths = await page.evaluate(() => {
      const sample = 'The web is the one platform anyone can build on, with nothing more than a text editor.';
      const measure = (family: string) => {
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;white-space:nowrap;font-size:20px;font-family:${family}`;
        span.textContent = sample;
        document.body.append(span);
        const width = span.getBoundingClientRect().width;
        span.remove();
        return width;
      };
      const stack = getComputedStyle(document.documentElement).getPropertyValue('--font-sans');
      return { inter: measure(stack), fallback: measure(stack.replace(/'Inter Variable',/, '')) };
    });
    expect(Math.abs(widths.fallback - widths.inter) / widths.inter).toBeLessThan(0.02);
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

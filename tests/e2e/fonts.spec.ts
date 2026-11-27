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
        expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true);
        const sans = await page
          .locator('body, h1, h2, .site-nav a, button, p:not(.parts, .tool-category, .toc-title)')
          .evaluateAll((elements) =>
            elements.map((el) => ({ tag: el.tagName, family: getComputedStyle(el).fontFamily })),
          );
        for (const item of sans) expect(item.family, item.tag).toMatch(/^["']?Inter Variable["']?,/);
        // Copied from tailwindcss.com: Inter's cv features, and optical size from font-optical-sizing alone.
        const settings = await page.locator('html').evaluate((html) => {
          const style = getComputedStyle(html);
          return { features: style.fontFeatureSettings, variations: style.fontVariationSettings };
        });
        expect(settings.features).toBe('"cv02", "cv03", "cv04", "cv11"');
        expect(settings.variations).toBe('normal');
        const mono = await page
          .locator(
            'code, textarea, .brand, .input-selector, .parts, .numeral, .selector-scores dd, .audit-metrics dd, [data-fix-target]',
          )
          .evaluateAll((elements) =>
            elements.map((el) => {
              const style = getComputedStyle(el);
              return { tag: el.tagName, family: style.fontFamily, features: style.fontFeatureSettings };
            }),
          );
        expect(mono.length).toBeGreaterThan(0);
        for (const item of mono) {
          expect(item.family, item.tag).toMatch(/^["']?IBM Plex Mono["']?,/);
          expect(item.features, item.tag).toBe('"ss02", "zero"');
        }
        const preloads = page.locator('link[rel="preload"][as="font"]');
        const expected = await preloads.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
        expect(expected).toEqual(['/fonts/inter-latin.woff2']);
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
        ]);
        // English pages need only the Latin files: Inter Latin plus whichever Plex Latin1 weights are used.
        const paths = requests.map((url) => new URL(url).pathname);
        expect(paths).toContain('/fonts/inter-latin.woff2');
        for (const file of paths) {
          expect(file).toMatch(
            /^\/fonts\/(inter-latin|IBMPlexMono-(Regular|Medium|SemiBold)-Latin1)\.woff2$/,
          );
        }
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

  test('code uses IBM Plex Mono with ss02 and the slashed zero', async ({ page }) => {
    await page.goto('/specificity/');
    const code = await page
      .locator('code')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return { family: style.fontFamily, features: style.fontFeatureSettings };
      });
    expect(code.family).toMatch(/^["']?IBM Plex Mono["']?,/);
    expect(code.features).toBe('"ss02", "zero"');
  });

  test('only running-text links are underlined, at rest and on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const decoration = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(await decoration('main p a')).toBe('underline');
    expect(await decoration('.nav-link')).toBe('none');
    expect(await decoration('.site-footer a')).toBe('none');
    expect(await decoration('.tool-title a')).toBe('none');
    for (const selector of ['.nav-link', '.site-footer a']) {
      await page.locator(selector).first().hover();
      expect(await decoration(selector), `${selector}:hover`).toBe('none');
    }
    await page.locator('main p a').first().hover();
    expect(await decoration('main p a')).toBe('underline');
  });

  test('Arabic and RTL roots use the system font stack', async ({ page }) => {
    await page.goto('/');
    for (const attributes of [
      { lang: 'ar', dir: 'ltr' },
      { lang: 'en', dir: 'rtl' },
    ]) {
      const family = await page.evaluate(({ lang, dir }) => {
        document.documentElement.lang = lang;
        document.documentElement.dir = dir;
        return getComputedStyle(document.body).fontFamily;
      }, attributes);
      expect(family).not.toContain('Inter Variable');
      expect(family).toContain('Noto Sans Arabic');
    }
  });

  test('the fallback stack matches IBM Plex Mono widths closely', async ({ page }) => {
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
        plex: measure(stack),
        fallback: measure(stack.replace(/'IBM Plex Mono',/, '')),
      };
    });
    expect(Math.abs(widths.fallback - widths.plex) / widths.plex).toBeLessThan(0.02);
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

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
  '/tools/',
  '/methodology/',
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
    const levels = await page
      .locator('main :is(h1,h2,h3,h4,h5,h6)')
      .evaluateAll((headings) =>
        headings.filter((el) => el.getClientRects().length > 0).map((el) => Number(el.tagName.slice(1))),
      );
    expect(levels[0], route).toBe(1);
    let previousLevel = 0;
    for (const [i, level] of levels.entries()) {
      expect(level, `${route}: heading ${i + 1}`).toBeLessThanOrEqual(previousLevel + 1);
      previousLevel = level;
    }
    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main');
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  }
});

test('all routes reflow at 320px with user text spacing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const route of ROUTES) {
    await page.goto(route);
    await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>('body, body *')) {
        el.style.setProperty('line-height', '1.5', 'important');
        el.style.setProperty('letter-spacing', '.12em', 'important');
        el.style.setProperty('word-spacing', '.16em', 'important');
        if (el.tagName === 'P') el.style.setProperty('margin-block-end', '2em', 'important');
      }
      for (const section of document.querySelectorAll<HTMLElement>('.section-deferred')) {
        section.style.contentVisibility = 'visible';
      }
    });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(320);
    for (const pane of await page.locator('.workbench-input, .workbench-output, .tool-item').all()) {
      const box = await pane.boundingBox();
      if (!box) throw new Error(`Missing layout box on ${route}`);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
  }
});

test('long code remains keyboard-scrollable inside its named region', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/accessible-name/');
  await page
    .getByLabel('Your HTML', { exact: true })
    .fill(`<button aria-label="${'Long label '.repeat(20)}">Go</button>`);
  const summary = page.getByText('Show selected element as source', { exact: true });
  await summary.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const code = page.getByRole('region', { name: 'Selected element HTML', exact: true });
  await expect(code).toBeFocused();
  expect(await code.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => code.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
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
    // The current page is marked by weight and an accent bar, not colour alone; nav links have no underline.
    expect(await current.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600');
    expect(await current.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none');
    expect(await current.evaluate((el) => getComputedStyle(el).borderBlockEndWidth)).toBe('2px');
  }
});

test('selection and focus-ring tokens resolve to the accent palette in both themes', async ({ page }) => {
  const expected = {
    light: { selection: 'rgb(255, 209, 198)', focus: 'rgb(180, 35, 0)' },
    dark: { selection: 'rgb(100, 33, 20)', focus: 'rgb(255, 77, 42)' },
  };
  for (const theme of THEMES) {
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.goto('/about/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const resolved = await page.evaluate(() => {
      const probe = document.createElement('div');
      document.body.append(probe);
      const read = (token: string) => {
        probe.style.backgroundColor = `var(${token})`;
        return getComputedStyle(probe).backgroundColor;
      };
      const values = { selection: read('--selection-bg'), focus: read('--focus-ring') };
      probe.remove();
      return values;
    });
    expect(resolved).toEqual(expected[theme]);
    const link = page.locator('main p a').first();
    // A key press first, so the scripted focus counts as keyboard focus in every engine.
    await page.keyboard.press('Tab');
    await link.focus();
    expect(await link.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    const outline = await link.evaluate((el) => {
      const style = getComputedStyle(el);
      return { color: style.outlineColor, width: style.outlineWidth, offset: style.outlineOffset };
    });
    expect(outline).toEqual({ color: expected[theme].focus, width: '2px', offset: '2px' });
  }
});

test('forced colors hides the decorative hatch but keeps the hero stage bordered', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  expect(await seriousViolations(page)).toEqual([]);
  await expect(page.locator('.page-rail').first()).toHaveCSS('visibility', 'hidden');
  for (const selector of ['.hero-stage', '.hero-panel', '.hero-contender']) {
    await expect(page.locator(selector).first()).toHaveCSS('border-top-style', 'solid');
  }
});

// Pressed and selected states must not rely on a fill change alone.
test('selected, current and pressed states have a non-colour indicator in dark mode', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/specificity/');
  const tab = page.locator('.tab[aria-selected="true"]');
  const tabStyle = await tab.evaluate((el) => {
    const style = getComputedStyle(el);
    return { weight: style.fontWeight, border: style.borderBlockEndWidth };
  });
  expect(tabStyle).toEqual({ weight: '600', border: '3px' });
  for (const name of ['Add selector', 'Compare selectors']) {
    const button = page.getByRole('button', { name, exact: true });
    await button.hover();
    await page.mouse.down();
    expect(await button.evaluate((el) => getComputedStyle(el).boxShadow), name).toContain('inset');
    await page.mouse.up();
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

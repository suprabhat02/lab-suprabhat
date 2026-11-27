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
  // No link tint, no button ring or glow, no card shadow: real borders and system colours instead.
  const link = page.locator('main p a').first();
  await link.hover();
  await expect(link).toHaveCSS('background-image', 'none');
  await expect(link).toHaveCSS('text-decoration-line', 'underline');
  const toggle = page.locator('[data-theme-toggle]');
  await expect(toggle).toHaveCSS('box-shadow', 'none');
  await expect(toggle).toHaveCSS('border-top-style', 'solid');
  const card = page.locator('.tool-item').first();
  await card.hover();
  await expect(card).toHaveCSS('box-shadow', 'none');
});

const BUTTON_ROUTES = ['/', '/specificity/', '/accessible-name/', '/stylesheet-audit/'];

test('every button is a pill of at least 24px, and icon-only buttons are named', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of BUTTON_ROUTES) {
    await page.goto(route);
    const buttons = page.locator('.button:visible');
    expect(await buttons.count(), route).toBeGreaterThan(0);
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      if (!box) throw new Error(`Missing button box on ${route}`);
      expect(box.width, route).toBeGreaterThanOrEqual(24);
      expect(box.height, route).toBeGreaterThanOrEqual(24);
      // 9999px clamps to half the height, so the computed radius is the pill value itself.
      await expect(button).toHaveCSS('border-top-left-radius', '9999px');
    }
    // The .button-icon convention: no visible text, so it must carry a name.
    for (const icon of await page.locator('.button-icon').all()) {
      await expect(icon, route).toHaveAccessibleName(/\S/);
    }
  }
});

test('button states: ring, primary lift and glow, and no motion when reduced', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/specificity/');
  const primary = page.getByRole('button', { name: 'Compare selectors', exact: true });
  const secondary = page.getByRole('button', { name: 'Add selector', exact: true });
  const ring = (el: Element, token: string) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    el.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(el).boxShadow.includes(color);
  };
  expect(await secondary.evaluate(ring, '--border')).toBe(true);
  await secondary.hover();
  await expect.poll(() => secondary.evaluate(ring, '--accent-border')).toBe(true);
  await primary.hover();
  await expect
    .poll(() => primary.evaluate((el) => getComputedStyle(el).transform))
    .toBe('matrix(1, 0, 0, 1, 0, -1)');
  // The hovered primary adds the accent glow: 0 8px 24px -8px.
  await expect
    .poll(() => primary.evaluate((el) => getComputedStyle(el).boxShadow))
    .toContain('0px 8px 24px -8px');
  expect(await primary.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe(
    'background-color, box-shadow, transform, color',
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(0, 0);
  await primary.hover();
  await expect(primary).toHaveCSS('transform', 'none');
  // utilities.css forces 0.01ms under reduced motion; anything under a millisecond is instant.
  expect(await primary.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(
    0.001,
  );
});

test('running-text links keep a 1px underline and fill with a tint on hover, even when wrapped', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/accessible-name/');
  // The first running-text link that breaks across lines at this width.
  const index = await page
    .locator('main .prose p a')
    .evaluateAll((links) => links.findIndex((link) => link.getClientRects().length > 1));
  expect(index).toBeGreaterThanOrEqual(0);
  const wrapped = page.locator('main .prose p a').nth(index);
  expect(await wrapped.evaluate((el) => el.getClientRects().length)).toBeGreaterThan(1);
  const style = () =>
    wrapped.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        line: s.textDecorationLine,
        thickness: s.textDecorationThickness,
        size: s.backgroundSize,
        clone:
          s.getPropertyValue('box-decoration-break') || s.getPropertyValue('-webkit-box-decoration-break'),
        color: s.color,
      };
    });
  const rest = await style();
  expect(rest).toMatchObject({ line: 'underline', thickness: '1px', size: '100% 0%', clone: 'clone' });
  await wrapped.hover();
  await expect.poll(async () => (await style()).size).toBe('100% 100%');
  const hover = await style();
  expect(hover.thickness).toBe('1px');
  expect(hover.color).toBe(rest.color);
  expect(await seriousViolations(page)).toEqual([]);
});

test('tool cards: accent border, shadow and arrow on hover; focus gets the colours without the lift', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const card = page.locator('.tool-item').first();
  const arrow = card.locator('.tool-arrow');
  await expect(card.locator('.tool-category svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(arrow).toHaveCSS('opacity', '0.6');
  const accentBorder = await card.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent-border)';
    el.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await card.hover();
  await expect(card).toHaveCSS('border-top-color', accentBorder);
  await expect(arrow).toHaveCSS('opacity', '1');
  await expect
    .poll(() => card.evaluate((el) => getComputedStyle(el).transform))
    .toBe('matrix(1, 0, 0, 1, 0, -2)');
  expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');

  await page.mouse.move(0, 0);
  await page.keyboard.press('Tab');
  await card.locator('.tool-title a').focus();
  await expect(card).toHaveCSS('border-top-color', accentBorder);
  await expect(card).toHaveCSS('transform', 'none');
  // The whole-card link overlay still takes the click.
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error('Missing tool card.');
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12);
  await expect(page).toHaveURL(/\/specificity\/$/);
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

// ---------- Section rhythm, split layouts and bento (step 3) ----------

test('top-level bands alternate plain and tint in DOM order, starting plain', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    const tones = await page
      .locator('main > *')
      .evaluateAll((children) => children.map((child) => child.getAttribute('data-tone')));
    expect(tones.length, route).toBeGreaterThan(0);
    tones.forEach((tone, i) => expect(tone, `${route}: band ${i + 1}`).toBe(i % 2 === 0 ? 'plain' : 'tint'));
  }
});

test('a hatched seam sits between bands and nowhere else, and forced colors swap it for a rule', async ({
  page,
}) => {
  const seams = () =>
    page.locator('main > [data-tone]').evaluateAll((bands) =>
      bands.map((band) => {
        const after = getComputedStyle(band, '::after');
        return { content: after.content, height: after.blockSize, hatch: after.backgroundImage };
      }),
    );
  for (const route of ['/', '/tools/', '/specificity/']) {
    await page.goto(route);
    const all = await seams();
    for (const seam of all.slice(0, -1)) {
      expect(seam.content, route).not.toBe('none');
      expect(seam.height, route).toBe('24px');
      expect(seam.hatch, route).toContain('repeating-linear-gradient');
    }
    expect(all.at(-1)?.content, route).toBe('none');
  }
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  const first = page.locator('main > [data-tone]').first();
  await expect(first).toHaveCSS('border-bottom-style', 'solid');
  expect(await first.evaluate((el) => getComputedStyle(el, '::after').display)).toBe('none');
});

test('"On this page" lists exactly the page headings, in order', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ['/about/', '/methodology/']) {
    await page.goto(route);
    const nav = page.getByRole('navigation', { name: 'On this page' });
    await expect(nav).toBeVisible();
    const links = await nav
      .getByRole('link')
      .evaluateAll((as) => as.map((a) => ({ href: a.getAttribute('href'), text: a.textContent?.trim() })));
    const headings = await page
      .locator('main h2')
      .evaluateAll((hs) => hs.map((h) => ({ href: `#${h.id}`, text: h.textContent?.trim() })));
    expect(links, route).toEqual(headings);
  }
  // Below lg the list is hidden and the page reads straight down.
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/about/');
  await expect(page.getByRole('navigation', { name: 'On this page' })).toBeHidden();
});

test('split layouts put the header column beside the body from 64rem, and stack in DOM order below', async ({
  page,
}) => {
  for (const [width, beside] of [
    [1440, true],
    [768, false],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/tools/', '/playground/']) {
      await page.goto(route);
      const split = page.locator('.section-split').first();
      const head = await split.locator('.split-head').boundingBox();
      const body = await split.locator('.split-body').boundingBox();
      if (!head || !body) throw new Error(`Missing split columns on ${route}`);
      if (beside) expect(head.x + head.width, route).toBeLessThanOrEqual(body.x);
      else expect(body.y, route).toBeGreaterThanOrEqual(head.y + head.height);
    }
  }
});

test('home bento: 4 + 2 then 2 + 4 on wide screens, and every preview is decorative', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const cards = page.locator('.tool-list-bento > .tool-item');
  const widths = await cards.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
  const [a = 0, b = 0, c = 0, d = 0] = widths;
  expect(a).toBeGreaterThan(b * 1.5);
  expect(d).toBeGreaterThan(c * 1.5);
  // Reading order stays DOM order: each card starts at or after the one before it.
  const tops = await cards.evaluateAll((items) =>
    items.map((item) => [item.getBoundingClientRect().top, item.getBoundingClientRect().left]),
  );
  for (let i = 1; i < tops.length; i++) {
    const [top = 0, left = 0] = tops[i] ?? [];
    const [prevTop = 0, prevLeft = 0] = tops[i - 1] ?? [];
    expect(top > prevTop + 1 || (Math.abs(top - prevTop) <= 1 && left > prevLeft)).toBe(true);
  }
  const previews = page.locator('.tool-preview');
  await expect(previews).toHaveCount(await cards.count());
  for (const preview of await previews.all()) {
    await expect(preview).toHaveAttribute('aria-hidden', 'true');
    await expect(preview.locator('a, button, input, [tabindex]')).toHaveCount(0);
  }
  await expect(page.locator('.tool-list-bento .tool-item').first().locator('a')).toHaveCount(1);
});

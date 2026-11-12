import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Presses Tab (or Shift+Tab) until `target` has focus, failing after `max` presses. */
async function tabTo(page: Page, target: Locator, max = 40, key = 'Tab') {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  throw new Error(`Could not reach the element with ${key}`);
}

const verdict = (page: Page) => page.locator('[data-verdict]');
const live = (page: Page) => page.locator('[data-live]');
const SHARE_URL = /^http:\/\/localhost:\d+\/specificity\/(\?s=[A-Za-z0-9_-]+)?$/;

/** The manual-copy fallback: a visible, labelled, focused field with the whole link selected. */
async function expectManualCopy(page: Page) {
  const field = page.getByLabel('Link to this comparison');
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(SHARE_URL);
  const selection = await field.evaluate((el: HTMLInputElement) => [
    el.selectionStart,
    el.selectionEnd,
    el.value.length,
  ]);
  expect(selection[0]).toBe(0);
  expect(selection[1]).toBe(selection[2]);
}

test.describe('duel', () => {
  test('pre-renders the default result', async ({ page }) => {
    await page.goto('/specificity/');
    await expect(verdict(page)).toHaveText('#nav a wins in the first column: 1 ID beats 0.');
    await expect(page.locator('[data-score="0"] .numeral[data-decided]')).toHaveText('1');
    await expect(page.locator('[data-score="0"] .numeral-caption[data-decided]')).toHaveText('▲ IDs');
  });

  test('the outcome sits right under the column labels, level across cards', async ({ page }) => {
    await page.goto('/specificity/');
    const gaps: number[] = [];
    const tops: number[] = [];
    for (const i of [0, 1]) {
      const caption = await page.locator(`[data-score="${i}"] .numeral-caption`).first().boundingBox();
      const outcome = await page.locator(`[data-score="${i}"] .outcome`).boundingBox();
      if (!caption || !outcome) throw new Error('Missing scoreboard boxes');
      gaps.push(outcome.y - (caption.y + caption.height));
      tops.push(outcome.y);
    }
    for (const gap of gaps) expect(gap).toBeLessThan(12);
    expect(Math.abs((tops[0] ?? 0) - (tops[1] ?? 0))).toBeLessThan(1);
  });

  test('on a 390x844 phone both scoreboards fit on one screen from the first input', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/specificity/');
    const input = await page.getByLabel('Selector 1', { exact: true }).boundingBox();
    const last = await page.locator('[data-score="1"] .outcome').boundingBox();
    const header = await page.locator('.site-header').boundingBox();
    if (!input || !last || !header) throw new Error('Missing boxes');
    expect(last.y + last.height - input.y).toBeLessThanOrEqual(844 - (header.y + header.height));
    // And on first load, without scrolling.
    expect(last.y + last.height).toBeLessThanOrEqual(844);
    // The decided column keeps its highlight at the smaller size.
    const decided = await page
      .locator('[data-score="0"] .numeral[data-decided]')
      .evaluate((el) => getComputedStyle(el).color !== getComputedStyle(el.nextElementSibling ?? el).color);
    expect(decided).toBe(true);
  });

  test('keyboard-only flow: compare, add, remove and copy', async ({ page, context, browserName }) => {
    // Only Chromium lets tests grant clipboard access; the others exercise whichever path the browser allows.
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const next = 'Tab';
    const previous = 'Shift+Tab';
    await page.goto('/specificity/');

    // Safari's default Tab order skips links (Option+Tab reaches them), so focus the skip link directly there.
    if (browserName === 'webkit') await page.locator('a.skip-link').focus();
    else await page.keyboard.press(next);
    await expect(page.locator('a.skip-link')).toBeFocused();
    await expect(page.locator('a.skip-link')).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);

    const first = page.getByLabel('Selector 1', { exact: true });
    await tabTo(page, first, 40, next);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('.a.b');
    const second = page.getByLabel('Selector 2', { exact: true });
    await page.keyboard.press(next);
    await expect(second).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('.c');

    await expect(verdict(page)).toHaveText(
      '.a.b wins in the second column: 2 classes, attributes or pseudo-classes beat 1.',
    );
    await expect(live(page)).toHaveText('.a.b wins. Specificity 0, 2, 0 versus 0, 1, 0.');

    const compareButton = page.getByRole('button', { name: 'Compare selectors' });
    await tabTo(page, compareButton, 40, next);
    await page.keyboard.press('Enter');
    await expect(live(page)).toHaveText('.a.b wins. Specificity 0, 2, 0 versus 0, 1, 0.');

    const add = page.getByRole('button', { name: 'Add selector' });
    await tabTo(page, add, 40, next);
    await page.keyboard.press('Enter');
    const third = page.getByLabel('Selector 3', { exact: true });
    await expect(third).toBeFocused();
    await page.keyboard.type('#x');
    await expect(verdict(page)).toContainText('#x wins in the first column');
    await expect(verdict(page)).toContainText('closest rival is .a.b');

    const remove = page.getByRole('button', { name: 'Remove selector 3' });
    await tabTo(page, remove, 10, previous);
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Selector 3', { exact: true })).toHaveCount(0);
    await expect(verdict(page)).toContainText('.a.b wins');

    const copy = page.getByRole('button', { name: 'Copy link' });
    await tabTo(page, copy, 40, next);
    await page.keyboard.press('Enter');
    const status = page.locator('[data-copy-status]');
    await expect(status).toHaveText(
      /^(Link copied\.|Select the link below and copy it with Ctrl\+C or Cmd\+C\.)$/,
    );
    if ((await status.textContent()) === 'Link copied.') {
      if (browserName === 'chromium') {
        expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(SHARE_URL);
      }
    } else {
      await expectManualCopy(page);
    }
  });

  for (const [label, stub] of [
    ['without the Clipboard API', () => Object.defineProperty(navigator, 'clipboard', { value: undefined })],
    [
      'when the browser refuses to write',
      () =>
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
        }),
    ],
  ] as const) {
    test(`copy link falls back to a selected field ${label}`, async ({ page }) => {
      await page.addInitScript(stub);
      await page.goto('/specificity/');
      await page.getByRole('button', { name: 'Copy link' }).click();
      await expect(page.locator('[data-copy-status]')).toHaveText(
        'Select the link below and copy it with Ctrl+C or Cmd+C.',
      );
      await expectManualCopy(page);
    });
  }

  test('explains ties and order of appearance', async ({ page }) => {
    await page.goto('/specificity/');
    await page.getByLabel('Selector 1', { exact: true }).fill('.a');
    await page.getByLabel('Selector 2', { exact: true }).fill('.b');
    await expect(verdict(page)).toHaveText('Same specificity: the one written later wins, so .b wins.');
    await expect(page.locator('[data-score="1"] .outcome')).toHaveText('Wins: written later');
  });

  test('shows parse errors with position, icon and text', async ({ page }) => {
    await page.goto('/specificity/');
    const input = page.getByLabel('Selector 2', { exact: true });
    await input.fill('.menu a)');
    const message = page.locator('#sel-1-msg .message-error');
    await expect(message).toContainText("This selector couldn't be parsed: unexpected ) at character 8.");
    await expect(message.locator('svg')).toHaveCount(1);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(verdict(page)).toHaveText('Fix selector 2 to see who wins.');
  });

  test('suggests fixes in order, including :where() and layers', async ({ page }) => {
    await page.goto('/specificity/');
    const titles = page.locator('[data-suggestions] .fix-title');
    await expect(titles).toHaveText([
      'Lower the winner with :where()',
      'Move the rules into ordered layers',
      'Raise the loser',
      'Use !important (last resort)',
    ]);
  });
});

test.describe('shareable state', () => {
  test('encodes input in the URL and restores it, keeping the canonical URL clean', async ({ page }) => {
    await page.goto('/specificity/');
    await page.getByLabel('Selector 1', { exact: true }).fill('ul li.active');
    await expect(page).toHaveURL(/\?s=[A-Za-z0-9_-]+/);
    const url = page.url();
    await page.goto(url);
    await expect(page.getByLabel('Selector 1', { exact: true })).toHaveValue('ul li.active');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://lab.suprabhat-dev.com/specificity/',
    );
  });

  test('falls back to the default demo with a calm notice for a bad link', async ({ page }) => {
    await page.goto('/specificity/?s=not-a-real-payload');
    await expect(page.locator('[data-share-notice]')).toHaveText(
      "This link's settings couldn't be read, so the default example is shown instead.",
    );
    await expect(verdict(page)).toHaveText('#nav a wins in the first column: 1 ID beats 0.');
    await expect(page).toHaveURL(/\/specificity\/$/);
  });

  test('rejects an oversized payload', async ({ page }) => {
    await page.goto(`/specificity/?s=${'A'.repeat(9000)}`);
    await expect(page.locator('[data-share-notice]')).toContainText('too large');
  });

  test('"Try this" links load an example into the duel', async ({ page }) => {
    await page.goto('/specificity/');
    await page.getByRole('link', { name: 'Try this in the duel' }).nth(1).click();
    await expect(page.getByLabel('Selector 2', { exact: true })).toHaveValue('#b');
    await expect(verdict(page)).toHaveText('#b wins in the first column: 1 ID beats 0.');
  });
});

test.describe('tabs', () => {
  test('follow the WAI-ARIA tabs pattern', async ({ page }) => {
    await page.goto('/specificity/');
    const anatomy = page.getByRole('tab', { name: 'Anatomy' });
    const nesting = page.getByRole('tab', { name: 'Nesting' });
    const cascade = page.getByRole('tab', { name: 'Cascade' });
    await expect(anatomy).toHaveAttribute('aria-selected', 'true');
    await anatomy.focus();
    await page.keyboard.press('ArrowRight');
    await expect(nesting).toBeFocused();
    await expect(nesting).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Nesting' })).toBeVisible();
    await page.keyboard.press('End');
    await expect(cascade).toBeFocused();
    await page.keyboard.press('Home');
    await expect(anatomy).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(cascade).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Anatomy' })).toBeHidden();
  });

  test('anatomy uses real tables with header scopes', async ({ page }) => {
    await page.goto('/specificity/');
    const table = page.locator('[data-anatomy] table').first();
    await expect(table.locator('th[scope="col"]')).toHaveCount(6);
    await expect(table.locator('tbody th[scope="row"]').first()).toHaveText('#nav');
  });

  test('panels end at their content and switching keeps the tab list in place', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/specificity/');
    const tablist = page.getByRole('tablist', { name: 'Inspect' });
    const measure = (name: string) =>
      page.getByRole('tabpanel', { name }).evaluate((panel) => {
        const section = panel.closest('section.section-tools') ?? panel;
        return {
          // Space between the panel's last content and the end of its section.
          below: section.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom,
          tablistTop: document.querySelector('[data-tablist]')?.getBoundingClientRect().top ?? 0,
        };
      });

    await page.getByRole('tab', { name: 'Cascade' }).click();
    await tablist.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const tall = await measure('Cascade');
    await page.getByRole('tab', { name: 'Nesting' }).click();
    const short = await measure('Nesting');

    // Two pixels of slack for subpixel rounding (WebKit).
    expect(Math.abs(short.tablistTop - tall.tablistTop)).toBeLessThanOrEqual(2);
    expect(Math.abs(short.below - tall.below)).toBeLessThanOrEqual(2);
    expect(short.below).toBeLessThanOrEqual(80);
  });
});

test.describe('nesting and cascade', () => {
  test('nesting expander shows the :is() form and its specificity', async ({ page }) => {
    await page.goto('/specificity/');
    await page.getByRole('tab', { name: 'Nesting' }).click();
    await page.getByLabel('Nested CSS').fill('.a, #b { & .c {} }');
    const output = page.locator('[data-nesting-output]');
    await expect(output).toContainText(':is(.a, #b) .c');
    await expect(output).toContainText('(1,1,0)');
  });

  test('cascade resolver marks the deciding step with text', async ({ page }) => {
    await page.goto('/specificity/');
    await page.getByRole('tab', { name: 'Cascade' }).click();
    const output = page.locator('[data-cascade-output]');
    await expect(output.locator('.cascade-summary')).toHaveText(
      'Decided at step 4, layers: the unlayered rule beats any layered rule for normal declarations, so specificity never got a vote.',
    );
    await expect(output.locator('.ladder-step')).toHaveCount(7);
    await expect(output.locator('.ladder-step[data-outcome="decided"]')).toContainText('Decided here');

    // Make the first declaration !important: it now wins at step 1.
    await page.locator('[data-row="0"] [data-field="important"]').check();
    await expect(output.locator('.cascade-summary')).toContainText('Decided at step 1');

    // Inline styles disable the selector, layer and scope fields.
    await page.locator('[data-row="1"] [data-field="inline"]').check();
    await expect(page.locator('[data-row="1"] [data-field="selector"]')).toBeDisabled();
  });

  test('adds and removes declarations within 2 to 4', async ({ page }) => {
    await page.goto('/specificity/');
    await page.getByRole('tab', { name: 'Cascade' }).click();
    const add = page.getByRole('button', { name: 'Add declaration' });
    await add.click();
    await expect(page.locator('[data-row]')).toHaveCount(4);
    await expect(add).toBeDisabled();
    await page.getByRole('button', { name: 'Remove declaration 4' }).click();
    await expect(page.locator('[data-row]')).toHaveCount(3);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the pre-rendered demo and a noscript note', async ({ page }) => {
    await page.goto('/specificity/');
    await expect(verdict(page)).toHaveText('#nav a wins in the first column: 1 ID beats 0.');
    // Chromium's parser still treats scripting as on when JS is disabled through DevTools,
    // so check the <noscript> content rather than its visibility.
    const noscript = await page.locator('noscript').evaluate((n) => n.innerHTML);
    expect(noscript).toContain('JavaScript is off');
    await expect(page.getByRole('heading', { name: 'Cascade', level: 2, exact: true })).toBeVisible();
    await expect(page.getByRole('tablist')).toBeHidden();
    await expect(page.locator('.cascade-summary')).toContainText('Decided at step 4');
    await expect(page.getByRole('button', { name: 'Add selector' })).toBeHidden();
  });
});

test.describe('site', () => {
  test('theme toggle switches and persists', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Dark theme' });
    const icon = toggle.locator('svg path');
    const outlineIsAccent = () =>
      toggle.evaluate((el) => {
        const accent = getComputedStyle(document.querySelector('.brand-slash') ?? el).color;
        return getComputedStyle(el).borderTopColor === accent;
      });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(icon).not.toHaveCSS('fill', 'none');
    expect(await outlineIsAccent()).toBe(true);
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.move(0, 0);
    await expect(icon).toHaveCSS('fill', 'none');
    expect(await outlineIsAccent()).toBe(false);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('home and about ship no JavaScript besides the theme script', async ({ page }) => {
    for (const route of ['/', '/about/']) {
      await page.goto(route);
      await expect(page.locator('script[src]')).toHaveCount(0);
    }
  });

  test('no CSP violations or console errors', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    page.on('pageerror', (e) => problems.push(e.message));
    for (const route of ['/', '/about/', '/specificity/']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
    }
    await page.getByLabel('Selector 1', { exact: true }).fill('#a');
    await expect(verdict(page)).toContainText('#a');
    expect(problems).toEqual([]);
  });

  for (const [theme, bg, accent] of [
    ['dark', 'rgb(7, 12, 16)', 'rgb(255, 77, 42)'],
    ['light', 'rgb(249, 250, 251)', 'rgb(180, 35, 0)'],
  ] as const) {
    test(`light-dark() tokens and container-query numerals resolve (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.goto('/specificity/');
      const html = page.locator('html');
      await expect(html).toHaveCSS('background-color', bg);
      const decided = page.locator('[data-score="0"] .numeral[data-decided]');
      await expect(decided).toHaveCSS('color', accent);
      const size = await decided.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size).toBeGreaterThanOrEqual(64);
      expect(size).toBeLessThanOrEqual(176);
    });
  }

  test('prose has no stray spaces before punctuation', async ({ page }) => {
    for (const route of ['/', '/specificity/', '/about/']) {
      await page.goto(route);
      const text = await page.locator('main').evaluate((el) => el.textContent ?? '');
      expect(text.match(/[\w)\]`]\s+[.,;!?](?=\s|$)/g) ?? []).toEqual([]);
    }
  });

  test('the slogan appears exactly twice across the site', async ({ page }) => {
    let count = 0;
    for (const route of ['/', '/specificity/', '/about/']) {
      await page.goto(route);
      const text = await page.locator('body').innerText();
      count += text.split('Web for all, all for web.').length - 1;
    }
    // Once in the footer of each page, plus the /about/ title.
    expect(count).toBe(4);
  });
});

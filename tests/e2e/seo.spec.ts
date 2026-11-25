import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const PERSON_ID = 'https://suprabhat-dev.com/#person';
const REPORT_URL = 'https://github.com/suprabhat02/lab-suprabhat/issues/new?template=wrong-result.yml';
const ROUTES = [
  '/',
  '/specificity/',
  '/playground/',
  '/accessible-name/',
  '/stylesheet-audit/',
  '/about/',
  '/tools/',
  '/methodology/',
] as const;
const toolsDirectory = new URL('../../src/content/tools/', import.meta.url);
const tools = readdirSync(toolsDirectory)
  .filter((file) => file.endsWith('.md'))
  .map((file) => {
    const source = readFileSync(new URL(file, toolsDirectory), 'utf8');
    const field = (name: string): string => {
      const value = new RegExp(`^${name}: (.+)$`, 'm').exec(source)?.[1]?.trim();
      if (!value) throw new Error(`Missing ${name} in ${file}`);
      return value;
    };
    const references = /^related:\r?\n((?:[ \t]+- [\w-]+\r?\n)+)/m.exec(source)?.[1];
    if (!references) throw new Error(`Missing related references in ${file}`);
    return {
      id: file.slice(0, -3),
      slug: field('slug'),
      title: field('title'),
      summary: field('summary'),
      navLabel: field('navLabel'),
      category: field('category'),
      status: field('status'),
      updatedAt: field('updatedAt').replace(/['"]/g, ''),
      order: Number(field('order')),
      related: references
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim().slice(2)),
    };
  })
  .sort((a, b) => a.order - b.order);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = Record<string, Json>;

const isObj = (value: Json): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every object anywhere in the JSON-LD, with the key it sits under. */
function walk(value: Json, key: string | null, out: { key: string | null; node: Obj }[] = []) {
  if (Array.isArray(value)) for (const item of value) walk(item, key, out);
  else if (isObj(value)) {
    out.push({ key, node: value });
    for (const [k, v] of Object.entries(value)) walk(v, k, out);
  }
  return out;
}

async function jsonLd(page: Page): Promise<Json[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.length).toBeGreaterThan(0);
  return blocks.map((text) => JSON.parse(text) as Json);
}

for (const route of ROUTES) {
  test.describe(`structured data on ${route}`, () => {
    test('parses, declares the Person once and refers to it by @id', async ({ page }) => {
      await page.goto(route);
      const all = (await jsonLd(page)).flatMap((doc) => walk(doc, null));

      const people = all.filter(({ node }) => node['@type'] === 'Person');
      expect(people.map(({ node }) => node['@id'])).toEqual([PERSON_ID]);
      expect(
        all.filter(({ node }) => node['@id'] === PERSON_ID && Object.keys(node).length > 1),
      ).toHaveLength(1);

      const ids = all.filter(({ node }) => Object.keys(node).length > 1 && typeof node['@id'] === 'string');
      const unique = new Set(ids.map(({ node }) => node['@id']));
      expect(unique.size).toBe(ids.length);

      const credits = all.filter(({ key }) => key === 'author' || key === 'publisher');
      expect(credits.length).toBeGreaterThan(0);
      for (const { node } of credits) expect(node).toEqual({ '@id': PERSON_ID });
    });

    test('has a title of at most 60 characters and a description of 120 to 155', async ({ page }) => {
      await page.goto(route);
      const title = await page.title();
      const description = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
      expect(title.length).toBeLessThanOrEqual(60);
      expect(description.length).toBeGreaterThanOrEqual(120);
      expect(description.length).toBeLessThanOrEqual(155);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
      await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', description);
    });
  });
}

test('/specificity/ declares the tool under its canonical @id', async ({ page }) => {
  await page.goto('/specificity/');
  const nodes = (await jsonLd(page)).flatMap((doc) => walk(doc, null)).map(({ node }) => node);
  const app = nodes.find((n) => n['@type'] === 'WebApplication');
  expect(app?.['@id']).toBe('https://lab.suprabhat-dev.com/specificity/#app');
  expect(app?.['author']).toEqual({ '@id': PERSON_ID });
  expect(app?.['offers']).toMatchObject({ price: 0, priceCurrency: 'USD' });
  expect(nodes.some((n) => n['@type'] === 'BreadcrumbList')).toBe(true);
});

test('navigation, home cards and llms tool entries match the collection in order', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const hrefs = tools.map((tool) => `/${tool.slug}/`);
  await expect(page.locator('.site-nav a')).toHaveText([...tools.map((tool) => tool.navLabel), 'About']);
  expect(
    await page.locator('.site-nav a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
  ).toEqual([...hrefs, '/about/']);
  await expect(page.locator('.tool-list .tool-title a')).toHaveText(tools.map((tool) => tool.title));
  expect(
    await page
      .locator('.tool-list .tool-title a')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
  ).toEqual(hrefs);
  const response = await request.get('/llms.txt');
  expect(response.ok()).toBe(true);
  const section = (await response.text()).replace(/\r\n/g, '\n').split('## Tools\n')[1]?.split('\n## ')[0];
  expect(section?.trim().split('\n')).toEqual(
    tools.map((tool) => `- [${tool.title}](https://lab.suprabhat-dev.com/${tool.slug}/): ${tool.summary}`),
  );
});

for (const tool of tools) {
  test(`${tool.slug} shares collection breadcrumbs, metadata and related tools`, async ({ page }) => {
    await page.goto(`/${tool.slug}/`);
    await expect(page.locator('.breadcrumbs [aria-current="page"]')).toHaveText(tool.title);
    const related = tools.filter((candidate) => tool.related.includes(candidate.id));
    await expect(page.locator('aside[aria-labelledby="related-title"] a')).toHaveText(
      related.map((entry) => entry.title),
    );
    expect(
      await page
        .locator('.related-tools a')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
    ).toEqual(related.map((entry) => `/${entry.slug}/`));
    const nodes = (await jsonLd(page)).flatMap((doc) => walk(doc, null)).map(({ node }) => node);
    const app = nodes.find((node) => node['@type'] === 'WebApplication');
    expect(app).toMatchObject({
      name: tool.title,
      description: tool.summary,
      operatingSystem: 'Any',
      isAccessibleForFree: true,
    });
    expect(app).not.toHaveProperty('aggregateRating');
    expect(app).not.toHaveProperty('review');
    const breadcrumb = nodes.find((node) => node['@type'] === 'BreadcrumbList');
    expect(breadcrumb?.['itemListElement']).toMatchObject([
      { name: 'Home', position: 1 },
      { name: 'Tools', position: 2 },
      { name: tool.title, position: 3 },
    ]);
    await expect(page.locator('.tool-trust a[href="/about/"]')).toHaveText('Suprabhat Kumar');
    await expect(page.locator('.tool-trust a', { hasText: 'How this tool is checked' })).toHaveAttribute(
      'href',
      `/methodology/#${tool.slug}`,
    );
    await expect(page.locator('.tool-trust a', { hasText: 'Report a wrong result' })).toHaveAttribute(
      'href',
      REPORT_URL,
    );
    for (const nav of await page.locator('nav').all()) {
      await expect(nav).toHaveAttribute('aria-label', /.+/);
    }
  });
}

test('serves the IndexNow key file at the site root', async ({ request }) => {
  const keyFiles = readdirSync(new URL('../../public/', import.meta.url)).filter((f) =>
    /^[0-9a-f]{32}\.txt$/.test(f),
  );
  expect(keyFiles).toHaveLength(1);
  const file = keyFiles[0] ?? '';
  const response = await request.get(`/${file}`);
  expect(response.status()).toBe(200);
  expect(await response.text()).toBe(file.replace('.txt', ''));
});

test('every tool appears on /tools/, in the sitemap and in llms.txt', async ({ page, request }) => {
  await page.goto('/tools/');
  await expect(page.locator('h1')).toHaveText('All tools');
  const categories = [...new Set(tools.map((tool) => tool.category))];
  await expect(page.locator('main h2')).toHaveText(categories);
  for (const category of categories) {
    const section = page.locator('main section', {
      has: page.getByRole('heading', { level: 2, name: category, exact: true }),
    });
    const inCategory = tools.filter((tool) => tool.category === category);
    await expect(section.locator('.tool-title a')).toHaveText(inCategory.map((tool) => tool.title));
    for (const [index, tool] of inCategory.entries()) {
      const card = section.locator('.tool-item').nth(index);
      await expect(card.locator('.tool-title a')).toHaveAttribute('href', `/${tool.slug}/`);
      await expect(card).toContainText(tool.summary);
      await expect(card.locator('.tool-status')).toHaveText(tool.status === 'live' ? 'Live' : 'In progress');
      await expect(card.locator('time')).toHaveAttribute('datetime', tool.updatedAt);
    }
  }

  const index = await (await request.get('/sitemap-index.xml')).text();
  const sitemaps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1] ?? '').pathname,
  );
  expect(sitemaps.length).toBeGreaterThan(0);
  const locations = (
    await Promise.all(sitemaps.map(async (path) => (await request.get(path)).text()))
  ).flatMap((xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
  const llms = await (await request.get('/llms.txt')).text();
  for (const path of [...tools.map((tool) => `/${tool.slug}/`), '/tools/', '/methodology/']) {
    expect(locations, path).toContain(`https://lab.suprabhat-dev.com${path}`);
    expect(llms, path).toContain(`](https://lab.suprabhat-dev.com${path})`);
  }
});

test('methodology covers every live tool with versions from the lockfile', async ({ page }) => {
  await page.goto('/methodology/');
  for (const tool of tools.filter((entry) => entry.status === 'live')) {
    const section = page.locator(`section:has(> .wrap h2#${tool.slug})`);
    await expect(section.getByRole('heading', { level: 3 })).toHaveText([
      'How it is checked',
      'Known limits',
    ]);
    await expect(section.locator('li')).not.toHaveCount(0);
  }
  await expect(page.locator('a[href="/about/"]', { hasText: 'Suprabhat Kumar' })).toBeVisible();
  await expect(page.locator(`#report ~ p a[href="${REPORT_URL}"]`)).toBeVisible();
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8')) as {
    packages: Record<string, { version: string }>;
  };
  const rows = page.getByRole('region', { name: 'Tested package versions' }).locator('tbody tr');
  await expect(rows).not.toHaveCount(0);
  for (const row of await rows.all()) {
    const name = (await row.locator('th').textContent())?.trim() ?? '';
    await expect(row.locator('td').first()).toHaveText(
      lock.packages[`node_modules/${name}`]?.version ?? 'missing',
    );
  }
});

test('the wrong-result issue form lists every tool in order', () => {
  const form = readFileSync(
    new URL('../../.github/ISSUE_TEMPLATE/wrong-result.yml', import.meta.url),
    'utf8',
  );
  const options = /options:\r?\n((?:[ \t]+- .+\r?\n)+)/.exec(form)?.[1];
  if (!options) throw new Error('Missing tool options in wrong-result.yml');
  expect(
    options
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim().slice(2)),
  ).toEqual(tools.map((tool) => tool.title));
});

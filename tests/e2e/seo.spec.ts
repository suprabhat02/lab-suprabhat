import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const PERSON_ID = 'https://suprabhat-dev.com/#person';
const ROUTES = ['/', '/specificity/', '/about/'] as const;

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

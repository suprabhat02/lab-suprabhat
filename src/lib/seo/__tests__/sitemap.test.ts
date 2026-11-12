import { describe, expect, it } from 'vitest';
import { sitemapUrls } from '../sitemap';

const URLSET = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>https://lab.suprabhat-dev.com/</loc></url><url><loc>https://lab.suprabhat-dev.com/about/</loc></url><url>
  <loc> https://lab.suprabhat-dev.com/specificity/?a=1&amp;b=2 </loc>
  <lastmod>2026-11-11T00:00:00.000Z</lastmod>
</url></urlset>`;

const INDEX = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://lab.suprabhat-dev.com/sitemap-0.xml</loc></sitemap></sitemapindex>`;

describe('sitemapUrls', () => {
  it('returns every page URL in order, trimmed and with entities decoded', () => {
    expect(sitemapUrls(URLSET)).toEqual([
      'https://lab.suprabhat-dev.com/',
      'https://lab.suprabhat-dev.com/about/',
      'https://lab.suprabhat-dev.com/specificity/?a=1&b=2',
    ]);
  });

  it('ignores the child sitemaps listed in a sitemap index', () => {
    expect(sitemapUrls(INDEX)).toEqual([]);
  });

  it('returns nothing for empty or unrelated input', () => {
    expect(sitemapUrls('')).toEqual([]);
    expect(sitemapUrls('<html></html>')).toEqual([]);
  });
});

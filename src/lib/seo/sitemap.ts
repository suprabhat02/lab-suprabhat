const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

/** Page URLs from a sitemap's `<url><loc>` entries; a sitemap index (`<sitemap><loc>`) yields none. */
export function sitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  for (const [, entry = ''] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(entry)?.[1];
    if (loc) urls.push(loc.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m));
  }
  return urls;
}

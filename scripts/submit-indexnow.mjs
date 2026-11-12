// Tells IndexNow search engines about every page in the built sitemap. Run after a deploy: node scripts/submit-indexnow.mjs
// A failed ping is logged and exits 0, so it never fails a deploy.
import { readFileSync, readdirSync } from 'node:fs';
import { sitemapUrls } from '../src/lib/seo/sitemap.ts';

const HOST = 'lab.suprabhat-dev.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const dist = new URL('../dist/', import.meta.url);

// The key file is public/<key>.txt, copied into dist, so the ping always matches what was deployed.
const keyFile = readdirSync(dist).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error('IndexNow: no <key>.txt in dist/. Run the build first.');
  process.exit(1);
}
const key = readFileSync(new URL(keyFile, dist), 'utf8').trim();

const urlList = [
  ...new Set(
    readdirSync(dist)
      .filter((f) => /^sitemap-.*\.xml$/.test(f))
      .flatMap((f) => sitemapUrls(readFileSync(new URL(f, dist), 'utf8'))),
  ),
].filter((url) => new URL(url).host === HOST);
if (urlList.length === 0) {
  console.error('IndexNow: no page URLs in dist/sitemap-*.xml.');
  process.exit(1);
}

try {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, urlList }),
    signal: AbortSignal.timeout(15_000),
  });
  console.log(`IndexNow: HTTP ${response.status} ${response.statusText} for ${urlList.length} URLs`);
} catch (error) {
  console.warn(
    `IndexNow: request failed (${error instanceof Error ? error.message : String(error)}); not failing.`,
  );
}

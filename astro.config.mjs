// @ts-check
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const site = 'https://lab.suprabhat-dev.com';

// The pre-paint theme script is inlined by BaseLayout; its hash must be in the CSP.
const themeScript = readFileSync(new URL('./src/scripts/theme-inline.js', import.meta.url), 'utf8');
const themeScriptHash = `sha256-${createHash('sha256').update(themeScript).digest('base64')}`;

/** Map each tool page to its `updatedAt` so the sitemap reflects the `tools` collection. */
function toolLastModified() {
  const dir = new URL('./src/content/tools/', import.meta.url);
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const text = readFileSync(new URL(file, dir), 'utf8');
    const slug = /^slug:\s*['"]?([\w-]+)/m.exec(text)?.[1];
    const updated = /^updatedAt:\s*['"]?([\d-]+)/m.exec(text)?.[1];
    if (slug && updated) map.set(`${site}/${slug}/`, new Date(updated).toISOString());
  }
  return map;
}
const lastModified = toolLastModified();

export default defineConfig({
  site,
  trailingSlash: 'always',
  // Lossless whitespace removal; the default 'jsx' mode can join words in prose.
  compressHTML: true,
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
  // Shiki emits inline styles, which the CSP blocks; code samples here are plain.
  markdown: { syntaxHighlight: false },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
      serialize(item) {
        const updated = lastModified.get(item.url);
        return updated ? { ...item, lastmod: updated } : item;
      },
    }),
  ],
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "manifest-src 'self'",
      ],
      scriptDirective: {
        hashes: [/** @type {`sha256-${string}`} */ (themeScriptHash)],
      },
    },
  },
});

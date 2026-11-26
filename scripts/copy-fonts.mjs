// Copies only the upright Latin and Latin-ext subsets of each self-hosted family and removes stale files.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const to = new URL('../public/fonts/', import.meta.url);
const families = ['geist-mono'];
const served = new Set();

mkdirSync(to, { recursive: true });
for (const family of families) {
  const from = new URL(`../node_modules/@fontsource-variable/${family}/files/`, import.meta.url);
  for (const subset of ['latin', 'latin-ext']) {
    const file = `${family}-${subset}-wght-normal.woff2`;
    copyFileSync(new URL(file, from), new URL(file, to));
    served.add(file);
  }
}
for (const file of readdirSync(to)) {
  if (!served.has(file)) rmSync(new URL(file, to));
}

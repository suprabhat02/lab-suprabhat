// Copies only the two Latin subsets of each self-hosted family.
import { copyFileSync, mkdirSync } from 'node:fs';

const to = new URL('../public/fonts/', import.meta.url);

mkdirSync(to, { recursive: true });
for (const family of ['geist', 'geist-mono']) {
  const from = new URL(`../node_modules/@fontsource-variable/${family}/files/`, import.meta.url);
  for (const subset of ['latin', 'latin-ext']) {
    const file = `${family}-${subset}-wght-normal.woff2`;
    copyFileSync(new URL(file, from), new URL(file, to));
  }
}

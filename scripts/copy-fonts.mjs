// Copies the self-hosted Geist Mono subsets from the npm package into public/fonts.
import { copyFileSync, mkdirSync } from 'node:fs';

const from = new URL('../node_modules/@fontsource-variable/geist-mono/files/', import.meta.url);
const to = new URL('../public/fonts/', import.meta.url);
const files = ['geist-mono-latin-wght-normal.woff2', 'geist-mono-latin-ext-wght-normal.woff2'];

mkdirSync(to, { recursive: true });
for (const file of files) copyFileSync(new URL(file, from), new URL(file, to));

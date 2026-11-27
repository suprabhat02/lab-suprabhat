// Match common local fallbacks to the Latin font files actually served (run after copy-fonts.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import { createFontStack } from '@capsizecss/core';
import { fromBuffer } from '@capsizecss/unpack';
import courierNew from '@capsizecss/metrics/courierNew';
import arial from '@capsizecss/metrics/arial';
import segoeUI from '@capsizecss/metrics/segoeUI';
import helvetica from '@capsizecss/metrics/helvetica';

const fonts = new URL('../public/fonts/', import.meta.url);
const plex = {
  ...(await fromBuffer(readFileSync(new URL('IBMPlexMono-Regular-Latin1.woff2', fonts)))),
  familyName: 'IBM Plex Mono',
};
// Capsize reads Inter's default instance (opsz 14, wght 400), which is what 14-16px body text renders.
const sans = {
  ...(await fromBuffer(readFileSync(new URL('inter-latin.woff2', fonts)))),
  familyName: 'Inter Variable',
};

// Not in @capsizecss/metrics; read from the font files (Consolas 7.00, Menlo shares DejaVu Sans Mono's metrics).
const consolas = {
  familyName: 'Consolas',
  fullName: 'Consolas',
  ascent: 1521,
  descent: -527,
  lineGap: 350,
  unitsPerEm: 2048,
  capHeight: 1307,
  xHeight: 1004,
  xWidthAvg: 1126,
};
const menlo = {
  familyName: 'Menlo',
  fullName: 'Menlo Regular',
  ascent: 1901,
  descent: -483,
  lineGap: 0,
  unitsPerEm: 2048,
  capHeight: 1493,
  xHeight: 1120,
  xWidthAvg: 1233,
};

const { fontFamily, fontFaces } = createFontStack([plex, consolas, menlo, courierNew]);
const sansStack = createFontStack([sans, arial, segoeUI, helvetica]);
const sansFaces = sansStack.fontFaces.replace(
  /src: (local\('Arial'\)[^;]*);/,
  "src: $1, local('Liberation Sans');",
);

// Liberation Mono and Cousine are metric-compatible with Courier New, so they share its overrides.
const faces = fontFaces
  .replace(/src: (local\('Courier New'\)[^;]*);/, "src: $1, local('Liberation Mono'), local('Cousine');")
  .replace(/src: (local\('Menlo Regular'\)[^;]*);/, "src: $1, local('Menlo'), local('DejaVu Sans Mono');");
if (
  !faces.includes('Liberation Mono') ||
  !faces.includes('DejaVu Sans Mono') ||
  !sansFaces.includes('Liberation Sans')
) {
  throw new Error('Unexpected @font-face output from Capsize; update the src rewrites.');
}

const out = new URL('../src/styles/fonts.generated.css', import.meta.url);
const css = `/* Built by scripts/font-fallbacks.mjs from the served Latin fonts. Do not edit by hand. */
/* Sans stack: ${sansStack.fontFamily} */
${sansFaces.trim()}
/* Stack: ${fontFamily} */
${faces.trim()}
`;
writeFileSync(out, css);
console.log(`Wrote ${out.pathname.split('/').slice(-3).join('/')}\n${sansStack.fontFamily}\n${fontFamily}`);

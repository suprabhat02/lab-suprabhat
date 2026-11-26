// Match common local fallbacks to the Latin font files actually served.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFontStack } from '@capsizecss/core';
import { fromBuffer } from '@capsizecss/unpack';
import courierNew from '@capsizecss/metrics/courierNew';
import arial from '@capsizecss/metrics/arial';
import segoeUI from '@capsizecss/metrics/segoeUI';
import helvetica from '@capsizecss/metrics/helvetica';

const fontFile = new URL(
  '../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2',
  import.meta.url,
);
const geist = { ...(await fromBuffer(readFileSync(fontFile))), familyName: 'Geist Mono Variable' };
const interFile = new URL(
  '../node_modules/@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2',
  import.meta.url,
);
const interBuffer = readFileSync(interFile);
const interHash = createHash('sha256').update(interBuffer).digest('hex');
if (interHash !== '2c295d99e26dcf357d4d01bcf270fd6924b600c9a13dd8c363ef114f4c6976fa') {
  throw new Error('Inter font changed; remeasure the Regular optical-size 32 fallback metrics.');
}
// Capsize unpacks the default opsz 14; these metrics are measured at opsz 32, weight 400.
const interMetrics = await fromBuffer(interBuffer);
const sans = {
  ...interMetrics,
  familyName: 'Inter Variable',
  xHeight: 1056,
  xWidthAvg: 892,
  subsets: { ...interMetrics.subsets, latin: { xWidthAvg: 892 } },
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

const { fontFamily, fontFaces } = createFontStack([geist, consolas, menlo, courierNew]);
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

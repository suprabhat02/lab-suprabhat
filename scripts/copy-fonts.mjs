// Writes the self-hosted fonts into public/fonts/ and removes stale files.
// Inter is subset from the official rsms build; IBM Plex Mono is copied unmodified (Reserved Font Name).
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { create } from 'fontkitten';
import subsetFont from 'subset-font';

const to = new URL('../public/fonts/', import.meta.url);
const modules = new URL('../node_modules/', import.meta.url);
const served = new Set();

/** @typedef {[number, number]} Range */
/** @type {Range[]} */
const interLatin = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x131, 0x131],
  [0x152, 0x153],
  [0x2c6, 0x2c6],
  [0x2da, 0x2da],
  [0x2dc, 0x2dc],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2190, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];
// U+0100-017F minus the code points already in the Latin file, plus U+0180-024F.
/** @type {Range[]} */
const interLatinExt = [
  [0x100, 0x130],
  [0x132, 0x151],
  [0x154, 0x24f],
];

/** @param {Range[]} ranges */
const toText = (ranges) =>
  ranges
    .flatMap(([from, end]) =>
      Array.from({ length: end - from + 1 }, (_, i) => String.fromCodePoint(from + i)),
    )
    .join('');
/** @param {number} n */
const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
/** @param {Range[]} ranges */
const toUnicodeRange = (ranges) =>
  ranges.map(([from, end]) => (from === end ? `U+${hex(from)}` : `U+${hex(from)}-${hex(end)}`)).join(', ');

const requiredAxes = ['opsz', 'wght'];
// A subset keeps a feature only if it still holds a glyph the feature acts on (measured with HarfBuzz):
// cv02, cv03 and cv04 change only 4, 6 and 9, so they can exist only in the Latin file; cv11 changes a-forms in both.
const requiredFeatures = {
  'inter-latin.woff2': ['cv02', 'cv03', 'cv04', 'cv11'],
  'inter-latin-ext.woff2': ['cv11'],
};

/** @param {Buffer} buffer @param {keyof typeof requiredFeatures} name */
function assertInterFeatures(buffer, name) {
  const font = create(buffer);
  const axes = Object.keys(font.variationAxes);
  const features = new Set(font.GSUB.featureList.map((/** @type {{ tag: string }} */ f) => f.tag));
  const missing = [
    ...requiredAxes.filter((axis) => !axes.includes(axis)),
    ...requiredFeatures[name].filter((feature) => !features.has(feature)),
  ];
  if (missing.length) throw new Error(`${name} lost ${missing.join(', ')} while subsetting.`);
}

mkdirSync(to, { recursive: true });

const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8').replace(
  /\s+/g,
  ' ',
);
const inter = readFileSync(new URL('inter-ui/variable/InterVariable.woff2', modules));
for (const [file, ranges] of /** @type {const} */ ([
  ['inter-latin.woff2', interLatin],
  ['inter-latin-ext.woff2', interLatinExt],
])) {
  // Keeps each @font-face unicode-range in tokens.css in step with what the file contains.
  if (!tokens.includes(`unicode-range: ${toUnicodeRange(ranges)};`)) {
    throw new Error(`tokens.css must declare unicode-range: ${toUnicodeRange(ranges)}; for ${file}.`);
  }
  const subset = await subsetFont(inter, toText(ranges), { targetFormat: 'woff2' });
  assertInterFeatures(subset, file);
  writeFileSync(new URL(file, to), subset);
  served.add(file);
}

const plex = new URL('@ibm/plex-mono/fonts/split/woff2/', modules);
for (const weight of ['Regular', 'Medium', 'SemiBold']) {
  for (const subset of ['Latin1', 'Latin2']) {
    const file = `IBMPlexMono-${weight}-${subset}.woff2`;
    const source = new URL(file, plex);
    const features = new Set(
      create(readFileSync(source)).GSUB.featureList.map((/** @type {{ tag: string }} */ f) => f.tag),
    );
    // zero only changes the digit 0, which IBM ships in Latin1; ss02 is in both files.
    const missing = (subset === 'Latin1' ? ['ss02', 'zero'] : ['ss02']).filter(
      (feature) => !features.has(feature),
    );
    if (missing.length) throw new Error(`${file} has no ${missing.join(', ')}.`);
    copyFileSync(source, new URL(file, to));
    served.add(file);
  }
}

// OFL-1.1 requires the licence to travel with the fonts.
for (const [from, file] of [
  ['inter-ui/LICENSE.txt', 'LICENSE-Inter.txt'],
  ['@ibm/plex-mono/LICENSE.txt', 'LICENSE-IBM-Plex.txt'],
]) {
  copyFileSync(new URL(from, modules), new URL(file, to));
  served.add(file);
}

for (const file of readdirSync(to)) {
  if (!served.has(file)) rmSync(new URL(file, to));
}

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const tokenFile = new URL('../src/styles/tokens.css', import.meta.url);

export function readTokens(source = readFileSync(tokenFile, 'utf8'), moreContrast = false) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const root = css.match(/@layer tokens\s*\{\s*:root\s*\{([^}]+)\}/)?.[1];
  if (!root) throw new Error('Missing base token block.');
  const more = css.match(/@media \(prefers-contrast: more\)\s*\{\s*:root\s*\{([^}]+)\}/)?.[1];
  if (moreContrast && !more) throw new Error('Missing increased-contrast tokens.');
  /** @type {Map<string, string>} */
  const tokens = new Map();
  for (const [, name, value] of `${root}\n${moreContrast ? more : ''}`.matchAll(
    /(--[\w-]+)\s*:\s*([^;]+);/g,
  )) {
    if (!name || !value) throw new Error('Invalid token declaration.');
    tokens.set(name, value.trim());
  }
  return tokens;
}

/** @param {string} value */
function splitThemes(value) {
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) return [value.slice(0, i), value.slice(i + 1)];
  }
  throw new Error(`Invalid light-dark value: ${value}`);
}

/** @param {Map<string, string>} tokens @param {string} name @param {'light' | 'dark'} theme */
export function resolveToken(tokens, name, theme) {
  /** @param {string} value @param {string[]} seen */
  const resolve = (value, seen) => {
    value = value.trim();
    const variable = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
    if (variable) {
      if (seen.includes(variable)) throw new Error(`Cyclic token: ${[...seen, variable].join(' -> ')}`);
      const next = tokens.get(variable);
      if (!next) throw new Error(`Missing token: ${variable}`);
      return resolve(next, [...seen, variable]);
    }
    if (value.startsWith('light-dark(') && value.endsWith(')')) {
      const choices = splitThemes(value.slice(11, -1));
      return resolve(choices[theme === 'light' ? 0 : 1], seen);
    }
    return value;
  };
  if (!['light', 'dark'].includes(theme)) throw new Error(`Invalid theme: ${theme}`);
  return resolve(`var(${name})`, []);
}

/** @param {number} linear */
const encode = (linear) => (linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055);
/** @param {number} channel */
const decode = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

/** CSS Color 4 OKLab matrices; returns encoded sRGB in [0, 1].
 * @param {string} value @returns {[number, number, number]} */
export function toSrgb(value) {
  if (/^#[\da-f]{6}$/i.test(value)) {
    return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  }
  const match = /^oklch\(([\d.]+)(%)?\s+([\d.]+)\s+([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`Unsupported color: ${value}`);
  const L = Number(match[1]) / (match[2] ? 100 : 1);
  const C = Number(match[3]);
  const angle = (Number(match[4]) * Math.PI) / 180;
  const a = C * Math.cos(angle);
  const b = C * Math.sin(angle);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  if (linear.some((channel) => channel < -0.00001 || channel > 1.00001)) {
    throw new Error(`Out-of-sRGB token needs an explicit gamut decision: ${value}`);
  }
  return linear.map((channel) => encode(Math.max(0, Math.min(1, channel))));
}

/** @param {number[]} rgb */
const luminance = (rgb) =>
  rgb.reduce((sum, channel, i) => sum + decode(channel) * [0.2126, 0.7152, 0.0722][i], 0);
/** @param {number[]} text @param {number[]} background */
export function wcagContrast(text, background) {
  const values = [luminance(text), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

/** Informational APCA 0.0.98G-4g (apca-w3 0.1.9), signed Lc.
 * Equations/constants verified at https://github.com/Myndex/apca-w3/blob/master/src/apca-w3.js.
 * Independently expressed for this web color report; never a conformance gate.
 * @param {number[]} text @param {number[]} background */
export function apcaLc(text, background) {
  const ys = [text, background].map((rgb) => {
    const y = rgb.reduce((sum, c, i) => sum + c ** 2.4 * [0.2126729, 0.7151522, 0.072175][i], 0);
    return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
  });
  const [foreground, surface] = ys;
  if (Math.abs(surface - foreground) < 0.0005) return 0;
  const normal = surface > foreground;
  const contrast = 1.14 * (surface ** (normal ? 0.56 : 0.65) - foreground ** (normal ? 0.57 : 0.62));
  if (Math.abs(contrast) < 0.1) return 0;
  return (contrast + (normal ? -0.027 : 0.027)) * 100;
}

const surfaces = ['bg', 'surface', 'surface-inset', 'surface-overlay'];
export const contrastGroups = [
  ...['text', 'text-muted'].map((fg) => ({
    fg,
    backgrounds: [...surfaces, 'fill', 'fill-hover', 'fill-active'],
    minimum: 4.5,
  })),
  { fg: 'text-body', backgrounds: surfaces, minimum: 4.5 },
  { fg: 'text-faint', backgrounds: surfaces, minimum: 4.5 },
  // Accent text is limited to these surfaces; elsewhere accent is an underline or the focus ring.
  ...['accent', 'accent-hover'].map((fg) => ({
    fg,
    backgrounds: ['bg', 'surface', 'accent-subtle'],
    minimum: 4.5,
  })),
  { fg: 'accent-text', backgrounds: ['bg', 'surface', 'accent-tint'], minimum: 4.5 },
  { fg: 'accent-border', backgrounds: ['bg', 'surface'], minimum: 3 },
  { fg: 'text', backgrounds: ['selection-bg'], minimum: 4.5 },
  ...['success', 'warning', 'danger', 'info'].map((fg) => ({
    fg,
    backgrounds: [...surfaces, `${fg}-subtle`],
    minimum: 4.5,
  })),
  {
    fg: 'on-accent',
    backgrounds: ['accent', 'accent-hover', 'accent-solid', 'accent-solid-hover'],
    minimum: 4.5,
  },
  { fg: 'on-primary', backgrounds: ['primary', 'primary-hover'], minimum: 4.5 },
  { fg: 'border-strong', backgrounds: ['bg', 'surface'], minimum: 3 },
  {
    fg: 'border-control-on-fill',
    backgrounds: [...surfaces, 'fill', 'fill-hover', 'fill-active'],
    minimum: 3,
  },
  { fg: 'focus-ring', backgrounds: [...surfaces, 'fill', 'fill-hover', 'fill-active'], minimum: 3 },
];

export function contrastReport(source = readFileSync(tokenFile, 'utf8'), moreContrast = false) {
  const tokens = readTokens(source, moreContrast);
  return contrastGroups.flatMap(({ fg, backgrounds, minimum }) =>
    backgrounds.map((bg) => {
      const values = ['light', 'dark'].map((theme) => {
        const text = toSrgb(resolveToken(tokens, `--${fg}`, theme));
        const background = toSrgb(resolveToken(tokens, `--${bg}`, theme));
        return { ratio: wcagContrast(text, background), lc: apcaLc(text, background) };
      });
      return { fg, bg, minimum, light: values[0], dark: values[1] };
    }),
  );
}

/** @param {ReturnType<typeof contrastReport>} rows */
export function assertContrast(rows) {
  const failures = rows.filter((row) => row.light.ratio < row.minimum || row.dark.ratio < row.minimum);
  if (failures.length)
    throw new Error(
      `Contrast failed:\n${failures
        .map(
          (row) =>
            `${row.fg} on ${row.bg}: ${row.light.ratio.toFixed(3)} / ${row.dark.ratio.toFixed(3)}; needs ${row.minimum}`,
        )
        .join('\n')}`,
    );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const rows = contrastReport();
  console.log(
    '| Foreground | Background | WCAG light | WCAG dark | APCA Lc light | APCA Lc dark | Minimum |',
  );
  console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const row of rows) {
    console.log(
      `| ${row.fg} | ${row.bg} | ${row.light.ratio.toFixed(2)} | ${row.dark.ratio.toFixed(2)} | ${row.light.lc.toFixed(1)} | ${row.dark.lc.toFixed(1)} | ${row.minimum} |`,
    );
  }
  assertContrast(rows);
  assertContrast(contrastReport(undefined, true));
  console.log(
    `Passed ${rows.length * 4} WCAG checks: two themes, normal and increased contrast. APCA is informational.`,
  );
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  apcaLc,
  assertContrast,
  contrastReport,
  readTokens,
  resolveToken,
  surfaceColor,
  toSrgb,
  wcagContrast,
} from '../../../scripts/contrast.mjs';

describe('offline token contrast', () => {
  it('converts OKLCH and matches known WCAG and signed APCA reference pairs', () => {
    const white = toSrgb('oklch(100% 0 35)');
    const black = toSrgb('#000000');
    expect(wcagContrast(black, white)).toBeCloseTo(21, 5);
    expect(wcagContrast(toSrgb('#777777'), white)).toBeCloseTo(4.4781, 4);
    expect(apcaLc(black, white)).toBeCloseTo(106.0407, 3);
    expect(apcaLc(white, black)).toBeCloseTo(-107.8847, 3);
    expect(() => toSrgb('oklch(70% 0.5 30)')).toThrow('Out-of-sRGB');
  });

  it('resolves both themes and increased contrast, rejecting cycles instead of defaulting', () => {
    const tokens = readTokens();
    expect(resolveToken(tokens, '--accent', 'light')).toBe('#b42300');
    expect(resolveToken(tokens, '--text-faint', 'dark')).not.toBe(resolveToken(tokens, '--text', 'dark'));
    const more = readTokens(undefined, true);
    expect(resolveToken(more, '--text-faint', 'dark')).toBe(resolveToken(more, '--text', 'dark'));
    expect(() => resolveToken(new Map([['--loop', 'var(--loop)']]), '--loop', 'dark')).toThrow(
      'Cyclic token',
    );
  });

  it('composites translucent washes over their backdrop and rejects a wash without one', () => {
    const tokens = readTokens();
    const tint = surfaceColor(tokens, 'link-tint/bg', 'light');
    const white = 1;
    const vivid = toSrgb('#ff4d2a');
    expect(tint[1]).toBeCloseTo((vivid[1] ?? 0) * 0.16 + white * 0.84, 6);
    expect(() => surfaceColor(tokens, 'link-tint', 'light')).toThrow('needs a backdrop');
    expect(() => surfaceColor(tokens, 'bg/surface', 'light')).toThrow('is opaque');
  });

  it('passes actual tokens but fails a contrast regression in the source stylesheet', () => {
    expect(() => assertContrast(contrastReport())).not.toThrow();
    expect(() => assertContrast(contrastReport(undefined, true))).not.toThrow();
    const source = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');
    const regression = source.replace('--text: light-dark(#1c1714, #f0ecea)', '--text: var(--bg)');
    expect(regression).not.toBe(source);
    expect(() => assertContrast(contrastReport(regression))).toThrow('Contrast failed');
  });
});

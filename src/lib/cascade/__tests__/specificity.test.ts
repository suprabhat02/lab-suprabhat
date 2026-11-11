import { describe, expect, it } from 'vitest';
import { calculate as library } from '@bramus/specificity/core';
import { calculate, forgiveLists, MAX_SELECTOR_LENGTH, strongest } from '../specificity';
import type { Specificity, SpecificityResult } from '../types';

const VECTORS: ReadonlyArray<readonly [string, Specificity]> = [
  ['*', [0, 0, 0]],
  ['li', [0, 0, 1]],
  ['ul ol+li', [0, 0, 3]],
  ['h1 + *[rel=up]', [0, 1, 1]],
  ['#x34y', [1, 0, 0]],
  ['#s12:not(foo)', [1, 0, 1]],
  ['.foo :is(.bar, #baz)', [1, 1, 0]],
  ['.qux:where(em, #foo#bar#baz)', [0, 1, 0]],
  [':nth-child(even of li, .item)', [0, 2, 0]],
  [':not(em, strong#foo)', [1, 0, 1]],
  ['li:nth-child(2n+1)', [0, 1, 1]],
  [':nth-last-child(odd of #a .b)', [1, 2, 0]],
  [':nth-child(2 of :where(#a))', [0, 1, 0]],
  [':nth-of-type(2)', [0, 1, 0]],
  ['a::before', [0, 0, 2]],
  ['a:before', [0, 0, 2]],
  ['p:first-line', [0, 0, 2]],
  [':has(> img#hero)', [1, 0, 1]],
  ['[type="text" i]', [0, 1, 0]],
  ['svg|circle', [0, 0, 1]],
  ['*|*', [0, 0, 0]],
  ['.a.a.a', [0, 3, 0]],
  [':not(*)', [0, 0, 0]],
  ['a:not(.b):not(.c)', [0, 2, 1]],
  [':is(:not(#a), .b)', [1, 0, 0]],
  [':where(#a) #b', [1, 0, 0]],
  ['::slotted(.foo)', [0, 1, 1]],
  ['::slotted(*)', [0, 0, 1]],
  [':host', [0, 1, 0]],
  [':host(.foo)', [0, 2, 0]],
  [':host-context(.x)', [0, 2, 0]],
  [':host(#x) .y', [1, 2, 0]],
  ['::part(label)', [0, 0, 1]],
  ['x-foo::part(label):hover', [0, 1, 2]],
  [':lang(en)', [0, 1, 0]],
  ['::highlight(foo)', [0, 0, 1]],
  [':is(.a, #b) .c', [1, 1, 0]],
  ['::view-transition-group(root)', [0, 0, 1]],
  ['::view-transition-group(*)', [0, 0, 0]],
  ['::selection', [0, 0, 1]],
];

function one(selector: string): SpecificityResult {
  const result = calculate(selector);
  if (!result.ok) throw new Error(`Expected ${selector} to parse: ${result.error.message}`);
  const [first] = result.value;
  if (!first) throw new Error(`No result for ${selector}`);
  return first;
}

const partsTotal = (r: SpecificityResult): Specificity =>
  r.parts.reduce<Specificity>(
    (t, p) => [t[0] + p.contributes[0], t[1] + p.contributes[1], t[2] + p.contributes[2]],
    [0, 0, 0],
  );

describe('specificity: the 40 reference vectors', () => {
  it.each(VECTORS)('%s → %j', (selector, expected) => {
    expect(one(selector).value).toEqual(expected);
  });

  it.each(VECTORS)('%s: parts add up to the total', (selector) => {
    const r = one(selector);
    expect(partsTotal(r)).toEqual(r.value);
  });

  it.each(VECTORS)('%s: agrees with the underlying library', (selector, expected) => {
    const [lib] = library(selector);
    expect([lib?.a, lib?.b, lib?.c]).toEqual(expected);
  });
});

describe('specificity: extras', () => {
  it('returns one value per selector in a comma list', () => {
    const r = calculate('.a, #b');
    expect(r.ok && r.value.map((x) => x.value)).toEqual([
      [0, 1, 0],
      [1, 0, 0],
    ]);
    expect(r.ok && r.value.map((x) => x.selector)).toEqual(['.a', '#b']);
  });

  it.each<readonly [string, Specificity]>([
    [':host(:not(.x))', [0, 2, 0]],
    ['::slotted(span.x)', [0, 1, 2]],
    ['ns|*.a', [0, 1, 0]],
  ])('%s → %j', (selector, expected) => {
    expect(one(selector).value).toEqual(expected);
    expect(partsTotal(one(selector))).toEqual(expected);
  });

  it('picks the strongest selector in a list', () => {
    const r = calculate('.a, #b, p');
    expect(r.ok && strongest(r.value)?.selector).toBe('#b');
  });
});

describe('specificity: parts', () => {
  it('labels each part with its kind, position and contribution', () => {
    const r = one('#nav .link:hover > a::before');
    expect(r.parts.map((p) => [p.text, p.kind, p.contributes])).toEqual([
      ['#nav', 'id', [1, 0, 0]],
      [' ', 'combinator', [0, 0, 0]],
      ['.link', 'class', [0, 1, 0]],
      [':hover', 'pseudo-class', [0, 1, 0]],
      ['>', 'combinator', [0, 0, 0]],
      ['a', 'type', [0, 0, 1]],
      ['::before', 'pseudo-element', [0, 0, 1]],
    ]);
    const first = r.parts[0];
    expect(first && [first.start, first.end]).toEqual([0, 4]);
  });

  it('explains :where() and the most-specific-argument rule', () => {
    const where = one(':where(#a)').parts[0];
    expect(where?.note).toMatch(/always adds zero/);
    const is = one(':is(.a, #b)').parts[0];
    expect(is?.kind).toBe('functional');
    expect(is?.note).toMatch(/`#b` \(1,0,0\)/);
    expect(is?.note).toMatch(/only match a less specific argument/);
  });

  it('keeps positions relative to the original input, including leading spaces', () => {
    const r = one('   .a #b');
    expect(r.parts.map((p) => [p.start, p.end, p.text])).toEqual([
      [3, 5, '.a'],
      [5, 6, ' '],
      [6, 8, '#b'],
    ]);
  });

  it('returns frozen results', () => {
    const r = one('.a');
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.value)).toBe(true);
    expect(Object.isFrozen(r.parts)).toBe(true);
  });
});

describe('specificity: edge cases', () => {
  it('rejects empty input with a prompt', () => {
    const r = calculate('');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toBe('Type a selector to see its specificity.');
  });

  it('treats whitespace-only input like empty input', () => {
    const r = calculate('   \n\t ');
    expect(!r.ok && r.error.message).toBe('Type a selector to see its specificity.');
  });

  it('reports the character of an unexpected token', () => {
    const r = calculate('.menu a)');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toEqual({
      message: "This selector couldn't be parsed: unexpected `)` at character 8.",
      position: 7,
    });
  });

  it('reports input that ends too early', () => {
    const r = calculate('ul >');
    expect(!r.ok && r.error.message).toMatch(/ends too early/);
  });

  it('never throws on garbage', () => {
    for (const s of ['{', '}', '(((', '[a=', '"', '\\', '#', '.', '::', ':not(', 'a,,b', '@media', '<>']) {
      expect(() => calculate(s)).not.toThrow();
      expect(calculate(s).ok).toBe(false);
    }
  });

  it('warns when a pseudo-element is not last', () => {
    const r = one('a::before.x');
    expect(r.warnings.join(' ')).toMatch(/must come last/);
  });

  it('allows a pseudo-class after ::part()', () => {
    expect(one('x-foo::part(label):hover').warnings).toEqual([]);
  });

  it('counts unknown pseudo-classes but flags them', () => {
    const r = one('a:totally-made-up');
    expect(r.value).toEqual([0, 1, 1]);
    expect(r.warnings[0]).toMatch(/isn't a known pseudo-class/);
    expect(r.parts[1]?.note).toMatch(/isn't a known pseudo-class/);
  });

  it('does not flag vendor-prefixed pseudo-classes', () => {
    expect(one('input:-webkit-autofill').warnings).toEqual([]);
  });

  it('handles escaped characters', () => {
    const r = one('#\\31 23');
    expect(r.value).toEqual([1, 0, 0]);
    expect(r.parts[0]?.text).toBe('#\\31 23');
  });

  it('handles attribute values containing , and )', () => {
    const r = calculate('[data-x="a,b)"], .y');
    expect(r.ok && r.value.map((x) => x.value)).toEqual([
      [0, 1, 0],
      [0, 1, 0],
    ]);
  });

  it('caps input at 1,000 characters', () => {
    const long = '.a'.repeat(501);
    const r = calculate(long);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toMatch(/limit is 1,000/);
    expect(calculate('.a'.repeat(MAX_SELECTOR_LENGTH / 2)).ok).toBe(true);
  });

  it('supports Unicode and emoji identifiers', () => {
    expect(one('.🎉').value).toEqual([0, 1, 0]);
    expect(one('#café .ünïcode').value).toEqual([1, 1, 0]);
    expect(one('.🎉 #a').parts.map((p) => p.text)).toEqual(['.🎉', ' ', '#a']);
  });

  it('treats an empty :is() as zero', () => {
    expect(one(':is()').value).toEqual([0, 0, 0]);
    expect(one(':is()').parts[0]?.note).toMatch(/Empty argument list/);
  });

  it('forgives invalid arguments inside :is() and :where()', () => {
    const r = one(':is(.a, 12px, #b) p');
    expect(r.value).toEqual([1, 0, 1]);
    expect(r.warnings.join(' ')).toMatch(/skip arguments/);
    const empty = one(':where(a, )');
    expect(empty.value).toEqual([0, 0, 0]);
    expect(empty.warnings.join(' ')).toMatch(/empty argument/);
  });

  it('keeps offsets stable when forgiving lists', () => {
    const { text, dropped } = forgiveLists(':where(a, , b)');
    expect(text).toHaveLength(':where(a, , b)'.length);
    expect(dropped).toEqual(['']);
  });

  it('flags a bare & outside nesting', () => {
    const r = one('& .a');
    expect(r.warnings.join(' ')).toMatch(/nested CSS/);
  });
});

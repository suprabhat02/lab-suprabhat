import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_CSS } from '../model';
import { displayValue } from '../metrics';
import { parseStylesheet } from '../parse';
import { decodeState, encodeState, MAX_CSS_BYTES, MAX_SHARED_CSS_BYTES } from '../share';
import type { IssueCode } from '../types';

function audit(css: string) {
  const result = analyze(css);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('stylesheet parsing', () => {
  it.each([
    ['type', 'a {}', 'a', [0, 0, 1]],
    ['class', '.a {}', '.a', [0, 1, 0]],
    ['ID', '#a {}', '#a', [1, 0, 0]],
    ['where', ':where(#a) {}', ':where(#a)', [0, 0, 0]],
    ['is', ':is(.a, #b) {}', ':is(.a, #b)', [1, 0, 0]],
    ['not', ':not(.a, #b) {}', ':not(.a, #b)', [1, 0, 0]],
    ['explicit nesting', '.a { & .b {} }', '.a .b', [0, 2, 0]],
    ['implicit nesting', '.a { .b {} }', '.a .b', [0, 2, 0]],
    ['type nesting', '.a { span:hover {} }', '.a span:hover', [0, 2, 1]],
    ['leading combinator', '.a { > a {} }', '.a > a', [0, 1, 1]],
    ['non-leading ampersand', '.a { .theme & {} }', '.theme .a', [0, 2, 0]],
    ['parent list', '#a, .b { & p {} }', ':is(#a, .b) p', [1, 0, 1]],
    ['multiple levels', '.a { .b { & .c {} } }', '.a .b .c', [0, 3, 0]],
    ['attribute ampersand', '.a { [data-x="&"] {} }', '.a [data-x="&"]', [0, 2, 0]],
    ['pseudo argument ampersand', '.a { :is(&, .b) {} }', ':is(.a, .b)', [0, 1, 0]],
  ])('%s', (_title, css, selector, value) => {
    const result = audit(String(css));
    expect(result.entries.at(-1)?.selector).toBe(selector);
    expect(result.entries.at(-1)?.specificity).toEqual(value);
  });

  it('preserves lines including multiline selector lists and nesting', () => {
    const result = audit('/* heading */\n.a {\n  /* nested */\n  .b { color:red }\n}\n.c {}');
    expect(result.entries.map((entry) => entry.line)).toEqual([2, 4, 6]);
  });
  it('keeps conditional context chains', () => {
    const result = audit('@media screen { @supports (display: grid) { @container (width > 1px) { a {} } } }');
    expect(result.entries[0]?.context).toEqual([
      '@media screen',
      '@supports (display: grid)',
      '@container (width > 1px)',
    ]);
  });
  it('locates each selector in a multiline selector list', () => {
    expect(audit('.a,\n.b,\n  .c {}').entries.map((entry) => entry.line)).toEqual([1, 2, 3]);
  });
  it('retains nested conditional declarations in source order', () => {
    const result = audit('.a { color:red; @media screen { color:blue; .b {} } color:green; }');
    expect(result.entries.map((entry) => [entry.selector, entry.declarations, entry.context])).toEqual([
      ['.a', 1, []],
      ['.a', 1, ['@media screen']],
      ['.a .b', 0, ['@media screen']],
      ['.a', 1, []],
    ]);
  });
  it('counts declarations without duplicating important declarations per selector', () => {
    const result = audit('a,b { color:red!important; margin:0 !IMPORTANT; content:"!important"; }');
    expect(result.metrics.important).toBe(2);
    expect(result.metrics.rules).toBe(1);
    expect(result.entries.map((entry) => entry.declarations)).toEqual([3, 3]);
  });
  it('ignores important text inside values and comments', () => {
    expect(audit('a { content:"!important"; /* !important */ }').metrics.important).toBe(0);
  });
  it('does not mistake braces in custom properties, strings or URLs for rules', () => {
    expect(audit('a { --data: { x:1 }; content:"}"; background:url("x{y}"); }').entries).toHaveLength(1);
  });
  it('records ordered named, empty, nested and anonymous layers and unlayered entries', () => {
    const result = audit(
      '@layer a,b,empty; @layer b { @layer child { .b {} } } @layer a.x { .a{} } @layer {.c{}} @layer {.d{}} p{}',
    );
    expect(result.layers).toEqual(['a', 'a.x', 'b', 'b.child', 'empty', '(anonymous 1)', '(anonymous 2)']);
    expect(result.entries.map((entry) => entry.layer)).toEqual([
      'b.child',
      'a.x',
      '(anonymous 1)',
      '(anonymous 2)',
      null,
    ]);
  });
  it('does not reorder a layer on subsequent use', () => {
    expect(audit('@layer b {.b{}} @layer a,b; @layer b{.c{}}').layers).toEqual(['b', 'a']);
  });
  it('normalizes escaped layer identifiers without confusing escaped dots with sublayers', () => {
    const result = audit('@layer \\61, a\\.b; @layer a{p{}} @layer a\\.b{b{}}');
    expect(result.layers).toEqual(['a', 'a\\.b']);
    expect(result.entries.map((entry) => entry.layer)).toEqual(['a', 'a\\.b']);
  });
  it('bounds quadratic layer-path expansion even below the CSS byte cap', () => {
    const result = parseStylesheet(`@layer ${'a.'.repeat(10000)}a;`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Expanded layer paths exceed 100 KB');
  });
  it('counts zero selectors for comments or descriptor-only input', () => {
    expect(audit('/* no rules */').metrics.selectors).toBe(0);
    const result = audit(
      '@font-face { font-family:x; src:url(x); } @keyframes spin { from{opacity:0} to{opacity:1} }',
    );
    expect(result.entries).toHaveLength(0);
    expect(result.notes).toHaveLength(2);
  });
  it('does not fetch imports and reports that they are not audited', () => {
    const result = audit(
      '@import url(https://example.test/x.css); a { background:url(https://example.test/x.png); }',
    );
    expect(result.entries).toHaveLength(1);
    expect(result.notes[0]).toContain('never fetched');
  });
  it.each(['', '   ', 'a {', 'a{} }', '/* open', 'a{color:red', 'a{color}', 'a:where( {}', '@layer a,,b;'])(
    'rejects malformed CSS: %s',
    (css) => {
      expect(parseStylesheet(css).ok).toBe(false);
    },
  );
  it('caps input before parsing, measured in UTF-8 bytes', () => {
    expect(parseStylesheet('/*' + 'x'.repeat(MAX_CSS_BYTES - 4) + '*/').ok).toBe(true);
    const result = parseStylesheet('é'.repeat(MAX_CSS_BYTES / 2 + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('100 KB');
  });
  it('reports exactly the first 5000 entries without a false truncation at the boundary', () => {
    expect(audit('.a{}'.repeat(5000)).truncated).toBe(false);
    const result = audit('.a{}'.repeat(5001));
    expect(result.entries).toHaveLength(5000);
    expect(result.truncated).toBe(true);
    expect(result.entries.at(-1)?.index).toBe(4999);
  });
});

describe('metrics and findings', () => {
  it('uses real triple ordering for maximum and lower median, not the display scale', () => {
    const result = audit('a{} .a{} .a.b.c.d.e.f.g.h.i.j.k{} #x{}').metrics;
    expect(result.maximum?.selector).toBe('#x');
    expect(result.median).toEqual([0, 1, 0]);
    expect(result.histogram).toEqual({ zero: 0, type: 1, class: 2, id: 1 });
    expect(displayValue([2, 20, 20])).toBe(299);
  });
  it('handles a zero-weight distribution and empty statistics', () => {
    expect(audit(':where(#a){} *{}').metrics.histogram.zero).toBe(2);
    expect(audit('/* none */').metrics.maximum).toBeNull();
    expect(audit('/* none */').metrics.median).toBeNull();
  });
  const cases: [IssueCode, string, boolean][] = [
    ['id-selector', '#x{}', true],
    ['id-selector', ':where(#x){}', false],
    ['important', 'a{color:red!important}', true],
    ['important', 'a{content:"!important"}', false],
    ['deep-selector', 'a b c d e{}', true],
    ['deep-selector', 'a b c d{}', false],
    ['duplicate-selector', '.x{}\n.x{}', true],
    ['duplicate-selector', '@layer a{.x{}} @layer b{.x{}}', false],
    ['duplicate-selector', '@media screen{.x{}} @media print{.x{}}', false],
    ['specificity-spike', '#x{} .a{} b{}', true],
    ['specificity-spike', '#x{} #y{}', false],
    ['specificity-spike', '#x{}', false],
    ['specificity-spike', '.a{} #x{}', false],
  ];
  it.each(cases)('%s in %s is %s', (code, css, fires) => {
    expect(audit(css).issues.findings.some((finding) => finding.code === code)).toBe(fires);
  });
  it('requires every following entry within the ten-entry window to be lower', () => {
    expect(
      audit('#x{} .a{} #y{}').issues.findings.some(
        (finding) => finding.code === 'specificity-spike' && finding.entries[0] === 0,
      ),
    ).toBe(false);
    const result = audit('#x{} ' + '.a{}'.repeat(10) + '#y{}');
    expect(
      result.issues.findings.some(
        (finding) => finding.code === 'specificity-spike' && finding.entries[0] === 0,
      ),
    ).toBe(true);
  });
  it('lists duplicate lines and caps findings with an exact omitted count', () => {
    expect(
      audit('.x{}\n\n.x{}').issues.findings.find((finding) => finding.code === 'duplicate-selector')?.message,
    ).toContain('1, 3');
    const result = audit(Array.from({ length: 250 }, (_, index) => `#x${index}{}`).join(''));
    expect(result.issues.findings).toHaveLength(200);
    expect(result.issues.omitted).toBe(50);
  });
  it('provides a complete teaching example', () => {
    const result = audit(DEFAULT_CSS);
    expect(result.metrics.selectors).toBe(7);
    expect(result.metrics.important).toBe(1);
    expect(result.layers).toEqual(['base', 'components']);
  });
});

describe('private share links', () => {
  it.each(['a{color:red}', '/* 雪 */ .a{}', 'a{content:"\\\\\\""}'])('round trips %s', (css) => {
    const encoded = encodeState({ v: 1, css });
    expect(encoded.ok).toBe(true);
    if (encoded.ok) expect(decodeState(encoded.value)).toEqual({ ok: true, value: { v: 1, css } });
  });
  it('limits CSS rather than the escaped JSON envelope', () => {
    const css = '\\'.repeat(MAX_SHARED_CSS_BYTES);
    const encoded = encodeState({ v: 1, css });
    expect(encoded.ok).toBe(true);
    if (encoded.ok) expect(decodeState(encoded.value).ok).toBe(true);
    expect(encodeState({ v: 1, css: css + 'x' }).ok).toBe(false);
  });
  it.each(['', '!', '====', 'a', 'eyJ2IjoyLCJjc3MiOiJhIn0', 'eyJ2IjoxLCJjc3MiOjV9', 'bnVsbA', 'W10'])(
    'rejects invalid/tampered state %s',
    (encoded) => {
      expect(decodeState(encoded).ok).toBe(false);
    },
  );
});

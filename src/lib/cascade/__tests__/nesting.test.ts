import { describe, expect, it } from 'vitest';
import { expandNesting, expandSelector, MAX_NESTING_LENGTH } from '../nesting';
import { calculate } from '../specificity';
import type { NestingOutput } from '../nesting';

function expand(css: string): NestingOutput {
  const r = expandNesting(css);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const selectorsOf = (css: string) => expand(css).rules.map((r) => r.selector);

describe('nesting expander', () => {
  it('`.a, #b { & .c {} }` → `:is(.a, #b) .c` → (1,1,0)', () => {
    const out = expand('.a, #b { & .c {} }');
    expect(out.rules.map((r) => r.selector)).toEqual(['.a, #b', ':is(.a, #b) .c']);
    const nested = calculate(out.rules[1]?.selector ?? '');
    expect(nested.ok && nested.value[0]?.value).toEqual([1, 1, 0]);
  });

  it('treats a nested rule without & as `& <rule>`', () => {
    expect(selectorsOf('.a { .b { color: red } }')).toEqual(['.a', '.a .b']);
    expect(selectorsOf('.a, #b { .c {} }')).toEqual(['.a, #b', ':is(.a, #b) .c']);
  });

  it('handles a leading combinator in an implicit nested rule', () => {
    expect(selectorsOf('.list { > li {} }')).toEqual(['.list', '.list > li']);
  });

  it('expands multi-level nesting', () => {
    expect(selectorsOf('.a { .b { & .c {} } }')).toEqual(['.a', '.a .b', '.a .b .c']);
    expect(selectorsOf('.a, .b { .c { .d {} } }')).toEqual(['.a, .b', ':is(.a, .b) .c', ':is(.a, .b) .c .d']);
  });

  it('handles & in the middle or end of a selector (`.x &`)', () => {
    expect(selectorsOf('.a { .x & {} }')).toEqual(['.a', '.x .a']);
    expect(selectorsOf('.a .b { .x & {} }')).toEqual(['.a .b', '.x :is(.a .b)']);
    expect(selectorsOf('.a, .b { .x & {} }')).toEqual(['.a, .b', '.x :is(.a, .b)']);
  });

  it('handles compound &.b', () => {
    expect(selectorsOf('.a { &.b {} }')).toEqual(['.a', '.a.b']);
    expect(selectorsOf('.a .x { &.b {} }')).toEqual(['.a .x', '.a .x.b']);
    expect(selectorsOf('.a, #b { &:hover {} }')).toEqual(['.a, #b', ':is(.a, #b):hover']);
  });

  it('wraps a type parent in :is() when & is glued after another simple selector', () => {
    expect(selectorsOf('div { .x& {} }')).toEqual(['div', '.x:is(div)']);
    expect(selectorsOf('.a { .x& {} }')).toEqual(['.a', '.x.a']);
  });

  it('expands nested selector lists', () => {
    expect(selectorsOf('.a { & .b, & .c {} }')).toEqual(['.a', '.a .b, .a .c']);
  });

  it('ignores & inside strings', () => {
    expect(expandSelector(['.a'], '[data-x="&"]')).toEqual(['.a [data-x="&"]']);
  });

  it('notes that nested @media can change the order of appearance', () => {
    const out = expand('.a { color: red; @media (width > 40em) { color: blue } }');
    expect(out.rules.map((r) => [r.selector, r.atRules, r.declarations])).toEqual([
      ['.a', [], 'color: red'],
      ['.a', ['@media (width > 40em)'], 'color: blue'],
    ]);
    expect(out.notes.join(' ')).toMatch(/order of appearance/);
  });

  it('keeps @supports context for nested style rules', () => {
    const out = expand('@supports (display: grid) { .a { .b {} } }');
    expect(out.rules.map((r) => [r.selector, r.atRules])).toEqual([
      ['.a', ['@supports (display: grid)']],
      ['.a .b', ['@supports (display: grid)']],
    ]);
  });

  it('collects declarations and ignores comments', () => {
    const out = expand('/* hi */ .a { color: red; /* note */ margin: 0 }');
    expect(out.rules[0]?.declarations).toBe('color: red; margin: 0');
  });

  it('records depth', () => {
    expect(expand('.a { .b { .c {} } }').rules.map((r) => r.depth)).toEqual([0, 1, 2]);
  });

  it('reports unbalanced braces with positions', () => {
    const missing = expandNesting('.a { .b { }');
    expect(!missing.ok && missing.error.message).toMatch(/never closed/);
    const extra = expandNesting('.a { } }');
    expect(!extra.ok && extra.error).toEqual({
      message: "Unexpected `}` at character 8: there's no rule to close.",
      position: 7,
    });
  });

  it('rejects empty input, missing selectors and oversized input', () => {
    expect(expandNesting('   ').ok).toBe(false);
    expect(expandNesting('{ color: red }').ok).toBe(false);
    expect(expandNesting('color: red;').ok).toBe(false);
    expect(expandNesting('.a {}'.repeat(MAX_NESTING_LENGTH)).ok).toBe(false);
  });

  it('turns a top-level & into :scope', () => {
    const out = expand('& .a {}');
    expect(out.rules[0]?.selector).toBe(':scope .a');
    expect(out.notes.join(' ')).toMatch(/:scope/);
  });
});

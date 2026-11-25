import { describe, expect, it } from 'vitest';
import { renderToString, rich } from '../h';

const html = (text: string) => rich(text).map(renderToString).join('');

describe('rich', () => {
  it('wraps backticks, triples and identifiers in code', () => {
    expect(html('Wrap `.a` in :where(#id) so it scores (0,0,0).')).toBe(
      'Wrap <code>.a</code> in <code>:where(#id)</code> so it scores <code>(0,0,0)</code>.',
    );
    expect(html('There is no aria-labelledby reference; use label[for] or [id="x"].')).toBe(
      'There is no <code>aria-labelledby</code> reference; use <code>label[for]</code> or <code>[id="x"]</code>.',
    );
    expect(html('Does @layer beat #nav or .menu?')).toBe(
      'Does <code>@layer</code> beat <code>#nav</code> or <code>.menu</code>?',
    );
  });

  it('leaves ordinary prose, numbers and URLs alone', () => {
    const prose = 'Line 12: 1 ID beats 0. See lab.suprabhat-dev.com at 20:48, e.g. step 2B: content.';
    expect(html(prose)).toBe(prose);
  });
});

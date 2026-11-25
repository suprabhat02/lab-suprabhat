import { describe, expect, it } from 'vitest';
import {
  decodeState,
  encodeState,
  MAX_MARKUP_BYTES,
  readState,
  SHARE_VERSION,
  validateMarkup,
} from '../share';
import type { ShareState } from '../share';

describe('accessible name share links', () => {
  it('round-trips Unicode markup and the selected element', () => {
    const state: ShareState = { v: SHARE_VERSION, html: '<button>Search \u{1f50e}</button>', element: 2 };
    const encoded = encodeState(state);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) throw new Error(encoded.error.message);
    expect(decodeState(encoded.value)).toEqual({ ok: true, value: state });
  });

  it('caps markup at exactly 4096 UTF-8 bytes, including JSON escaping', () => {
    for (const html of [
      'x'.repeat(MAX_MARKUP_BYTES),
      '"'.repeat(MAX_MARKUP_BYTES),
      '\u00e9'.repeat(MAX_MARKUP_BYTES / 2),
    ]) {
      const state: ShareState = { v: SHARE_VERSION, html, element: 0 };
      const encoded = encodeState(state);
      if (!encoded.ok) throw new Error(encoded.error.message);
      expect(decodeState(encoded.value)).toEqual({ ok: true, value: state });
      expect(validateMarkup(html + 'x').ok).toBe(false);
      expect(encodeState({ ...state, html: html + 'x' }).ok).toBe(false);
    }
  });

  it.each(['', '%%%bad', 'a', 'abcd=', 'A'.repeat(40000), btoa('{'), '_w'])(
    'rejects malformed payload %s',
    (value) => {
      expect(decodeState(value).ok).toBe(false);
    },
  );

  it.each([
    null,
    [],
    { v: 2, html: '', element: 0 },
    { v: 1, html: 5, element: 0 },
    { v: 1, html: '', element: -1 },
    { v: 1, html: '', element: 0.5 },
    { v: 1, html: '', element: '0' },
    { v: 1, html: 'x'.repeat(4097), element: 0 },
  ])('rejects tampered state %j', (value) => {
    expect(readState(value)).toBeNull();
    const encoded = btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(decodeState(encoded).ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, MAX_SHARE_BYTES, readState } from '../share';
import type { ShareState } from '../share';

const state: ShareState = {
  v: 1,
  mode: 'cascade',
  inputs: {
    selectors: ['#nav a', '.menu .link:hover', '.🎉 [data-x="a,b)"]'],
    nesting: '.a, #b { & .c {} }',
    cascade: {
      property: 'color',
      layerOrder: ['base', 'components'],
      rows: [
        { selector: 'p', value: 'red', important: false, inline: false, layer: null, scope: null, order: 1 },
        {
          selector: '.card p',
          value: 'blue',
          important: true,
          inline: false,
          layer: 'components',
          scope: { root: '.card', proximity: 2 },
          order: 2,
        },
      ],
    },
  },
};

function encode(s: unknown): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(s))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('share state', () => {
  it('round-trips', () => {
    const encoded = encodeState(state);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.value).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = decodeState(encoded.value);
    expect(decoded).toEqual({ ok: true, value: state });
  });

  it('rejects a tampered payload', () => {
    const encoded = encodeState(state);
    if (!encoded.ok) throw new Error('encode failed');
    const flipped = `${encoded.value.slice(0, 10)}${encoded.value[10] === 'A' ? 'B' : 'A'}${encoded.value.slice(11)}`;
    expect(decodeState(flipped).ok).toBe(false);
    expect(decodeState(`${encoded.value}!`).ok).toBe(false);
    expect(decodeState('not base64 at all').ok).toBe(false);
  });

  it('rejects valid JSON with the wrong shape', () => {
    const bad = { ...state, inputs: { ...state.inputs, selectors: ['only one'] } };
    expect(decodeState(encode(bad)).ok).toBe(false);
    expect(decodeState(encode({ ...state, mode: 'evil' })).ok).toBe(false);
    expect(decodeState(encode([1, 2, 3])).ok).toBe(false);
    const badLayer = structuredClone(state) as unknown as { inputs: { cascade: { layerOrder: string[] } } };
    badLayer.inputs.cascade.layerOrder = ['<script>'];
    expect(decodeState(encode(badLayer)).ok).toBe(false);
  });

  it('rejects an oversized payload before parsing it', () => {
    const big = { ...state, inputs: { ...state.inputs, nesting: 'x'.repeat(MAX_SHARE_BYTES) } };
    expect(encodeState(big).ok).toBe(false);
    const decoded = decodeState('A'.repeat(MAX_SHARE_BYTES * 2));
    expect(decoded.ok).toBe(false);
    expect(!decoded.ok && decoded.error.message).toMatch(/too large/);
  });

  it('rejects a wrong version', () => {
    const decoded = decodeState(encode({ ...state, v: 2 }));
    expect(decoded.ok).toBe(false);
    expect(!decoded.ok && decoded.error.message).toMatch(/different version/);
  });

  it('drops unknown keys and does not keep prototypes', () => {
    const withExtra = JSON.parse(`{"__proto__":{"polluted":true},"extra":1,${JSON.stringify(state).slice(1)}`) as unknown;
    const read = readState(withExtra);
    expect(read).toEqual(state);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(read && 'extra' in read).toBe(false);
  });

  it('returns a calm message on failure', () => {
    const decoded = decodeState('%%%');
    expect(!decoded.ok && decoded.error.message).toBe(
      "This link's settings couldn't be read, so the default example is shown instead.",
    );
  });
});

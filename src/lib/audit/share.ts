import { err, ok } from '../cascade/types';
import type { Result } from '../cascade/types';

export const SHARE_VERSION = 1;
export const MAX_CSS_BYTES = 100 * 1024;
export const MAX_SHARED_CSS_BYTES = 8 * 1024;
const MAX_ENVELOPE_BYTES = MAX_SHARED_CSS_BYTES * 6 + 64;
export interface ShareState {
  readonly v: typeof SHARE_VERSION;
  readonly css: string;
}

export function validateCss(css: string, share = false): Result<string> {
  if (new TextEncoder().encode(css).length > (share ? MAX_SHARED_CSS_BYTES : MAX_CSS_BYTES))
    return err(
      share
        ? 'Copy link is unavailable above 8 KB of CSS. Shorten the input to share it.'
        : 'CSS is limited to 100 KB. Shorten the input and try again.',
    );
  return ok(css);
}

export function readState(value: unknown): ShareState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('v' in value) || value.v !== SHARE_VERSION || !('css' in value) || typeof value.css !== 'string')
    return null;
  return validateCss(value.css, true).ok ? { v: SHARE_VERSION, css: value.css } : null;
}

export function encodeState(state: ShareState): Result<string> {
  const valid = validateCss(state.css, true);
  if (!valid.ok) return valid;
  const clean = readState(state);
  if (!clean) return err('This audit cannot be shared: invalid state.');
  const bytes = new TextEncoder().encode(JSON.stringify(clean));
  return ok(
    btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  );
}

export function decodeState(encoded: string): Result<ShareState> {
  const invalid = () => err('This link could not be read. The default stylesheet is shown instead.');
  if (
    !encoded ||
    encoded.length > Math.ceil((MAX_ENVELOPE_BYTES * 4) / 3) ||
    !/^[A-Za-z0-9_-]+$/.test(encoded)
  )
    return invalid();
  let value: unknown;
  try {
    const binary = atob(
      encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4),
    );
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (bytes.length > MAX_ENVELOPE_BYTES) return invalid();
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return invalid();
  }
  const state = readState(value);
  return state ? ok(state) : invalid();
}

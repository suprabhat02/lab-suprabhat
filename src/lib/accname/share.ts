import { err, ok } from '../cascade/types';
import type { Result } from '../cascade/types';

export const SHARE_VERSION = 1;
export const MAX_MARKUP_BYTES = 4096;
export const MAX_SHARE_BYTES = MAX_MARKUP_BYTES * 6 + 128;
const MAX_ENCODED_LENGTH = Math.ceil((MAX_SHARE_BYTES * 4) / 3);

export interface ShareState {
  readonly v: typeof SHARE_VERSION;
  readonly html: string;
  readonly element: number;
}

export function validateMarkup(html: string): Result<string> {
  if (new TextEncoder().encode(html).length > MAX_MARKUP_BYTES) {
    return err('HTML is limited to 4 KB. Shorten the markup and try again.');
  }
  return ok(html);
}

export function readState(value: unknown): ShareState | null {
  const isRecord = (input: unknown): input is Record<string, unknown> =>
    typeof input === 'object' && input !== null && !Array.isArray(input);
  if (!isRecord(value)) return null;
  const data = value;
  if (
    data['v'] !== SHARE_VERSION ||
    typeof data['html'] !== 'string' ||
    !validateMarkup(data['html']).ok ||
    typeof data['element'] !== 'number' ||
    !Number.isInteger(data['element']) ||
    data['element'] < 0 ||
    data['element'] > MAX_MARKUP_BYTES
  )
    return null;
  return { v: SHARE_VERSION, html: data['html'], element: data['element'] };
}

export function encodeState(state: ShareState): Result<string> {
  const valid = validateMarkup(state.html);
  if (!valid.ok) return valid;
  const clean = readState(state);
  if (!clean) return err('This selection cannot be shared. Choose an element and try again.');
  const bytes = new TextEncoder().encode(JSON.stringify(clean));
  return ok(
    btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  );
}

export function decodeState(encoded: string): Result<ShareState> {
  const invalid = () => err('This link could not be read. The default example is shown instead.');
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) return invalid();
  let value: unknown;
  try {
    const binary = atob(
      encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4),
    );
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (bytes.length > MAX_SHARE_BYTES) return invalid();
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return invalid();
  }
  const state = readState(value);
  return state ? ok(state) : invalid();
}

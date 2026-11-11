import { MAX_NESTING_LENGTH } from './nesting';
import { err, ok } from './types';
import type { Result } from './types';

export const SHARE_VERSION = 1;
/** Maximum size of the decoded JSON payload, in bytes. */
export const MAX_SHARE_BYTES = 4096;
const MAX_ENCODED_LENGTH = Math.ceil((MAX_SHARE_BYTES * 4) / 3);
const MAX_SELECTOR = 1000;

export type Mode = 'anatomy' | 'nesting' | 'cascade';
export const MODES: readonly Mode[] = ['anatomy', 'nesting', 'cascade'];

export interface CascadeRow {
  readonly selector: string;
  readonly value: string;
  readonly important: boolean;
  readonly inline: boolean;
  readonly layer: string | null;
  readonly scope: { readonly root: string; readonly proximity: number } | null;
  readonly order: number;
}

export interface CascadeFormState {
  readonly property: string;
  readonly layerOrder: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<CascadeRow>;
}

export interface AppInputs {
  readonly selectors: ReadonlyArray<string>;
  readonly nesting: string;
  readonly cascade: CascadeFormState;
}

export interface ShareState {
  readonly v: typeof SHARE_VERSION;
  readonly mode: Mode;
  readonly inputs: AppInputs;
}

export const LIMITS = {
  selectors: { min: 2, max: 8 },
  rows: { min: 2, max: 4 },
  layers: 8,
  layerName: 40,
  value: 200,
  property: 60,
  scopeRoot: 200,
  proximity: 99,
  order: 99,
} as const;

export const LAYER_NAME = /^[A-Za-z_-][\w-]*(?:\.[A-Za-z_-][\w-]*)*$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isMode = (v: unknown): v is Mode => typeof v === 'string' && (MODES as readonly string[]).includes(v);
const isString = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function readRow(v: unknown): CascadeRow | null {
  if (!isRecord(v)) return null;
  const { selector, value, important, inline, layer, scope, order } = v;
  if (!isString(selector, MAX_SELECTOR) || !isString(value, LIMITS.value)) return null;
  if (typeof important !== 'boolean' || typeof inline !== 'boolean') return null;
  if (!(layer === null || (isString(layer, LIMITS.layerName) && LAYER_NAME.test(layer)))) return null;
  if (!isInt(order, 1, LIMITS.order)) return null;
  let readScope: CascadeRow['scope'] = null;
  if (scope !== null) {
    if (!isRecord(scope) || !isString(scope['root'], LIMITS.scopeRoot) || !isInt(scope['proximity'], 0, LIMITS.proximity)) {
      return null;
    }
    readScope = { root: scope['root'], proximity: scope['proximity'] };
  }
  return { selector, value, important, inline, layer, scope: readScope, order };
}

/** Hand-written type guard: rebuilds a clean object from untrusted JSON, or returns null. */
export function readState(v: unknown): ShareState | null {
  if (!isRecord(v) || v['v'] !== SHARE_VERSION) return null;
  const mode = v['mode'];
  if (!isMode(mode)) return null;
  const inputs = v['inputs'];
  if (!isRecord(inputs)) return null;

  const selectors = inputs['selectors'];
  if (
    !Array.isArray(selectors) ||
    selectors.length < LIMITS.selectors.min ||
    selectors.length > LIMITS.selectors.max ||
    !selectors.every((s): s is string => isString(s, MAX_SELECTOR))
  ) {
    return null;
  }
  const nesting = inputs['nesting'];
  if (!isString(nesting, MAX_NESTING_LENGTH)) return null;

  const cascade = inputs['cascade'];
  if (!isRecord(cascade)) return null;
  const { property, layerOrder, rows } = cascade;
  if (!isString(property, LIMITS.property)) return null;
  if (
    !Array.isArray(layerOrder) ||
    layerOrder.length > LIMITS.layers ||
    !layerOrder.every((l): l is string => isString(l, LIMITS.layerName) && LAYER_NAME.test(l))
  ) {
    return null;
  }
  if (!Array.isArray(rows) || rows.length < LIMITS.rows.min || rows.length > LIMITS.rows.max) return null;
  const readRows = rows.map(readRow);
  if (!readRows.every((r): r is CascadeRow => r !== null)) return null;

  return {
    v: SHARE_VERSION,
    mode,
    inputs: {
      selectors: [...selectors],
      nesting,
      cascade: { property, layerOrder: [...layerOrder], rows: readRows },
    },
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeState(state: ShareState): Result<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  if (bytes.length > MAX_SHARE_BYTES) {
    return err('This setup is too large to share as a link. Shorten the inputs and copy the link again.');
  }
  return ok(toBase64Url(bytes));
}

const UNREADABLE = "This link's settings couldn't be read, so the default example is shown instead.";

/** Validates size, alphabet, encoding, JSON and shape before anything is used. Never evaluates input. */
export function decodeState(param: string): Result<ShareState> {
  if (param.length === 0 || param.length > MAX_ENCODED_LENGTH) {
    return err(param.length > MAX_ENCODED_LENGTH ? "This link's settings are too large to load, so the default example is shown instead." : UNREADABLE);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(param)) return err(UNREADABLE);
  const bytes = fromBase64Url(param);
  if (!bytes || bytes.length > MAX_SHARE_BYTES) return err(UNREADABLE);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return err(UNREADABLE);
  }
  if (isRecord(json) && json['v'] !== SHARE_VERSION) {
    return err("This link was made with a different version of the tool, so the default example is shown instead.");
  }
  const state = readState(json);
  return state ? ok(state) : err(UNREADABLE);
}

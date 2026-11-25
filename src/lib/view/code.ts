import { h } from './h';
import type { VElement } from './h';

export function codeBlock(text: string, label: string): VElement {
  return h('pre', { class: 'code', tabindex: 0, role: 'region', 'aria-label': label }, h('code', {}, text));
}

import { attr, flat, tokens } from './tree';
import type { AccNode } from './types';

export type NameFrom = 'author' | 'content' | 'prohibited';

// WAI-ARIA 1.2 sections 5.2.8.4-6, excluding abstract roles.
const AUTHOR =
  'alert alertdialog application article banner blockquote combobox complementary contentinfo definition dialog directory document feed figure form grid group img list listbox listitem log main marquee math meter menu menubar navigation note progressbar radiogroup region rowgroup scrollbar search searchbox separator slider spinbutton status tablist table tabpanel term textbox time timer toolbar tree treegrid';
const CONTENT =
  'button cell checkbox columnheader gridcell heading link menuitem menuitemcheckbox menuitemradio option radio row rowheader switch tab tooltip treeitem';
const PROHIBITED =
  'caption code deletion emphasis generic insertion none paragraph presentation strong subscript superscript';

export const ROLE_NAMES: Readonly<Record<string, NameFrom>> = Object.freeze(
  Object.fromEntries([
    ...AUTHOR.split(' ').map((role) => [role, 'author'] as const),
    ...CONTENT.split(' ').map((role) => [role, 'content'] as const),
    ...PROHIBITED.split(' ').map((role) => [role, 'prohibited'] as const),
  ]),
);

const GLOBAL_ARIA = new Set(
  'atomic busy controls current describedby description details disabled dropeffect errormessage flowto grabbed haspopup hidden invalid keyshortcuts label labelledby live owns relevant roledescription'
    .split(' ')
    .map((key) => `aria-${key}`),
);
const NATIVE_ROLES: Readonly<Record<string, string>> = {
  button: 'button',
  textarea: 'textbox',
  fieldset: 'group',
  table: 'table',
  figure: 'figure',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  nav: 'navigation',
  main: 'main',
  dialog: 'dialog',
  option: 'option',
  li: 'listitem',
  ul: 'list',
  ol: 'list',
  p: 'paragraph',
  article: 'article',
  aside: 'complementary',
  caption: 'caption',
  code: 'code',
  del: 'deletion',
  em: 'emphasis',
  ins: 'insertion',
  strong: 'strong',
  sub: 'subscript',
  sup: 'superscript',
  output: 'status',
  progress: 'progressbar',
  meter: 'meter',
  tr: 'row',
  td: 'cell',
  th: 'columnheader',
  optgroup: 'group',
  svg: 'graphics-document',
};
const INPUT_ROLES: Readonly<Record<string, string>> = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
  hidden: 'none',
  password: 'html-input-password',
  color: 'html-input-color',
  file: 'html-input-file',
  date: 'html-input-date',
  'datetime-local': 'html-input-datetime-local',
  month: 'html-input-month',
  week: 'html-input-week',
  time: 'html-input-time',
};

export function inputType(node: AccNode): string {
  const type = attr(node, 'type')?.toLowerCase() ?? 'text';
  return type in INPUT_ROLES || ['text', 'search', 'tel', 'url', 'email'].includes(type) ? type : 'text';
}

export function isInteractive(node: AccNode): boolean {
  const role = implicitRole(node);
  return (
    (['button', 'link', 'input', 'select', 'textarea', 'summary'].includes(node.tag) &&
      role !== 'generic' &&
      role !== 'none') ||
    [
      'button',
      'checkbox',
      'combobox',
      'link',
      'listbox',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
      'radio',
      'searchbox',
      'slider',
      'spinbutton',
      'switch',
      'tab',
      'textbox',
      'treeitem',
    ].includes(explicitRole(node) ?? '')
  );
}

function explicitRole(node: AccNode): string | undefined {
  return tokens(attr(node, 'role')).find((token) => Object.hasOwn(ROLE_NAMES, token));
}

export function implicitRole(node: AccNode): string {
  if (node.tag === 'a' || node.tag === 'area') return attr(node, 'href') !== undefined ? 'link' : 'generic';
  if (node.tag === 'input') {
    const type = inputType(node);
    if (INPUT_ROLES[type]) return INPUT_ROLES[type];
    const list = attr(node, 'list');
    if (list && node.lookupId(list)?.tag === 'datalist') return 'combobox';
    return type === 'search' ? 'searchbox' : 'textbox';
  }
  if (node.tag === 'select')
    return attr(node, 'multiple') !== undefined || Number(attr(node, 'size')) > 1 ? 'listbox' : 'combobox';
  if (node.tag === 'img') {
    return attr(node, 'alt') !== undefined &&
      flat(attr(node, 'alt') ?? '') === '' &&
      !attr(node, 'aria-label') &&
      !attr(node, 'aria-labelledby') &&
      !attr(node, 'title') &&
      attr(node, 'tabindex') === undefined
      ? 'presentation'
      : 'img';
  }
  if (node.tag === 'summary') {
    return node.parent?.tag === 'details' &&
      node.parent.children.find((child) => child.tag === 'summary') === node
      ? 'html-summary'
      : 'generic';
  }
  if (node.tag === 'section' || node.tag === 'form') {
    const hasAuthorName =
      flat(attr(node, 'aria-label') ?? '') ||
      tokens(attr(node, 'aria-labelledby')).some((id) => node.lookupId(id) !== null) ||
      flat(attr(node, 'title') ?? '');
    return hasAuthorName ? (node.tag === 'section' ? 'region' : 'form') : 'generic';
  }
  return NATIVE_ROLES[node.tag] ?? 'generic';
}

export function roleOf(node: AccNode): string {
  const role = explicitRole(node);
  if (role === 'none' || role === 'presentation') {
    const focusable =
      attr(node, 'tabindex') !== undefined ||
      (attr(node, 'disabled') === undefined &&
        ['button', 'input', 'select', 'textarea'].includes(node.tag) &&
        inputType(node) !== 'hidden') ||
      (node.tag === 'a' && attr(node, 'href') !== undefined) ||
      implicitRole(node) === 'html-summary';
    if (focusable || Object.keys(node.attributes).some((key) => GLOBAL_ARIA.has(key)))
      return implicitRole(node);
  }
  return role ?? implicitRole(node);
}

export function nameFrom(node: AccNode): NameFrom {
  const role = roleOf(node);
  if (role === 'html-summary') return 'content';
  return ROLE_NAMES[role] ?? 'author';
}

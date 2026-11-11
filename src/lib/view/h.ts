/**
 * A tiny view layer: the same view functions render to an HTML string at build time
 * and to DOM nodes in the browser. Text is always escaped or set via text nodes.
 */

export type AttrValue = string | number | boolean | null | undefined;
export type Attrs = Readonly<Record<string, AttrValue>>;

export interface VElement {
  readonly tag: string;
  readonly attrs: Attrs;
  readonly children: ReadonlyArray<VNode>;
}

export type VNode = VElement | string | number | null | undefined | false | ReadonlyArray<VNode>;
type Child = VNode;

const VOID = new Set(['area', 'br', 'col', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr']);
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'g', 'line', 'polyline']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const TAG = /^[a-z][a-z0-9-]*$/;
const ATTR = /^[a-z][a-z0-9-:]*$/i;

function flatten(children: ReadonlyArray<Child>, out: VNode[] = []): VNode[] {
  for (const child of children) {
    if (isFragment(child)) flatten(child, out);
    else if (child !== null && child !== undefined && child !== false && child !== '') out.push(child);
  }
  return out;
}

const isFragment = (node: VNode): node is ReadonlyArray<VNode> => Array.isArray(node);

export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): VElement {
  if (!TAG.test(tag)) throw new Error(`Invalid tag: ${tag}`);
  return { tag, attrs, children: flatten(children) };
}

/** Splits text on backticks and renders the odd segments as `<code>`. */
export function rich(text: string): VNode[] {
  return text.split('`').map((segment, i) => (i % 2 === 1 ? h('code', {}, segment) : segment));
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

export function renderToString(node: VNode): string {
  if (node === null || node === undefined || node === false) return '';
  if (isFragment(node)) return node.map(renderToString).join('');
  if (typeof node === 'string' || typeof node === 'number') return escapeText(String(node));
  let attrs = '';
  for (const [name, value] of Object.entries(node.attrs)) {
    if (!ATTR.test(name) || name.toLowerCase().startsWith('on')) continue;
    if (value === false || value === null || value === undefined) continue;
    attrs += value === true ? ` ${name}` : ` ${name}="${escapeAttr(String(value))}"`;
  }
  if (VOID.has(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${node.children.map(renderToString).join('')}</${node.tag}>`;
}

export function renderToDom(node: VNode, doc: Document = document, svg = false): Node {
  if (node === null || node === undefined || node === false) return doc.createTextNode('');
  if (isFragment(node)) {
    const fragment = doc.createDocumentFragment();
    for (const child of node) fragment.appendChild(renderToDom(child, doc, svg));
    return fragment;
  }
  if (typeof node === 'string' || typeof node === 'number') return doc.createTextNode(String(node));
  const inSvg = svg || node.tag === 'svg';
  const el = inSvg && SVG_TAGS.has(node.tag) ? doc.createElementNS(SVG_NS, node.tag) : doc.createElement(node.tag);
  for (const [name, value] of Object.entries(node.attrs)) {
    if (!ATTR.test(name) || name.toLowerCase().startsWith('on')) continue;
    if (value === false || value === null || value === undefined) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of node.children) el.appendChild(renderToDom(child, doc, inSvg));
  return el;
}

/** Replaces the children of `target` with the rendered nodes. */
export function mount(target: Element, nodes: VNode): void {
  target.replaceChildren(renderToDom(nodes, target.ownerDocument));
}

import type { AccNode } from './types';

interface NodeData<T> {
  tag: string;
  attributes: Readonly<Record<string, string>>;
  text: string;
  children: ReadonlyArray<T>;
}

export function adaptTree<T>(source: T, read: (node: T) => NodeData<T>): AccNode {
  const ids = new Map<string, AccNode>();
  function visit(raw: T, parent: AccNode | null): AccNode {
    const data = read(raw);
    const children: AccNode[] = [];
    const node: AccNode = {
      tag: data.tag,
      attributes: Object.freeze({ ...data.attributes }),
      text: data.text,
      parent,
      children,
      lookupId: (id) => ids.get(id) ?? null,
    };
    const id = node.attributes['id'];
    if (id && !ids.has(id)) ids.set(id, node);
    for (const child of data.children) children.push(visit(child, node));
    Object.freeze(children);
    return Object.freeze(node);
  }
  return visit(source, null);
}

export const flat = (text: string): string => text.replace(/[\t\n\f\r ]+/g, ' ').trim();
export const attr = (node: AccNode, name: string): string | undefined => node.attributes[name];
export const tokens = (text: string | undefined): string[] => text?.trim().split(/\s+/).filter(Boolean) ?? [];
export const textContent = (node: AccNode): string => node.text + node.children.map(textContent).join('');

export function descendants(node: AccNode): AccNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

export function treeRoot(node: AccNode): AccNode {
  return node.parent ? treeRoot(node.parent) : node;
}

export function hiddenSelf(node: AccNode, includeAria = true): boolean {
  const style = (attr(node, 'style') ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  return (
    attr(node, 'hidden') !== undefined ||
    (includeAria && attr(node, 'aria-hidden')?.toLowerCase() === 'true') ||
    (node.tag === 'input' && attr(node, 'type')?.toLowerCase() === 'hidden') ||
    ['script', 'style', 'template', 'head'].includes(node.tag) ||
    /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|content-visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test(
      style,
    )
  );
}

export function isHidden(node: AccNode): boolean {
  return hiddenSelf(node) || (node.parent !== null && isHidden(node.parent));
}

export function isLabelable(node: AccNode): boolean {
  return (
    ['button', 'meter', 'output', 'progress', 'select', 'textarea'].includes(node.tag) ||
    (node.tag === 'input' && attr(node, 'type')?.toLowerCase() !== 'hidden')
  );
}

export function labelsFor(node: AccNode): AccNode[] {
  if (!isLabelable(node)) return [];
  return descendants(treeRoot(node)).filter((candidate) => {
    if (candidate.tag !== 'label') return false;
    const id = attr(candidate, 'for');
    if (id !== undefined) return candidate.lookupId(id) === node;
    return descendants(candidate).find(isLabelable) === node;
  });
}

export function shortSource(node: AccNode): string {
  const id = attr(node, 'id');
  return `${node.tag}${id ? `#${id}` : ''}`;
}

import { adaptTree } from '../tree';
import type { AccNode } from '../types';

export function fromDocument(document: Document): AccNode {
  return adaptTree<Node>(document, (node) => ({
    tag: node.nodeType === 1 ? (node as Element).localName : node.nodeName.toLowerCase(),
    attributes:
      node.nodeType === 1
        ? Object.fromEntries(Array.from((node as Element).attributes, (a) => [a.name, a.value]))
        : {},
    text: node.nodeType === 3 ? (node.nodeValue ?? '') : '',
    children: Array.from(node.childNodes),
  }));
}

export function parseDom(html: string): AccNode {
  return fromDocument(new DOMParser().parseFromString(html, 'text/html'));
}

import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import { adaptTree } from '../tree';
import type { AccNode } from '../types';

export function parseHtml(html: string): AccNode {
  return adaptTree<DefaultTreeAdapterTypes.Node>(parse(html, { scriptingEnabled: false }), (node) => ({
    tag: 'tagName' in node ? node.tagName : node.nodeName,
    attributes: 'attrs' in node ? Object.fromEntries(node.attrs.map((a) => [a.name, a.value])) : {},
    text: 'value' in node ? node.value : '',
    children: 'childNodes' in node ? node.childNodes : [],
  }));
}

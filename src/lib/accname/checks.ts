import { computeName } from './compute';
import { isInteractive, nameFrom } from './role';
import { attr, descendants, flat, hiddenSelf, isHidden, labelsFor, tokens } from './tree';
import type { AccNode, Check, Computation } from './types';

function visibleText(node: AccNode, excluded: AccNode | null = null): string {
  if (node === excluded || hiddenSelf(node, false)) return '';
  return node.text + node.children.map((child) => visibleText(child, excluded)).join('');
}

// WCAG 2.5.3 Understanding: capitalization and ordinary punctuation are not relevant.
export const comparableLabel = (text: string): string =>
  flat(text.toLowerCase().replace(/[.,:;!?…"'“”‘’]/g, ''));

export function checkName(node: AccNode, name: Computation = computeName(node)): ReadonlyArray<Check> {
  const checks: Check[] = [];
  const add = (code: string, message: string, fix: string, snippet: string, wcag: Check['wcag'] = null) =>
    checks.push({ code, message, fix, snippet, wcag });
  if (isInteractive(node) && !isHidden(node) && !name.value) {
    add(
      'empty-name',
      'This interactive element has no accessible name.',
      'Give it a visible label describing its purpose.',
      '<button>Search</button>',
      '4.1.2',
    );
  }
  const missing = tokens(attr(node, 'aria-labelledby')).filter((id) => !node.lookupId(id));
  if (missing.length) {
    add(
      'missing-reference',
      `aria-labelledby references missing IDs: ${missing.join(', ')}.`,
      'Match every reference to an existing, unique ID in the same document.',
      '<span id="search-label">Search</span>\n<button aria-labelledby="search-label"></button>',
    );
  }
  if (
    nameFrom(node) === 'prohibited' &&
    (attr(node, 'aria-label') !== undefined || attr(node, 'aria-labelledby') !== undefined)
  ) {
    add(
      'prohibited-name',
      'This role prohibits author-provided names.',
      'Use an appropriate semantic element; do not label a generic container as if it were a control.',
      '<button aria-label="Search"></button>',
    );
  }
  if (['title', 'placeholder', 'aria-placeholder'].includes(name.source ?? '')) {
    add(
      'fallback-name',
      `The name comes only from ${name.source}.`,
      'Provide a persistent visible label instead of relying on a tooltip or placeholder.',
      '<label for="search">Search</label>\n<input id="search">',
    );
  }
  const labels = labelsFor(node);
  if (labels.length > 1) {
    add(
      'multiple-labels',
      'Several labels name this element; their text is combined in document order.',
      'Keep multiple labels only when the combined name is intentional.',
      '<label for="search">Search the lab</label>\n<input id="search">',
    );
  }
  if (isInteractive(node) && !isHidden(node)) {
    const visible = labels.length
      ? flat(labels.map((label) => visibleText(label, node)).join(' '))
      : flat(visibleText(node)) || attr(node, 'placeholder') || '';
    if (
      visible &&
      comparableLabel(visible) &&
      !comparableLabel(name.value).includes(comparableLabel(visible))
    ) {
      add(
        'label-in-name',
        `The visible label "${visible}" is not contained in the name "${name.value}".`,
        'Keep the visible wording in the accessible name, preferably at the start; verify symbolic text and visual context manually.',
        '<button aria-label="Search the lab">Search</button>',
        '2.5.3',
      );
    }
  }
  const images = descendants(node).filter((child) => child.tag === 'img' && !isHidden(child));
  if (
    ['a', 'button'].includes(node.tag) &&
    images.length === 1 &&
    attr(images[0] ?? node, 'alt') === '' &&
    !flat(visibleText(node))
  ) {
    add(
      'empty-image-label',
      'An image with alt="" is the only content of this link or button.',
      'Name the control or give the image alternative text describing the action.',
      '<button aria-label="Search"><img src="search.svg" alt=""></button>',
      name.value ? null : '4.1.2',
    );
  }
  return checks;
}

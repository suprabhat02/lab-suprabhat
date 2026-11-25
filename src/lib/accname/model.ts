import { err, ok } from '../cascade/types';
import type { Result } from '../cascade/types';
import { computeDescription, computeName } from './compute';
import { checkName } from './checks';
import { nameFrom, roleOf } from './role';
import { validateMarkup } from './share';
import { attr, descendants, shortSource } from './tree';
import type { AccNode, Check, Computation } from './types';

export const DEFAULT_HTML =
  '<label for="q">Search the lab</label>\n<input id="q" type="search" aria-label="Search" placeholder="Type a selector" title="Search tools">';

export interface Analysis {
  readonly elements: ReadonlyArray<AccNode>;
  readonly selected: number;
  readonly node: AccNode;
  readonly role: string;
  readonly name: Computation;
  readonly description: Computation;
  readonly checks: ReadonlyArray<Check>;
  readonly cssUnknown: boolean;
  readonly verdict: string;
}

export const elementLabel = (node: AccNode): string => `${roleOf(node)}: ${shortSource(node).slice(0, 64)}`;

export function analyze(html: string, selected: number, parse: (html: string) => AccNode): Result<Analysis> {
  const valid = validateMarkup(html);
  if (!valid.ok) return valid;
  if (!html.trim()) return err('Paste HTML to find an element and calculate its name.');
  const root = parse(html);
  const all = descendants(root);
  const elements = all.filter(
    (node) =>
      !node.tag.startsWith('#') &&
      (nameFrom(node) !== 'prohibited' ||
        attr(node, 'role') !== undefined ||
        attr(node, 'aria-label') !== undefined ||
        attr(node, 'aria-labelledby') !== undefined),
  );
  if (!elements.length)
    return err(
      'No nameable elements were found. Try a button, link, input, image, or an element with a role.',
    );
  const node = elements[selected];
  if (!node || !Number.isInteger(selected))
    return err('The selected element is not in this HTML. Choose an existing element.');
  const name = computeName(node);
  return ok({
    elements,
    selected,
    node,
    role: roleOf(node),
    name,
    description: computeDescription(node),
    checks: checkName(node, name),
    cssUnknown: all.some((candidate) => candidate.tag === 'style' || attr(candidate, 'class') !== undefined),
    verdict: name.value ? `The name is "${name.value}"` : 'This element has no accessible name',
  });
}

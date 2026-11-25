import { h } from '../view/h';
import type { VElement, VNode } from '../view/h';
import { elementLabel } from './model';
import type { Analysis } from './model';
import type { AccNode, TraceStep } from './types';

const OUTCOMES = {
  used: 'Used',
  skipped: 'Skipped',
  empty: 'Skipped: empty',
  'not-reached': 'Not reached',
} as const;
const SPOKEN_ROLES: Readonly<Record<string, string>> = {
  searchbox: 'search text field',
  textbox: 'text field',
  'html-input-password': 'secure text field',
  'html-summary': 'disclosure button',
  'graphics-document': 'graphic',
};

export function traceView(trace: ReadonlyArray<TraceStep>): VElement {
  return h(
    'ol',
    { class: 'ladder name-ladder' },
    trace.map((step) =>
      h(
        'li',
        {
          class: 'ladder-step',
          'data-outcome': step.outcome === 'used' ? 'decided' : step.outcome,
          'data-step': step.id,
        },
        h(
          'p',
          { class: 'ladder-head' },
          h('span', { class: 'ladder-name' }, `${step.id}: ${step.source}`),
          h(
            'span',
            { class: 'ladder-outcome' },
            step.outcome === 'used' ? h('strong', {}, OUTCOMES[step.outcome]) : OUTCOMES[step.outcome],
          ),
        ),
        h('p', { class: 'ladder-text' }, step.explanation),
        step.children.length
          ? h(
              'details',
              { class: 'name-recursion' },
              h('summary', {}, `Show ${step.source} traversal`),
              traceView(step.children),
            )
          : null,
      ),
    ),
  );
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const sourceText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function source(node: AccNode): string {
  if (node.tag === '#text') return sourceText(node.text);
  if (node.tag.startsWith('#')) return '';
  const attributes = Object.entries(node.attributes)
    .map(([key, value]) => ` ${key}="${sourceText(value)}"`)
    .join('');
  return `<${node.tag}${attributes}>${VOID.has(node.tag) ? '' : `${node.children.map(source).join('')}</${node.tag}>`}`;
}

export function optionsView(model: Analysis): VNode[] {
  return model.elements.map((node, index) =>
    h('option', { value: index, selected: index === model.selected }, elementLabel(node)),
  );
}

export function analysisView(model: Analysis): VNode[] {
  return [
    h('p', { class: 'name-verdict', 'data-name-verdict': true }, model.verdict),
    h(
      'p',
      { class: 'mt-s' },
      `Roughly announced as: ${model.name.value ? `${model.name.value}, ` : ''}${SPOKEN_ROLES[model.role] ?? model.role}.`,
    ),
    h(
      'p',
      { class: 'muted mt-s' },
      'Exact wording, role exposure, state announcements, and order vary by browser and screen reader.',
    ),
    model.cssUnknown
      ? h(
          'p',
          { class: 'notice mt-m', 'data-css-limit': true },
          'This HTML contains a class or a style element. Class-based CSS hiding, stylesheet layout, and CSS-generated content (::before/::after) cannot be computed from this markup.',
        )
      : null,
    h(
      'details',
      { class: 'as-css' },
      h('summary', {}, 'Show selected element as source'),
      h('pre', { class: 'code' }, h('code', {}, source(model.node))),
    ),
    h('h2', { class: 'mt-l' }, 'Which source wins?'),
    traceView(model.name.trace),
    h('h2', { class: 'mt-l' }, 'Description'),
    h(
      'p',
      { class: 'mt-s', 'data-name-description': true },
      model.description.value || 'No additional description.',
    ),
    h(
      'details',
      { class: 'as-css' },
      h('summary', {}, 'Show description computation'),
      traceView(model.description.trace),
    ),
    h('h2', { class: 'mt-l' }, 'Checks and fixes'),
    model.checks.length
      ? h(
          'ul',
          { class: 'fixes mt-m', role: 'list', 'data-name-checks': true },
          model.checks.map((check) =>
            h(
              'li',
              { class: 'fix', 'data-check': check.code },
              h('h3', { class: 'fix-title' }, check.message),
              check.wcag
                ? h(
                    'p',
                    {},
                    h(
                      'a',
                      {
                        href: `https://www.w3.org/WAI/WCAG22/Understanding/${check.wcag === '2.5.3' ? 'label-in-name' : 'name-role-value'}.html`,
                      },
                      `WCAG ${check.wcag}`,
                    ),
                  )
                : null,
              h('p', {}, check.fix),
              h('pre', { class: 'code' }, h('code', {}, check.snippet)),
            ),
          ),
        )
      : h(
          'p',
          { class: 'mt-s' },
          'No issues found by these markup checks. This is not a complete accessibility audit.',
        ),
  ];
}

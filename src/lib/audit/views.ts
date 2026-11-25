import { h, rich } from '../view/h';
import { codeBlock } from '../view/code';
import type { VNode } from '../view/h';
import { compareEntries, displayValue } from './metrics';
import { ISSUE_NAMES } from './issues';
import type { Audit } from './model';
import type { IssueCode } from './types';

export type Sort = 'none' | 'ascending' | 'descending';
const triple = (value: readonly number[] | null): string => (value ? value.join(', ') : 'None');

export function summaryView(model: Audit): VNode[] {
  const m = model.metrics;
  return [
    h('h2', { id: 'audit-numbers' }, 'The stylesheet in numbers'),
    h(
      'dl',
      { class: 'audit-metrics', 'data-audit-summary': true },
      [
        ['Selectors', m.selectors],
        ['Rules / declaration runs', m.rules],
        ['!important declarations', m.important],
        ['Selectors with ID weight', m.ids],
        ['Maximum specificity', triple(m.maximum?.specificity ?? null)],
        ['Median specificity', triple(m.median)],
      ].map(([label, value]) => h('div', {}, h('dt', {}, label), h('dd', {}, value))),
    ),
    m.maximum
      ? h('p', {}, 'Maximum: ', h('code', {}, m.maximum.selector), ` on line ${m.maximum.line}.`)
      : null,
    h(
      'p',
      { class: 'muted' },
      `First non-zero column: ID ${m.histogram.id}; class ${m.histogram.class}; type ${m.histogram.type}; zero ${m.histogram.zero}. The median is the lower middle triple when the count is even.`,
    ),
    model.truncated
      ? h(
          'p',
          { class: 'notice', 'data-audit-truncated': true },
          'More than 5,000 selectors: only the first 5,000 are reported. Metrics, graph and findings describe that prefix.',
        )
      : null,
    model.notes.map((note) => h('p', { class: 'notice' }, note)),
  ];
}

export function graphView(model: Audit): VNode {
  const entries = model.entries;
  const maximum = Math.max(1, ...entries.map((entry) => displayValue(entry.specificity)));
  const x = (index: number) => 20 + (index / Math.max(1, entries.length - 1)) * 960;
  const y = (index: number) => 210 - (displayValue(entries[index]?.specificity ?? [0, 0, 0]) / maximum) * 180;
  const peak = entries.reduce<(typeof entries)[number] | null>(
    (best, entry) =>
      !best || displayValue(entry.specificity) > displayValue(best.specificity) ? entry : best,
    null,
  );
  return h(
    'figure',
    { class: 'flow' },
    h('h2', { id: 'audit-graph-title' }, 'Specificity in source order'),
    h(
      'svg',
      {
        class: 'audit-graph',
        viewBox: '0 0 1000 240',
        role: 'img',
        'aria-label': `${entries.length} selectors in source order. ${peak ? `Display peak ${displayValue(peak.specificity)} at entry ${peak.index + 1}, line ${peak.line}, ${peak.selector}.` : 'No selector points.'} Exact triples are in the table below.`,
        'data-audit-graph': true,
      },
      h('line', { x1: 20, y1: 210, x2: 980, y2: 210, class: 'audit-axis' }),
      h('polyline', {
        points: entries.map((entry) => `${x(entry.index)},${y(entry.index)}`).join(' '),
        class: 'audit-line',
      }),
      entries.map((entry, index) =>
        h(
          'g',
          {},
          index > 0 && entry.layer !== entries[index - 1]?.layer
            ? h('line', { x1: x(index), x2: x(index), y1: 20, y2: 220, class: 'audit-boundary' })
            : null,
          h(entry.important ? 'rect' : 'circle', {
            ...(entry.important
              ? { x: x(index) - 5, y: y(index) - 5, width: 10, height: 10 }
              : { cx: x(index), cy: y(index), r: 5 }),
            class: 'audit-point',
            role: 'img',
            tabindex: index === 0 ? 0 : -1,
            'data-audit-point': index,
            'aria-label': `Entry ${index + 1}, line ${entry.line}: ${entry.selector}; specificity ${triple(entry.specificity)}${entry.important ? '; important' : ''}`,
          }),
        ),
      ),
    ),
    h(
      'figcaption',
      { class: 'muted' },
      'Display scale: min(A, 9) × 100 + min(B, 9) × 10 + min(C, 9). This is not the real ordering: compare the full columns from left to right. Squares mark !important; circles mark normal entries; dashed vertical lines mark changes of layer. Left to right is source order; height increases with the display value. Focus a point and use arrow keys to explore.',
    ),
  );
}

export function tableView(model: Audit, sort: Sort = 'none'): VNode {
  const entries = [...model.entries];
  if (sort !== 'none')
    entries.sort(
      (left, right) =>
        (sort === 'ascending' ? 1 : -1) * compareEntries(left, right) || left.index - right.index,
    );
  return h(
    'div',
    { class: 'audit-table-wrap', tabindex: 0, role: 'region', 'aria-label': 'Selector data table' },
    h(
      'table',
      { class: 'audit-table', 'data-audit-table': true },
      h('caption', {}, 'Every plotted selector. Focus a row and use arrow keys to explore.'),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, 'Line'),
          h('th', { scope: 'col' }, 'Selector'),
          h(
            'th',
            { scope: 'col', 'aria-sort': sort },
            h(
              'button',
              { type: 'button', class: 'button js-only', 'data-audit-sort': true },
              'Sort by specificity',
            ),
            h('span', { class: 'audit-nojs' }, 'Specificity'),
          ),
          h('th', { scope: 'col' }, 'Layer / conditions'),
          h('th', { scope: 'col' }, '!important'),
        ),
      ),
      h(
        'tbody',
        {},
        entries.map((entry, index) =>
          h(
            'tr',
            { tabindex: index === 0 ? 0 : -1, 'data-audit-row': entry.index },
            h('td', {}, entry.line),
            h(
              'td',
              {},
              h('code', {}, entry.selector),
              entry.warnings.map((warning) => h('p', { class: 'muted' }, warning)),
            ),
            h('td', {}, triple(entry.specificity)),
            h(
              'td',
              {},
              entry.layer ? h('code', {}, entry.layer) : 'Unlayered',
              entry.context.length ? h('p', {}, h('code', {}, entry.context.join(' → '))) : null,
            ),
            h('td', {}, entry.important ? 'Yes' : 'No'),
          ),
        ),
      ),
    ),
  );
}

export function detailsView(model: Audit): VNode[] {
  const codes = Object.keys(ISSUE_NAMES) as IssueCode[];
  const empty = codes.filter((code) => model.issues.counts[code] === 0);
  return [
    h('h2', { id: 'audit-findings' }, 'Findings and fixes'),
    h(
      'p',
      { class: 'muted' },
      'Review signals, not a grade. A graph cannot prove that two declarations compete for the same element and property.',
    ),
    ...codes.map((code) =>
      h(
        'section',
        { class: 'flow', 'aria-labelledby': `audit-${code}`, hidden: model.issues.counts[code] === 0 },
        h('h3', { id: `audit-${code}` }, `${ISSUE_NAMES[code]}: ${model.issues.counts[code]}`),
        h(
          'ul',
          { class: 'fixes', role: 'list', 'data-audit-findings': code },
          model.issues.findings
            .filter((finding) => finding.code === code)
            .map((finding) =>
              h(
                'li',
                { class: 'fix' },
                h('p', {}, `Line ${finding.line}: `, ...rich(finding.message)),
                h('p', {}, ...rich(finding.fix)),
                codeBlock(finding.snippet, `Line ${finding.line}: ${finding.message}`),
              ),
            ),
        ),
      ),
    ),
    empty.length
      ? h(
          'p',
          { class: 'muted', 'data-audit-empty': true },
          `No findings for: ${empty.map((code) => ISSUE_NAMES[code].toLowerCase()).join(', ')}.`,
        )
      : null,
    model.issues.omitted
      ? h(
          'p',
          { class: 'notice' },
          `${model.issues.omitted} more findings omitted; only the first 200 are shown. Group counts include omitted findings.`,
        )
      : null,
    h('h2', { id: 'audit-layers' }, 'Layers'),
    h(
      'p',
      {},
      'Layer order beats specificity within the same origin and importance: later layers win for normal declarations, and unlayered normal declarations win over layered ones. Important declarations reverse that order. ',
      h(
        'a',
        { href: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@layer#description' },
        'Read the layer rules',
      ),
      '.',
    ),
    h(
      'ol',
      { class: 'audit-layers', 'data-audit-layers': true },
      model.layers.map((layer) =>
        h('li', {}, `${layer}: ${model.entries.filter((entry) => entry.layer === layer).length} entries`),
      ),
    ),
    h('p', {}, `Unlayered: ${model.entries.filter((entry) => entry.layer === null).length} entries.`),
    h(
      'p',
      { class: 'muted' },
      'Nested paths are grouped under their parent in first-declared sibling order. A parent layer’s own declarations outrank its sublayers for normal declarations. Conditions are recorded, not evaluated. Imports and descriptor rules are not audited.',
    ),
  ];
}

export function auditView(model: Audit, sort: Sort = 'none'): VNode[] {
  return [
    h(
      'nav',
      { class: 'results-nav', 'aria-label': 'Results sections' },
      [
        ['audit-numbers', 'Numbers'],
        ['audit-graph-title', 'Graph'],
        ['audit-selectors', 'Selectors'],
        ['audit-findings', 'Findings'],
        ['audit-layers', 'Layers'],
      ].map(([id, label]) => h('a', { href: `#${id}` }, label)),
    ),
    summaryView(model),
    graphView(model),
    h('h2', { id: 'audit-selectors' }, 'Selectors'),
    h('div', { 'data-audit-table-slot': true }, tableView(model, sort)),
    detailsView(model),
  ];
}

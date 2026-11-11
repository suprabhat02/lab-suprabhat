import { h, rich } from '../view/h';
import type { VElement, VNode } from '../view/h';
import { LIMITS } from '../cascade/share';
import { formatSpecificity } from '../cascade/math';
import type { CascadeRow } from '../cascade/share';
import type { PartKind, SelectorPart, Specificity, SpecificityResult } from '../cascade/types';
import { cascadeAsCss } from './model';
import type { CascadeModel, ContenderModel, DuelModel, NestingModel } from './model';

const COLUMN_LABELS = ['IDs', 'Classes', 'Types'] as const;
const COLUMN_KEYS = ['a', 'b', 'c'] as const;

export const icon = {
  error: () =>
    h(
      'svg',
      {
        class: 'icon',
        viewBox: '0 0 16 16',
        width: 16,
        height: 16,
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('circle', { cx: 8, cy: 8, r: 7, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
      h('path', {
        d: 'M8 4v5M8 11v1.5',
        stroke: 'currentColor',
        'stroke-width': 1.5,
        'stroke-linecap': 'round',
      }),
    ),
  note: () =>
    h(
      'svg',
      {
        class: 'icon',
        viewBox: '0 0 16 16',
        width: 16,
        height: 16,
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('path', {
        d: 'M8 1.5 15 14H1z',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.5,
        'stroke-linejoin': 'round',
      }),
      h('path', {
        d: 'M8 6v4M8 11.5v1',
        stroke: 'currentColor',
        'stroke-width': 1.5,
        'stroke-linecap': 'round',
      }),
    ),
};

export function errorMessage(message: string, id?: string): VElement {
  return h(
    'p',
    { class: 'message message-error', id },
    icon.error(),
    h('span', {}, h('span', { class: 'visually-hidden' }, 'Error: '), ...rich(message)),
  );
}

function warningMessage(message: string): VElement {
  return h(
    'p',
    { class: 'message message-warning' },
    icon.note(),
    h('span', {}, h('span', { class: 'visually-hidden' }, 'Note: '), ...rich(message)),
  );
}

/* ---------- Duel ---------- */

export function scoreView(
  contender: ContenderModel,
  index: number,
  duel: DuelModel,
  previous: Specificity | null = null,
): VNode[] {
  const best = contender.best;
  const comparison = duel.comparison;
  const isWinner = comparison !== null && comparison.effectiveWinner === index;
  const decided = isWinner && comparison.decidedBy !== 'order' ? comparison.decidedBy : null;
  const values: readonly (number | null)[] = best ? best.value : [null, null, null];

  const numerals = h(
    'div',
    { class: 'numerals', 'aria-hidden': 'true' },
    COLUMN_KEYS.map((key, i) => {
      const value = values[i];
      const changed = previous !== null && value !== null && previous[i] !== value;
      return h(
        'span',
        {
          class: 'numeral',
          'data-col': key,
          'data-decided': decided === key,
          'data-roll': changed,
          'data-empty': value === null,
        },
        value === null ? '–' : String(value),
      );
    }),
    COLUMN_LABELS.map((label) => h('span', { class: 'numeral-caption' }, label)),
    decided
      ? h(
          'span',
          { class: 'decided-marker', 'data-col': decided },
          h('span', { class: 'marker-arrow' }, '▲'),
          ' decided here',
        )
      : null,
  );

  const text = best
    ? `Specificity ${best.value[0]}, ${best.value[1]}, ${best.value[2]}${isWinner ? '. Wins.' : '.'}`
    : 'No score yet.';

  let outcome: VNode = null;
  if (isWinner && comparison) {
    outcome = h(
      'p',
      { class: 'outcome outcome-win' },
      comparison.winner === 'tie' ? 'Wins: written later' : 'Wins',
    );
  } else if (comparison) {
    outcome = h('p', { class: 'outcome' }, 'Loses');
  }

  const listNote =
    contender.parsed.ok && contender.parsed.value.length > 1 && best
      ? h(
          'p',
          { class: 'list-note' },
          ...rich(
            `Selector list: each selector has its own score. This uses the strongest, \`${best.selector}\`.`,
          ),
        )
      : null;

  return [numerals, h('p', { class: 'visually-hidden' }, text), outcome, listNote];
}

export function fieldMessages(contender: ContenderModel, id: string): VNode[] {
  if (!contender.parsed.ok) return [errorMessage(contender.parsed.error.message, id)];
  const warnings = contender.parsed.value.flatMap((r) => r.warnings);
  return [...new Set(warnings)].map(warningMessage);
}

export function contenderView(
  index: number,
  total: number,
  contender: ContenderModel,
  duel: DuelModel,
): VElement {
  const id = `sel-${index}`;
  const invalid = !contender.parsed.ok;
  return h(
    'div',
    { class: 'contender', 'data-contender': index },
    h(
      'div',
      { class: 'contender-head' },
      h('label', { class: 'label', for: id }, `Selector ${index + 1}`),
      total > LIMITS.selectors.min
        ? h(
            'button',
            {
              type: 'button',
              class: 'button-quiet',
              'data-remove': index,
              'aria-label': `Remove selector ${index + 1}`,
            },
            'Remove',
          )
        : null,
    ),
    h('input', {
      class: 'input input-selector',
      id,
      name: 's',
      type: 'text',
      value: contender.input,
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      'aria-describedby': `${id}-msg`,
      'aria-invalid': invalid ? 'true' : null,
      'data-selector': index,
    }),
    h(
      'div',
      { class: 'field-messages', id: `${id}-msg`, 'data-messages': index },
      fieldMessages(contender, `${id}-error`),
    ),
    h('div', { class: 'score', 'data-score': index }, scoreView(contender, index, duel)),
  );
}

export function verdictView(duel: DuelModel): VNode[] {
  if (duel.comparison) return rich(duel.comparison.reason);
  if (duel.contenders.length < 2) return ['Add another selector to compare.'];
  const broken = duel.contenders.findIndex((c) => !c.parsed.ok);
  return [`Fix selector ${broken + 1} to see who wins.`];
}

export function suggestionsView(duel: DuelModel): VNode[] {
  const comparison = duel.comparison;
  if (!comparison || duel.targetIndex === null || duel.suggestions.length === 0) {
    return [h('p', { class: 'muted' }, 'Compare two valid selectors to see how to change the result.')];
  }
  const options = duel.contenders.flatMap((c, i) =>
    i === comparison.effectiveWinner
      ? []
      : [
          h(
            'option',
            { value: i, selected: i === duel.targetIndex },
            `Selector ${i + 1}: ${c.best?.selector ?? c.input}`,
          ),
        ],
  );
  return [
    h(
      'div',
      { class: 'field field-inline' },
      h('label', { class: 'label', for: 'fix-target' }, 'Make this one win'),
      h('select', { class: 'input select', id: 'fix-target', 'data-fix-target': true }, options),
    ),
    h(
      'ul',
      { class: 'fixes', role: 'list' },
      duel.suggestions.map((s) =>
        h(
          'li',
          { class: 'fix', 'data-kind': s.kind },
          h('h3', { class: 'fix-title' }, s.title),
          h('p', {}, ...rich(s.detail)),
          s.code ? h('pre', { class: 'code' }, h('code', {}, s.code)) : null,
          s.warning ? warningMessage(s.warning) : null,
        ),
      ),
    ),
  ];
}

/* ---------- Anatomy ---------- */

const KIND_LABEL: Record<PartKind, string> = {
  id: 'ID',
  class: 'Class',
  attribute: 'Attribute',
  'pseudo-class': 'Pseudo-class',
  type: 'Type',
  'pseudo-element': 'Pseudo-element',
  universal: 'Universal',
  combinator: 'Combinator',
  functional: 'Functional pseudo-class',
};

const DEFAULT_NOTE: Partial<Record<PartKind, string>> = {
  id: 'Adds 1 to the first column.',
  class: 'Adds 1 to the second column.',
  attribute: 'Adds 1 to the second column, like a class.',
  'pseudo-class': 'Adds 1 to the second column, like a class.',
  type: 'Adds 1 to the third column.',
  'pseudo-element': 'Adds 1 to the third column, like a type.',
};

const partText = (p: SelectorPart) =>
  p.kind === 'combinator' && p.text.trim() === '' ? 'space' : p.text.trim();

function highlighted(result: SpecificityResult): VElement {
  const offset = result.parts[0]?.start ?? 0;
  return h(
    'p',
    { class: 'parts', 'aria-hidden': 'true' },
    result.parts.map((p) => {
      const text = result.selector.slice(p.start - offset, p.end - offset);
      return h('span', { class: 'part', 'data-kind': p.kind }, text);
    }),
  );
}

function anatomyTable(result: SpecificityResult, caption: string): VElement {
  return h(
    'div',
    { class: 'table-wrap', tabindex: 0, role: 'region', 'aria-label': caption },
    h(
      'table',
      { class: 'table' },
      h('caption', { class: 'visually-hidden' }, caption),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, 'Part'),
          h('th', { scope: 'col' }, 'Kind'),
          COLUMN_LABELS.map((l) => h('th', { scope: 'col', class: 'num' }, l)),
          h('th', { scope: 'col' }, 'Why'),
        ),
      ),
      h(
        'tbody',
        {},
        result.parts.map((p) =>
          h(
            'tr',
            { 'data-kind': p.kind },
            h('th', { scope: 'row' }, h('code', {}, partText(p))),
            h('td', {}, KIND_LABEL[p.kind]),
            p.contributes.map((n) => h('td', { class: 'num', 'data-zero': n === 0 }, String(n))),
            h('td', {}, ...rich(p.note ?? DEFAULT_NOTE[p.kind] ?? '')),
          ),
        ),
      ),
      h(
        'tfoot',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'row', colspan: 2 }, 'Total'),
          result.value.map((n) => h('td', { class: 'num' }, String(n))),
          h('td', {}, formatSpecificity(result.value)),
        ),
      ),
    ),
  );
}

export function anatomyView(contenders: ReadonlyArray<ContenderModel>): VNode[] {
  return contenders.map((c, i) => {
    if (!c.parsed.ok) {
      return h(
        'section',
        { class: 'anatomy-item' },
        h('h3', { class: 'anatomy-title' }, `Selector ${i + 1}`),
        errorMessage(c.parsed.error.message),
      );
    }
    return h(
      'section',
      { class: 'anatomy-item' },
      c.parsed.value.map((r, j) =>
        h(
          'div',
          { class: 'anatomy-selector' },
          h(
            'h3',
            { class: 'anatomy-title' },
            `Selector ${i + 1}${c.parsed.ok && c.parsed.value.length > 1 ? `, part ${j + 1} of the list` : ''}: `,
            h('code', {}, r.selector),
            ` ${formatSpecificity(r.value)}`,
          ),
          highlighted(r),
          anatomyTable(r, `Breakdown of ${r.selector}`),
          r.warnings.map(warningMessage),
        ),
      ),
    );
  });
}

/* ---------- Nesting ---------- */

export function nestingView(model: NestingModel): VNode[] {
  if (!model.ok) return [errorMessage(model.error.message)];
  const callout = model.rules.find((r) => r.rule.depth > 0 && r.rule.selector.includes(':is('));
  const calloutValue = callout?.specificities[0];
  return [
    callout && calloutValue?.ok
      ? h(
          'p',
          { class: 'callout' },
          ...rich(
            `\`${callout.rule.source}\` becomes \`${callout.rule.selectors[0] ?? ''}\`, which scores ${formatSpecificity(calloutValue.value)}. \`:is()\` takes its most specific argument, even for elements that only match a weaker parent selector.`,
          ),
        )
      : null,
    h(
      'div',
      { class: 'table-wrap', tabindex: 0, role: 'region', 'aria-label': 'Expanded rules' },
      h(
        'table',
        { class: 'table' },
        h('caption', { class: 'visually-hidden' }, 'Expanded rules'),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, 'As written'),
            h('th', { scope: 'col' }, 'Expands to'),
            h('th', { scope: 'col' }, 'Specificity'),
            h('th', { scope: 'col' }, 'Inside'),
          ),
        ),
        h(
          'tbody',
          {},
          model.rules.map(({ rule, specificities }) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, h('code', { 'data-depth': Math.min(rule.depth, 4) }, rule.source)),
              h(
                'td',
                {},
                rule.selectors.map((s, k) => [k > 0 ? h('br', {}) : null, h('code', {}, s)]),
              ),
              h(
                'td',
                { class: 'num' },
                specificities.map((s, k) => [
                  k > 0 ? h('br', {}) : null,
                  s.ok ? formatSpecificity(s.value) : 'invalid',
                ]),
              ),
              h(
                'td',
                {},
                rule.atRules.length
                  ? rule.atRules.map((a, k) => [k > 0 ? h('br', {}) : null, h('code', {}, a)])
                  : '–',
              ),
            ),
          ),
        ),
      ),
    ),
    model.notes.map(warningMessage),
  ];
}

/* ---------- Cascade ---------- */

export function cascadeRowView(
  index: number,
  total: number,
  row: CascadeRow,
  layers: ReadonlyArray<string>,
  error: string | null,
): VElement {
  const id = (f: string) => `c${index}-${f}`;
  const scoped = row.scope !== null;
  const layerOptions = [
    ...new Set([...layers, ...(row.layer && !layers.includes(row.layer) ? [row.layer] : [])]),
  ];
  return h(
    'fieldset',
    { class: 'decl', 'data-row': index },
    h('legend', { class: 'decl-legend' }, `Declaration ${index + 1}`),
    total > LIMITS.rows.min
      ? h(
          'button',
          {
            type: 'button',
            class: 'button-quiet decl-remove',
            'data-remove-row': index,
            'aria-label': `Remove declaration ${index + 1}`,
          },
          'Remove',
        )
      : null,
    h(
      'div',
      { class: 'decl-grid' },
      h(
        'div',
        { class: 'field field-wide' },
        h('label', { class: 'label', for: id('selector') }, 'Selector'),
        h('input', {
          class: 'input',
          id: id('selector'),
          type: 'text',
          value: row.selector,
          'data-field': 'selector',
          disabled: row.inline,
          spellcheck: 'false',
          autocapitalize: 'off',
          autocomplete: 'off',
          'aria-invalid': error ? 'true' : null,
          'aria-describedby': error ? id('error') : null,
        }),
        error ? errorMessage(error, id('error')) : null,
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'label', for: id('value') }, 'Value'),
        h('input', {
          class: 'input',
          id: id('value'),
          type: 'text',
          value: row.value,
          'data-field': 'value',
          spellcheck: 'false',
          autocapitalize: 'off',
          autocomplete: 'off',
          maxlength: LIMITS.value,
        }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'label', for: id('order') }, 'Source order'),
        h('input', {
          class: 'input',
          id: id('order'),
          type: 'number',
          inputmode: 'numeric',
          min: 1,
          max: LIMITS.order,
          value: row.order,
          'data-field': 'order',
        }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'label', for: id('layer') }, 'Layer'),
        h(
          'select',
          { class: 'input select', id: id('layer'), 'data-field': 'layer', disabled: row.inline },
          h('option', { value: '', selected: row.layer === null }, 'None (unlayered)'),
          layerOptions.map((l) => h('option', { value: l, selected: row.layer === l }, l)),
        ),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'label', for: id('scope') }, '@scope root'),
        h('input', {
          class: 'input',
          id: id('scope'),
          type: 'text',
          value: row.scope?.root ?? '',
          placeholder: 'none',
          'data-field': 'scope',
          disabled: row.inline,
          spellcheck: 'false',
          autocapitalize: 'off',
          autocomplete: 'off',
          maxlength: LIMITS.scopeRoot,
        }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'label', for: id('proximity') }, 'DOM steps from root'),
        h('input', {
          class: 'input',
          id: id('proximity'),
          type: 'number',
          inputmode: 'numeric',
          min: 0,
          max: LIMITS.proximity,
          value: row.scope?.proximity ?? 1,
          'data-field': 'proximity',
          disabled: row.inline || !scoped,
        }),
      ),
      h(
        'div',
        { class: 'checks' },
        h(
          'label',
          { class: 'check' },
          h('input', { type: 'checkbox', 'data-field': 'important', checked: row.important }),
          h('code', {}, '!important'),
        ),
        h(
          'label',
          { class: 'check' },
          h('input', { type: 'checkbox', 'data-field': 'inline', checked: row.inline }),
          'Inline ',
          h('code', {}, 'style'),
        ),
      ),
    ),
  );
}

const OUTCOME_LABEL = { decided: 'Decided here', tie: 'Tie', 'not-reached': 'Not reached' } as const;

export function cascadeResultView(model: CascadeModel): VNode[] {
  const css = h(
    'details',
    { class: 'as-css' },
    h('summary', {}, 'Show as CSS'),
    h('pre', { class: 'code' }, h('code', {}, cascadeAsCss(model))),
  );
  if (!model.result)
    return [errorMessage(model.problem ?? 'Fill in the declarations to resolve the cascade.'), css];
  const result = model.result;
  const winner = model.rows.find((r) => r.id === result.winnerId);
  const property = model.property.trim() || 'color';
  const label = winner ? (winner.row.inline ? 'The inline style' : `\`${winner.row.selector.trim()}\``) : '';
  const value = winner ? `${property}: ${winner.row.value}${winner.row.important ? ' !important' : ''}` : '';
  return [
    h('p', { class: 'cascade-winner' }, ...rich(`${label} wins: \`${value}\`.`)),
    h('p', { class: 'cascade-summary' }, ...rich(result.summary)),
    h(
      'ol',
      { class: 'ladder' },
      result.steps.map((s) =>
        h(
          'li',
          { class: 'ladder-step', 'data-outcome': s.outcome },
          h(
            'p',
            { class: 'ladder-head' },
            h('span', { class: 'ladder-name' }, s.name),
            ' ',
            h(
              'span',
              { class: 'ladder-outcome' },
              s.outcome === 'decided' ? h('strong', {}, OUTCOME_LABEL[s.outcome]) : OUTCOME_LABEL[s.outcome],
            ),
          ),
          s.outcome === 'not-reached' ? null : h('p', { class: 'ladder-text' }, ...rich(s.explanation)),
        ),
      ),
    ),
    css,
  ];
}

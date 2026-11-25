import { attr, descendants, flat, isHidden, labelsFor, textContent, tokens } from './tree';
import { inputType, nameFrom, roleOf } from './role';
import type { AccNode, Computation, StepId, TraceStep } from './types';

interface Candidate {
  text: string;
  children?: ReadonlyArray<TraceStep>;
  stopEmpty?: boolean;
}

function collector() {
  const trace: TraceStep[] = [];
  let source: string | null = null;
  let value = '';
  let finished = false;
  return {
    step(id: StepId, name: string, resolve: () => Candidate | null, absent: string): void {
      if (finished) {
        trace.push({
          id,
          source: name,
          outcome: 'not-reached',
          text: '',
          children: [],
          explanation: `The ${source ?? 'earlier'} step already determined the result.`,
        });
        return;
      }
      const result = resolve();
      const text = flat(result?.text ?? '');
      trace.push({
        id,
        source: name,
        text,
        children: result?.children ?? [],
        outcome: result ? (text ? 'used' : 'empty') : 'skipped',
        explanation: result
          ? text
            ? `${name} supplies "${text}".`
            : `${name} supplies no text${result.stopEmpty ? ' and ends this computation' : ', so the next source is checked'}.`
          : absent,
      });
      if (text || result?.stopEmpty) {
        source = name;
        value = result?.text ?? text;
        finished = true;
      }
    },
    result: (): Computation => ({ value, source, trace }),
  };
}

interface Context {
  seen: Set<AccNode>;
  relation: boolean;
  referenced: boolean;
  nativeLabel: boolean;
  content: boolean;
  allowHidden: boolean;
  excluded: AccNode | null;
}

const initial = (): Context => ({
  seen: new Set(),
  relation: false,
  referenced: false,
  nativeLabel: false,
  content: false,
  allowHidden: false,
  excluded: null,
});

function references(node: AccNode, key: string): AccNode[] {
  return tokens(attr(node, key)).flatMap((id) => {
    const target = node.lookupId(id);
    return target ? [target] : [];
  });
}

function combine(nodes: ReadonlyArray<AccNode>, context: Context, separator = ' '): Candidate {
  const results = nodes.map((node) => evaluate(node, context));
  return {
    text: results.map((result) => result.value).join(separator),
    children: results.flatMap((result) => result.trace),
  };
}

function childText(node: AccNode, context: Context): Candidate {
  return combine(node.children, { ...context, content: true, referenced: false }, '');
}

function embeddedValue(node: AccNode, context: Context): Candidate | null {
  const role = roleOf(node);
  if (['textbox', 'searchbox', 'html-input-password'].includes(role)) {
    return { text: node.tag === 'textarea' ? textContent(node) : (attr(node, 'value') ?? textContent(node)) };
  }
  if (role === 'combobox' || role === 'listbox') {
    const options = descendants(node).filter((child) => roleOf(child) === 'option');
    let selected = options.filter(
      (option) => attr(option, 'selected') !== undefined || attr(option, 'aria-selected') === 'true',
    );
    if (node.tag === 'select' && attr(node, 'multiple') === undefined) {
      selected = selected.length
        ? selected.slice(-1)
        : options.filter((option) => attr(option, 'disabled') === undefined).slice(0, 1);
    }
    if (node.tag === 'input') return { text: attr(node, 'value') ?? '' };
    return combine(selected, { ...context, content: true, referenced: false });
  }
  if (['slider', 'spinbutton', 'progressbar', 'scrollbar', 'meter'].includes(role)) {
    let value = attr(node, 'aria-valuetext') ?? attr(node, 'aria-valuenow') ?? attr(node, 'value');
    if (value === undefined && node.tag === 'input' && inputType(node) === 'range') {
      const min = Number(attr(node, 'min') ?? 0);
      const max = Number(attr(node, 'max') ?? 100);
      value = String(min + Math.max(0, max - min) / 2);
    }
    return { text: value ?? '' };
  }
  return null;
}

function evaluate(node: AccNode, context: Context): Computation {
  if (node === context.excluded || context.seen.has(node)) {
    return {
      value: '',
      source: null,
      trace: [
        {
          id: '2H',
          source: node.tag,
          outcome: 'skipped',
          text: '',
          children: [],
          explanation:
            node === context.excluded
              ? 'The control being named is excluded from its own label.'
              : 'This node was already consulted; it is not counted again.',
        },
      ],
    };
  }
  const steps = collector();
  steps.step(
    '2A',
    'hidden',
    () => (isHidden(node) && !context.allowHidden ? { text: '', stopEmpty: true } : null),
    context.allowHidden
      ? 'The directly referenced label is hidden, so its hidden subtree is included.'
      : 'This node is not hidden by the supported markup rules.',
  );
  if (node.tag === '#text') {
    context.seen.add(node);
    steps.step('2G', 'text', () => ({ text: node.text }), 'There is no text node.');
    // Preserve word boundaries until the complete alternative is flattened.
    const result = steps.result();
    return result.source !== 'hidden' ? { ...result, value: node.text } : result;
  }
  steps.step(
    '2B',
    'aria-labelledby',
    () => {
      if (context.relation) return null;
      const nodes = references(node, 'aria-labelledby');
      if (!nodes.length) return attr(node, 'aria-labelledby') !== undefined ? { text: '' } : null;
      const results = nodes.map((target) =>
        evaluate(target, {
          ...context,
          relation: true,
          referenced: true,
          allowHidden: isHidden(target),
        }),
      );
      return {
        text: results.map((result) => result.value).join(' '),
        children: results.flatMap((result) => result.trace),
      };
    },
    context.relation
      ? 'Nested aria-labelledby relations are not followed during a relation traversal.'
      : 'There is no aria-labelledby reference.',
  );
  context.seen.add(node);
  // AccName 1.2 (2026-11-04), section 4.3.2: Embedded Control, AriaLabel, Host Language Label.
  // https://www.w3.org/TR/2026/WD-accname-1.2-20261104/#computation-steps
  steps.step(
    '2C',
    'embedded control',
    () =>
      context.content || context.referenced || context.nativeLabel ? embeddedValue(node, context) : null,
    'This node is not a value-bearing control embedded in another label.',
  );
  steps.step(
    '2D',
    'aria-label',
    () =>
      attr(node, 'aria-label') !== undefined && node.tag !== 'slot'
        ? { text: attr(node, 'aria-label') ?? '' }
        : null,
    'There is no applicable aria-label.',
  );

  const presentational = ['none', 'presentation'].includes(roleOf(node));
  const labels = labelsFor(node);
  const labelSource = labels.length
    ? [
        ...new Set(
          labels.map((label) => (attr(label, 'for') !== undefined ? 'label[for]' : 'wrapping label')),
        ),
      ].join(' + ')
    : 'label[for] / wrapping label';
  steps.step(
    '2E',
    labelSource,
    () => {
      if (presentational || !labels.length) return null;
      const results = labels.map((label) =>
        evaluate(label, {
          ...context,
          nativeLabel: true,
          content: true,
          excluded: node,
          allowHidden: isHidden(label),
        }),
      );
      return {
        text: results.map((result) => result.value).join(' '),
        children: results.flatMap((result) => result.trace),
      };
    },
    'There is no applicable associated native label.',
  );

  const nativeChild: Readonly<Record<string, string>> = {
    fieldset: 'legend',
    table: 'caption',
    svg: 'title',
  };
  const childTag = nativeChild[node.tag];
  if (childTag) {
    steps.step(
      '2E',
      childTag === 'title' ? 'svg title' : childTag,
      () => {
        const child = node.children.find((candidate) => candidate.tag === childTag);
        if (!child || presentational) return null;
        const result = evaluate(child, {
          ...context,
          nativeLabel: true,
          content: true,
          allowHidden: isHidden(child),
        });
        return { text: result.value, children: result.trace };
      },
      `There is no applicable ${childTag} child.`,
    );
  }
  if (node.tag === 'img' || node.tag === 'area' || (node.tag === 'input' && inputType(node) === 'image')) {
    steps.step(
      '2E',
      'alt',
      () => {
        const alt = attr(node, 'alt');
        if (presentational || alt === undefined) return null;
        return { text: alt, stopEmpty: node.tag === 'img' };
      },
      'There is no applicable alt attribute.',
    );
  }
  if (node.tag === 'input' && ['button', 'submit', 'reset'].includes(inputType(node))) {
    steps.step(
      '2E',
      'value',
      () => (attr(node, 'value') !== undefined ? { text: attr(node, 'value') ?? '' } : null),
      'There is no author-specified button value.',
    );
    steps.step(
      '2E',
      'browser default',
      () =>
        attr(node, 'value') === undefined && ['submit', 'reset'].includes(inputType(node))
          ? { text: inputType(node) === 'submit' ? 'Submit' : 'Reset' }
          : null,
      'No implementation-defined button label applies.',
    );
  }
  steps.step(
    '2F',
    'content',
    () =>
      nameFrom(node) === 'content' || context.referenced || context.nativeLabel
        ? childText(node, context)
        : null,
    'This role does not take its own name from content.',
  );
  steps.step(
    '2H',
    'recursive content',
    () => (context.content && node.children.length > 0 ? childText(node, context) : null),
    'No descendant-content traversal applies.',
  );
  steps.step(
    '2I',
    'title',
    () => (attr(node, 'title') !== undefined ? { text: attr(node, 'title') ?? '' } : null),
    'There is no title tooltip.',
  );
  if (
    node.tag === 'textarea' ||
    (node.tag === 'input' &&
      ['text', 'password', 'number', 'search', 'tel', 'email', 'url'].includes(inputType(node)))
  ) {
    steps.step(
      '2E',
      'placeholder',
      () => (attr(node, 'placeholder') !== undefined ? { text: attr(node, 'placeholder') ?? '' } : null),
      'There is no placeholder fallback (HTML-AAM 4.1.1).',
    );
    steps.step(
      '2E',
      'aria-placeholder',
      () =>
        attr(node, 'aria-placeholder') !== undefined ? { text: attr(node, 'aria-placeholder') ?? '' } : null,
      'There is no aria-placeholder fallback (HTML-AAM 4.1.1).',
    );
  }
  if (node.tag === 'input' && inputType(node) === 'image') {
    steps.step(
      '2E',
      'browser default',
      () => ({ text: 'Submit Query' }),
      'No image-button fallback applies.',
    );
  }
  if (node.tag === 'figure') {
    steps.step(
      '2E',
      'figcaption',
      () => null,
      'A figcaption does not automatically name its figure; it must be explicitly referenced (HTML-AAM 4.1.9).',
    );
  }
  if (node.tag === 'img') {
    steps.step(
      '2E',
      'figcaption',
      () => {
        if (
          attr(node, 'alt') !== undefined ||
          attr(node, 'title') !== undefined ||
          node.parent?.tag !== 'figure'
        )
          return null;
        const figure = node.parent;
        const caption = figure.children.find((child) => child.tag === 'figcaption');
        if (
          !caption ||
          figure.children.some(
            (child) => child !== caption && child !== node && (child.tag !== '#text' || flat(child.text)),
          )
        )
          return null;
        const result = evaluate(caption, { ...context, nativeLabel: true, content: true });
        return { text: result.value, children: result.trace };
      },
      'The restricted image-in-figure fallback does not apply (HTML-AAM 4.1.10).',
    );
  }
  return steps.result();
}

export function computeName(node: AccNode): Computation {
  if (nameFrom(node) === 'prohibited') {
    return {
      value: '',
      source: null,
      trace: [
        {
          id: '1',
          source: 'role',
          outcome: 'used',
          text: '',
          children: [],
          explanation: `The ${roleOf(node)} role prohibits naming, so initialization returns an empty name.`,
        },
      ],
    };
  }
  const result = evaluate(node, initial());
  return { ...result, value: flat(result.value) };
}

export function computeDescription(node: AccNode): Computation {
  const name = computeName(node);
  const steps = collector();
  steps.step(
    'description-1',
    'aria-describedby',
    () => {
      const nodes = references(node, 'aria-describedby');
      if (!nodes.length) return null;
      const context = initial();
      const results = nodes.map((target) =>
        evaluate(target, {
          ...context,
          relation: true,
          referenced: true,
          allowHidden: isHidden(target),
        }),
      );
      return {
        text: results.map((result) => result.value).join(' '),
        children: results.flatMap((result) => result.trace),
        stopEmpty: true,
      };
    },
    'There are no valid aria-describedby references.',
  );
  steps.step(
    'description-2',
    'aria-description',
    () =>
      attr(node, 'aria-description') !== undefined
        ? { text: attr(node, 'aria-description') ?? '', stopEmpty: true }
        : null,
    'There is no aria-description.',
  );
  steps.step(
    'description-3',
    'native description',
    () => {
      const childTag = node.tag === 'table' ? 'caption' : node.tag === 'svg' ? 'desc' : null;
      const child = childTag ? node.children.find((candidate) => candidate.tag === childTag) : null;
      if (child && name.source !== childTag) {
        const result = evaluate(child, {
          ...initial(),
          nativeLabel: true,
          content: true,
          allowHidden: isHidden(child),
        });
        return { text: result.value, children: result.trace, stopEmpty: true };
      }
      if (roleOf(node) === 'html-summary' && name.source !== 'content') {
        return { ...childText(node, { ...initial(), nativeLabel: true }), stopEmpty: true };
      }
      if (
        node.tag === 'input' &&
        ['button', 'submit', 'reset'].includes(inputType(node)) &&
        name.source !== 'value' &&
        attr(node, 'value') !== undefined
      ) {
        return { text: attr(node, 'value') ?? '', stopEmpty: true };
      }
      return null;
    },
    'There is no unused native description source.',
  );
  steps.step(
    'description-4',
    'title',
    () =>
      attr(node, 'title') !== undefined && name.source !== 'title'
        ? { text: attr(node, 'title') ?? '', stopEmpty: true }
        : null,
    'There is no title, or it already supplied the name.',
  );
  const result = steps.result();
  return { ...result, value: flat(result.value) };
}

import { compareEntries } from './metrics';
import type { Entry, Finding, IssueCode } from './types';

export const MAX_FINDINGS = 200;
export const ISSUE_NAMES: Readonly<Record<IssueCode, string>> = {
  'id-selector': 'ID weight',
  important: '!important declarations',
  'deep-selector': 'Deep selectors',
  'duplicate-selector': 'Duplicate selectors',
  'specificity-spike': 'Specificity spikes',
};

export function issues(entries: ReadonlyArray<Entry>) {
  const findings: Finding[] = [];
  const counts: Record<IssueCode, number> = {
    'id-selector': 0,
    important: 0,
    'deep-selector': 0,
    'duplicate-selector': 0,
    'specificity-spike': 0,
  };
  let omitted = 0;
  const add = (
    code: IssueCode,
    affected: ReadonlyArray<Entry>,
    message: string,
    fix: string,
    snippet: string,
  ) => {
    counts[code]++;
    if (findings.length === MAX_FINDINGS) {
      omitted++;
      return;
    }
    findings.push({
      code,
      entries: affected.map((entry) => entry.index),
      line: affected[0]?.line ?? 1,
      message,
      fix,
      snippet,
    });
  };
  const duplicates = new Map<string, Entry[]>();
  const importantRules = new Set<number>();
  entries.forEach((entry, index) => {
    const key = JSON.stringify([entry.selector, entry.layer, entry.context]);
    const group = duplicates.get(key) ?? [];
    group.push(entry);
    duplicates.set(key, group);
    if (entry.specificity[0] > 0)
      add(
        'id-selector',
        [entry],
        'This selector carries ID specificity.',
        'Only if the ID weight is unnecessary, use :where(#id) or [id="x"]; keep the HTML ID if links or scripts need it. Verify matching and the cascade before replacing anything.',
        `:where(${entry.selector}) { /* lower the selector's weight */ }`,
      );
    if (entry.important && !importantRules.has(entry.rule)) {
      importantRules.add(entry.rule);
      add(
        'important',
        [entry],
        `${entry.importantCount} declaration(s) use !important.`,
        entry.layer
          ? 'Review the component structure before raising specificity. Important layer order is reversed; adding a later layer is not an override.'
          : 'For normal author declarations, move competing rules into ordered layers rather than escalating specificity. Remove !important only after checking the cascade.',
        '@layer base, components;\n@layer components { .component { color: inherit; } }',
      );
    }
    if (entry.compounds >= 5)
      add(
        'deep-selector',
        [entry],
        `${entry.compounds} compound selectors are joined by combinators.`,
        'If the same elements can be targeted directly, use a component class instead of depending on every ancestor.',
        '.component-part { /* reviewed declarations */ }',
      );
    const next = entries.slice(index + 1, index + 11);
    if (next.length && next.every((other) => compareEntries(entry, other) > 0))
      add(
        'specificity-spike',
        [entry, ...next],
        `Higher specificity than all ${next.length} following entries in the ten-entry window.`,
        'This is a review signal, not proof of a conflict: selectors, properties, conditions, layers and importance may differ. Consider lowering unnecessary weight.',
        `:where(${entry.selector}) { /* verify the cascade */ }`,
      );
  });
  for (const group of duplicates.values()) {
    if (group.length > 1)
      add(
        'duplicate-selector',
        group,
        `Repeated selector in the same layer and context on lines ${group.map((entry) => entry.line).join(', ')}.`,
        'Consolidate only when moving declarations will not change source-order overrides.',
        `${group[0]?.selector ?? ''} { /* reviewed combined declarations */ }`,
      );
  }
  return { findings, counts, omitted };
}

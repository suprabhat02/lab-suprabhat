import { describe, expect, it } from 'vitest';
import { compare, columnSentence } from '../compare';
import { classesNeeded, suggestFixes } from '../suggest';
import { calculate } from '../specificity';
import type { SpecificityResult } from '../types';

function one(selector: string): SpecificityResult {
  const r = calculate(selector);
  if (!r.ok || !r.value[0]) throw new Error(selector);
  return r.value[0];
}

describe('compare', () => {
  it('explains the deciding column in one sentence', () => {
    const r = compare([one('#nav a'), one('.menu .link:hover')]);
    expect(r.winner).toBe(0);
    expect(r.decidedBy).toBe('a');
    expect(r.reason).toBe('`#nav a` wins in the first column: 1 ID beats 0.');
  });

  it('handles the second and third columns with correct grammar', () => {
    expect(compare([one('.a'), one('.a.b.c')]).reason).toBe(
      '`.a.b.c` wins in the second column: 3 classes, attributes or pseudo-classes beat 1.',
    );
    expect(compare([one('div p'), one('p')]).reason).toBe(
      '`div p` wins in the third column: 2 types or pseudo-elements beat 1.',
    );
    expect(columnSentence('a', 1, 0)).toBe('1 ID beats 0');
  });

  it('explains ties: the later one wins', () => {
    const r = compare([one('.a'), one('.b')]);
    expect(r.winner).toBe('tie');
    expect(r.effectiveWinner).toBe(1);
    expect(r.decidedBy).toBe('order');
    expect(r.reason).toBe('Same specificity: the one written later wins, so `.b` wins.');
  });

  it('compares more than two selectors and names the closest rival', () => {
    const r = compare([one('p'), one('#a'), one('.x.y')]);
    expect(r.winner).toBe(1);
    expect(r.runnerUp).toBe(2);
    expect(r.reason).toMatch(/closest rival is `\.x\.y`/);
  });

  it('finds the latest of several tied leaders', () => {
    const r = compare([one('.a'), one('p'), one('.b'), one('.c')]);
    expect(r.effectiveWinner).toBe(3);
    expect(r.runnerUp).toBe(2);
  });
});

describe('suggest', () => {
  it('orders suggestions: :where(), layers, raise, !important', () => {
    const fixes = suggestFixes({ winner: one('.nav a'), target: one('.link'), targetIsLater: true });
    expect(fixes.map((f) => f.kind)).toEqual(['where', 'layer', 'raise', 'important']);
    expect(fixes[0]?.code).toContain(':where(.nav a)');
    expect(fixes[3]?.warning).toMatch(/Only another `!important`/);
  });

  it('raises the loser by repeating a class, never adding an ID', () => {
    const fixes = suggestFixes({ winner: one('.menu .link:hover'), target: one('.nav .link'), targetIsLater: true });
    const raise = fixes.find((f) => f.kind === 'raise');
    expect(raise?.code).toContain('.nav .link.link');
    expect(raise?.detail).toMatch(/\(0,3,0\) ties with \(0,3,0\), and `\.nav \.link` is written later/);
    expect(raise?.code).not.toMatch(/#/);
  });

  it('says plainly when classes cannot beat an ID', () => {
    const fixes = suggestFixes({ winner: one('#nav a'), target: one('.menu .link:hover'), targetIsLater: true });
    const raise = fixes.find((f) => f.kind === 'raise');
    expect(raise?.code).toBeNull();
    expect(raise?.detail).toMatch(/no number of classes beats an ID/);
  });

  it('computes the minimal number of classes', () => {
    expect(classesNeeded([0, 2, 0], [0, 1, 0], true)).toBe(1);
    expect(classesNeeded([0, 2, 0], [0, 1, 0], false)).toBe(2);
    expect(classesNeeded([0, 2, 1], [0, 0, 3], false)).toBe(2);
    expect(classesNeeded([0, 1, 2], [0, 1, 1], true)).toBe(1);
    expect(classesNeeded([1, 0, 0], [0, 9, 9], true)).toBeNull();
  });

  it('falls back to an attribute or a placeholder class', () => {
    const attr = suggestFixes({ winner: one('.a'), target: one('[type=text]'), targetIsLater: false });
    expect(attr.find((f) => f.kind === 'raise')?.code).toContain('[type=text][type=text]');
    const none = suggestFixes({ winner: one('.a'), target: one('p'), targetIsLater: true });
    expect(none.find((f) => f.kind === 'raise')?.code).toContain('p.your-class');
  });
});

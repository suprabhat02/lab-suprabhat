import { describe, expect, it } from 'vitest';
import { resolveCascade, resolveLayerOrder } from '../cascade';
import type { CascadeDeclaration, CascadeInput, CascadeResult } from '../cascade';

let nextOrder = 1;
function decl(id: string, overrides: Partial<CascadeDeclaration> = {}): CascadeDeclaration {
  return {
    id,
    selector: id,
    value: 'red',
    origin: 'author',
    context: 'outer',
    important: false,
    inline: false,
    layer: null,
    scope: null,
    specificity: [0, 0, 1],
    order: nextOrder++,
    ...overrides,
  };
}

function resolve(input: CascadeInput): CascadeResult {
  const r = resolveCascade(input);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe('cascade resolver', () => {
  it('unlayered `p {}` beats `@layer x { #id {} }` for normal declarations', () => {
    const r = resolve({
      layerOrder: ['x'],
      declarations: [decl('p', { order: 2 }), decl('#id', { layer: 'x', specificity: [1, 0, 0], order: 1 })],
    });
    expect(r.winnerId).toBe('p');
    expect(r.decidedAtStep).toBe(4);
    expect(r.summary).toBe(
      'Decided at step 4, layers: the unlayered rule beats any layered rule for normal declarations, so specificity never got a vote.',
    );
  });

  it('`@layer a { p { color: red !important } }` beats unlayered `#id { color: blue !important }`', () => {
    const r = resolve({
      layerOrder: ['a'],
      declarations: [
        decl('p', { layer: 'a', important: true, specificity: [0, 0, 1], order: 1 }),
        decl('#id', { important: true, specificity: [1, 0, 0], value: 'blue', order: 2 }),
      ],
    });
    expect(r.winnerId).toBe('p');
    expect(r.decidedAtStep).toBe(4);
    expect(r.steps[3]?.explanation).toMatch(/order reverses/);
  });

  it('normal inline `style` beats `#id#id`', () => {
    const r = resolve({
      layerOrder: [],
      declarations: [decl('#id#id', { specificity: [2, 0, 0], order: 2 }), decl('inline', { inline: true, order: 1 })],
    });
    expect(r.winnerId).toBe('inline');
    expect(r.decidedAtStep).toBe(3);
  });

  it('inline `!important` beats any author `!important`', () => {
    const r = resolve({
      layerOrder: ['a'],
      declarations: [
        decl('#a#b#c', { important: true, specificity: [3, 0, 0], order: 3 }),
        decl('layered', { important: true, layer: 'a', order: 2 }),
        decl('inline', { inline: true, important: true, order: 1 }),
      ],
    });
    expect(r.winnerId).toBe('inline');
    expect(r.decidedAtStep).toBe(3);
  });

  it('author `!important` beats a normal inline style', () => {
    const r = resolve({
      layerOrder: [],
      declarations: [decl('inline', { inline: true }), decl('p', { important: true })],
    });
    expect(r.winnerId).toBe('p');
    expect(r.decidedAtStep).toBe(1);
  });

  it('`@scope (.c) { p {} }` loses to `.x p`: specificity is checked before proximity', () => {
    const r = resolve({
      layerOrder: [],
      declarations: [
        decl('scoped p', { selector: 'p', scope: { root: '.c', proximity: 1 }, specificity: [0, 0, 1], order: 2 }),
        decl('.x p', { specificity: [0, 1, 1], order: 1 }),
      ],
    });
    expect(r.winnerId).toBe('.x p');
    expect(r.decidedAtStep).toBe(5);
  });

  it('closer scope root wins when specificity ties', () => {
    const r = resolve({
      layerOrder: [],
      declarations: [
        decl('near', { selector: 'p', scope: { root: '.card', proximity: 1 }, order: 1 }),
        decl('far', { selector: 'p', scope: { root: '.page', proximity: 4 }, order: 2 }),
      ],
    });
    expect(r.winnerId).toBe('near');
    expect(r.decidedAtStep).toBe(6);
  });

  it('a scoped rule beats an unscoped one with the same specificity', () => {
    const r = resolve({
      layerOrder: [],
      declarations: [decl('scoped', { scope: { root: '.c', proximity: 9 }, order: 1 }), decl('plain', { order: 2 })],
    });
    expect(r.winnerId).toBe('scoped');
    expect(r.steps[5]?.explanation).toMatch(/infinitely far/);
  });

  it('two equal-specificity rules with the same importance: the later one wins', () => {
    const r = resolve({
      layerOrder: [],
      declarations: [decl('.a', { specificity: [0, 1, 0], order: 1 }), decl('.b', { specificity: [0, 1, 0], order: 2 })],
    });
    expect(r.winnerId).toBe('.b');
    expect(r.decidedAtStep).toBe(7);
    expect(r.steps.slice(0, 6).every((s) => s.outcome === 'tie')).toBe(true);
  });

  it('`@layer a, b;`: b beats a for normal declarations', () => {
    const r = resolve({
      layerOrder: ['a', 'b'],
      declarations: [decl('in-b', { layer: 'b', order: 1 }), decl('in-a', { layer: 'a', specificity: [1, 0, 0], order: 2 })],
    });
    expect(r.winnerId).toBe('in-b');
    expect(r.decidedAtStep).toBe(4);
  });

  it('`@layer a, b;`: a beats b for !important', () => {
    const r = resolve({
      layerOrder: ['a', 'b'],
      declarations: [
        decl('in-b', { layer: 'b', important: true, order: 2 }),
        decl('in-a', { layer: 'a', important: true, order: 1 }),
      ],
    });
    expect(r.winnerId).toBe('in-a');
    expect(r.steps[3]?.explanation).toMatch(/earlier layer `a` beats `b`/);
  });

  it('marks every step after the decision as not reached', () => {
    const r = resolve({
      layerOrder: [],
      declarations: [decl('p', { important: true }), decl('#id', { specificity: [1, 0, 0] })],
    });
    expect(r.steps.map((s) => s.outcome)).toEqual([
      'decided',
      'not-reached',
      'not-reached',
      'not-reached',
      'not-reached',
      'not-reached',
      'not-reached',
    ]);
  });

  it('narrows the field step by step with four declarations', () => {
    const r = resolve({
      layerOrder: ['base'],
      declarations: [
        decl('one', { important: true, specificity: [0, 1, 0], order: 1 }),
        decl('two', { important: true, specificity: [0, 2, 0], order: 2 }),
        decl('three', { order: 3 }),
        decl('four', { important: true, layer: 'base', order: 4 }),
      ],
    });
    expect(r.steps[0]?.outcome).toBe('tie');
    expect(r.steps[0]?.remaining).toEqual(['one', 'two', 'four']);
    expect(r.winnerId).toBe('four');
    expect(r.decidedAtStep).toBe(4);
  });

  it('models shadow context: outer wins for normal, inner wins for !important', () => {
    const normal = resolve({
      layerOrder: [],
      declarations: [decl('inner', { context: 'inner', specificity: [1, 0, 0] }), decl('outer', { context: 'outer' })],
    });
    expect(normal.winnerId).toBe('outer');
    expect(normal.decidedAtStep).toBe(2);
    const important = resolve({
      layerOrder: [],
      declarations: [
        decl('inner', { context: 'inner', important: true }),
        decl('outer', { context: 'outer', important: true, specificity: [1, 0, 0] }),
      ],
    });
    expect(important.winnerId).toBe('inner');
  });

  it('models other origins: transitions beat everything', () => {
    const r = resolve({
      layerOrder: [],
      declarations: [decl('author', { important: true }), decl('transition', { origin: 'transition' })],
    });
    expect(r.winnerId).toBe('transition');
  });

  it('appends undeclared layers in order of first appearance', () => {
    expect(
      resolveLayerOrder({
        layerOrder: ['b'],
        declarations: [decl('x', { layer: 'c', order: 2 }), decl('y', { layer: 'a', order: 1 })],
      }),
    ).toEqual(['b', 'a', 'c']);
  });

  it('handles a single declaration without a contest', () => {
    const r = resolve({ layerOrder: [], declarations: [decl('only')] });
    expect(r.winnerId).toBe('only');
    expect(r.decidedAtStep).toBeNull();
  });

  it('returns errors instead of throwing', () => {
    expect(resolveCascade({ layerOrder: [], declarations: [] }).ok).toBe(false);
    expect(resolveCascade({ layerOrder: [], declarations: [decl('a'), decl('a')] }).ok).toBe(false);
  });
});

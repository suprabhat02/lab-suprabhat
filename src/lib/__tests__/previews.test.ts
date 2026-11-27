import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PREVIEW_SLUGS, isPreviewSlug, previewFor } from '../previews';

const toolsDir = new URL('../../content/tools/', import.meta.url);
const slugs = readdirSync(toolsDir)
  .filter((file) => file.endsWith('.md'))
  .map((file) => /^slug:\s*(\S+)/m.exec(readFileSync(new URL(file, toolsDir), 'utf8'))?.[1]);

describe('card preview registry', () => {
  it('has a preview for every tool in the collection, and nothing else', () => {
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) expect(slug && isPreviewSlug(slug), String(slug)).toBe(true);
    expect([...PREVIEW_SLUGS].sort()).toEqual([...slugs].sort());
  });

  it('fails closed for a tool without a preview', () => {
    expect(() => previewFor('contrast')).toThrow('No card preview for tool "contrast"');
    expect(previewFor('specificity')).toBe('specificity');
  });
});

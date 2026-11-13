import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `public/CNAME` is what keeps the custom domain bound to the Pages
 * deployment. Deleting it silently drops the site back to the
 * github.io host on the next deploy, so it is worth a guard.
 */
const CNAME = fileURLToPath(new URL('../../../../public/CNAME', import.meta.url));

describe('public/CNAME', () => {
  it('names the custom domain on a single line', () => {
    const contents = readFileSync(CNAME, 'utf8');

    expect(contents.trimEnd()).toBe('lab.suprabhat-dev.com');
    expect(contents.trimEnd().split('\n')).toHaveLength(1);
  });

  it('carries no scheme, path or trailing slash', () => {
    const host = readFileSync(CNAME, 'utf8').trim();

    expect(host).not.toMatch(/^https?:\/\//);
    expect(host).not.toContain('/');
  });
});

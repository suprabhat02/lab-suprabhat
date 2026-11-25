import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { versionsFrom } from '../versions';

describe('versionsFrom', () => {
  it('reads installed versions and fails on a missing package', () => {
    const lock = JSON.stringify({ packages: { 'node_modules/a': { version: '1.2.3' } } });
    expect(versionsFrom(lock, ['a'])).toEqual({ a: '1.2.3' });
    expect(() => versionsFrom(lock, ['b'])).toThrow('b is not in package-lock.json.');
  });

  it('matches the installed oracle packages', () => {
    const lock = readFileSync(new URL('../../../../package-lock.json', import.meta.url), 'utf8');
    const installed = JSON.parse(
      readFileSync(
        new URL('../../../../node_modules/dom-accessibility-api/package.json', import.meta.url),
        'utf8',
      ),
    ) as { version: string };
    expect(versionsFrom(lock, ['dom-accessibility-api'])).toEqual({
      'dom-accessibility-api': installed.version,
    });
  });
});

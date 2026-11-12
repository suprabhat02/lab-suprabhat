import { describe, expect, it } from 'vitest';
import { PERSON_ID, WEBSITE_ID, graph, person, website } from '../entities';

describe('person', () => {
  it('is exactly the Person published on suprabhat-dev.com', () => {
    expect(person()).toStrictEqual({
      '@type': 'Person',
      '@id': 'https://suprabhat-dev.com/#person',
      url: 'https://suprabhat-dev.com/',
      name: 'Suprabhat Kumar',
      sameAs: [
        'https://x.com/SuprabhatKarn97',
        'https://dev.to/suprabhat02',
        'https://suprabhatkumar.hashnode.dev',
        'https://www.linkedin.com/in/suprabhatkumar/',
        'https://github.com/suprabhat02',
        'https://www.npmjs.com/~suprabhat02',
      ],
    });
  });
});

describe('graph', () => {
  it('puts the Person and the WebSite first and links the WebSite to the Person by @id', () => {
    const doc = graph([{ '@type': 'Thing', '@id': 'https://example.com/#x' }]);
    expect(doc['@context']).toBe('https://schema.org');
    expect(doc['@graph'].map((n) => n['@id'])).toEqual([PERSON_ID, WEBSITE_ID, 'https://example.com/#x']);
    expect(website().publisher).toEqual({ '@id': PERSON_ID });
  });
});

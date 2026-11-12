/** The site's shared schema.org entities. The Person mirrors the one published on suprabhat-dev.com. */

export const PERSON_ID = 'https://suprabhat-dev.com/#person';
export const WEBSITE_ID = 'https://lab.suprabhat-dev.com/#website';

export interface Person {
  '@type': 'Person';
  '@id': typeof PERSON_ID;
  url: string;
  name: string;
  sameAs: readonly string[];
}

export function person(): Person {
  return {
    '@type': 'Person',
    '@id': PERSON_ID,
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
  };
}

export const ref = (id: string) => ({ '@id': id });

export function website() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: "Suprabhat's Lab",
    url: 'https://lab.suprabhat-dev.com/',
    description: 'Free, open frontend tools and explainers. No sign-up, no paywall, no tracking.',
    inLanguage: 'en',
    publisher: ref(PERSON_ID),
  };
}

/** One JSON-LD document per page, so `@id` references resolve within it. */
export function graph(nodes: readonly Record<string, unknown>[]) {
  return { '@context': 'https://schema.org', '@graph': [person(), website(), ...nodes] };
}

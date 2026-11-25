import { ok } from '../cascade/types';
import type { Result } from '../cascade/types';
import { parseStylesheet } from './parse';
import { metrics } from './metrics';
import type { Metrics } from './metrics';
import { issues } from './issues';
import type { Stylesheet } from './types';

export const DEFAULT_CSS = `@layer base, components;
@layer base {
  :where(#app) a { color: navy; }
}
@layer components {
  .card {
    padding: 1rem;
    & .title { font-weight: bold; }
  }
  :is(.notice, .alert) { color: red; }
}
#app .card { color: purple !important; }
.card .title { color: green; }
a { color: blue; }`;

export interface Audit extends Stylesheet {
  readonly metrics: Metrics;
  readonly issues: ReturnType<typeof issues>;
}
export function analyze(css: string): Result<Audit> {
  const parsed = parseStylesheet(css);
  return parsed.ok
    ? ok({ ...parsed.value, metrics: metrics(parsed.value.entries), issues: issues(parsed.value.entries) })
    : parsed;
}

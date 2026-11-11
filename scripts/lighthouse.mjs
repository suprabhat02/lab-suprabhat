// Runs Lighthouse N times per route against a running preview server and prints medians.
// Usage: npx astro preview --port 4330 (in another terminal), then: node scripts/lighthouse.mjs [runs]
// Optional: LH_ROUTES=/specificity/ LH_PRESETS=mobile to narrow the run.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const runs = Number(process.argv[2] ?? 3);
const base = process.env.LH_BASE ?? 'http://localhost:4330';
const routes = process.env.LH_ROUTES?.split(',') ?? ['/', '/specificity/', '/about/'];
const presets = process.env.LH_PRESETS?.split(',') ?? ['mobile', 'desktop'];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
mkdirSync('.lighthouse', { recursive: true });

for (const preset of presets) {
  for (const route of routes) {
    const scores = { performance: [], accessibility: [], 'best-practices': [], seo: [] };
    const tbt = [];
    const cls = [];
    const lcp = [];
    for (let i = 0; i < runs; i++) {
      const out = `.lighthouse/run.json`;
      const preset_ = preset === 'desktop' ? ' --preset=desktop' : '';
      execSync(
        `npx --yes lighthouse@13.6.0 "${base}${route}" --quiet --chrome-flags="--headless=new" --output=json --output-path=${out}${preset_}`,
        { stdio: 'ignore' },
      );
      const j = JSON.parse(readFileSync(out, 'utf8'));
      for (const k of Object.keys(scores)) scores[k].push(Math.round(j.categories[k].score * 100));
      tbt.push(j.audits['total-blocking-time'].numericValue);
      cls.push(j.audits['cumulative-layout-shift'].numericValue);
      lcp.push(j.audits['largest-contentful-paint'].numericValue);
    }
    console.log(
      `${preset.padEnd(8)} ${route.padEnd(14)} perf ${median(scores.performance)}  a11y ${median(scores.accessibility)}  bp ${median(scores['best-practices'])}  seo ${median(scores.seo)}  LCP ${Math.round(median(lcp))}ms  CLS ${median(cls).toFixed(3)}  TBT ${Math.round(median(tbt))}ms  (perf runs: ${scores.performance.join(', ')})`,
    );
  }
}

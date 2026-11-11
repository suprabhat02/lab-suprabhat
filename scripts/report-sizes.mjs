// Prints gzipped JS/CSS sizes per page and fails the build if a budget is exceeded.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const KB = 1024;
const budgets = { pageJs: 15 * KB, zeroJsPages: ['index.html', 'about/index.html'], css: 20 * KB };

const gz = (file) => gzipSync(readFileSync(join(dist, file))).length;
const fmt = (n) => `${(n / KB).toFixed(2)} KB`;

function walk(dir, out = []) {
  for (const name of readdirSync(join(dist, dir))) {
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(join(dist, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

const files = walk('');
const cssFiles = files.filter((f) => f.endsWith('.css'));
const jsFiles = files.filter((f) => f.endsWith('.js'));
const cssTotal = cssFiles.reduce((sum, f) => sum + gz(f), 0);

let failed = false;
console.log('\nGzipped asset sizes');
for (const f of jsFiles) console.log(`  js   ${fmt(gz(f)).padStart(10)}  ${f}`);
for (const f of cssFiles) console.log(`  css  ${fmt(gz(f)).padStart(10)}  ${f}`);
console.log(`  CSS total: ${fmt(cssTotal)} (budget ${fmt(budgets.css)})`);
if (cssTotal > budgets.css) failed = true;

// JS loaded by each page before interaction: entry scripts plus their static imports.
function staticGraph(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const code = readFileSync(join(dist, entry), 'utf8');
  const dir = entry.split('/').slice(0, -1).join('/');
  for (const m of code.matchAll(
    /\b(?:import|export)\s*(?:[\w*{}\s,$]+from\s*)?["'](\.\.?\/[^"']+\.js)["']/g,
  )) {
    const resolved = posix.normalize(`${dir}/${m[1]}`);
    staticGraph(resolved, seen);
  }
  return seen;
}

for (const page of files.filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(join(dist, page), 'utf8');
  const srcs = [...html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g)].map((m) => m[1]);
  const inline = [...html.matchAll(/<script(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .join('');
  const graph = new Set();
  for (const src of srcs) staticGraph(src, graph);
  const external = [...graph].reduce((sum, src) => sum + gz(src), 0);
  const inlineGz = inline ? gzipSync(inline).length : 0;
  const total = external + inlineGz;
  const zeroJs = budgets.zeroJsPages.includes(page);
  const over = zeroJs ? external > 0 : total > budgets.pageJs;
  if (over) failed = true;
  console.log(
    `  page ${page.padEnd(26)} initial JS ${fmt(total).padStart(10)} (bundled ${fmt(external)}, inline ${fmt(inlineGz)})${over ? '  OVER BUDGET' : ''}`,
  );
}

if (failed) {
  console.error('\nA performance budget was exceeded.');
  process.exit(1);
}
console.log('All budgets met.\n');

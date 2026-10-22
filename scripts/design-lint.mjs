// Design-system lint: app CSS may only use the tokens. Fails when a raw colour, font size, font weight or letter spacing is added.
// Usage: node scripts/design-lint.mjs            check against the baseline (exit 1 on any increase)
//        node scripts/design-lint.mjs --update   lower the baseline after you remove exceptions (it never raises it)
//        node scripts/design-lint.mjs --list     print every current exception
//
// Rules (see docs/design/DESIGN-SYSTEM.md):
//   colour   no hex, rgb(), rgba() or hsl(), except black-alpha shadows (rgba(0,0,0,x)), inside var(--x, fallback), and in data: URIs.
//   size     font-size is a role token (--t-*-size, legacy --text-*), a figure token (--fig-*, --num-*), inherit, or calc/clamp built from a token.
//   weight   font-weight is one of the five --weight-* tokens, or a --t-*-weight role.
//   tracking letter-spacing is a --tracking-* / --t-*-tracking token, 0, normal or inherit.
// Skipped on purpose: tokens.css (the source), loader.css (runs before the tokens load), the marketing site, the gallery, the styleguide.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'src';
const BASELINE = 'scripts/design-lint.baseline.json';
const SKIP = ['pages/site', 'components/site', 'pages/dev', 'pages/styleguide', 'pages/download', 'features/demo', 'styles/tokens.css', 'styles/loader.css', 'brand/pact-logo.css', 'landing.css', 'mockups'];
const args = new Set(process.argv.slice(2));

const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.css')) files.push(p); } };
walk(ROOT);

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/url\(\s*(["']?)data:[^)]*\)/g, (m) => m.replace(/[^\n]/g, ' '));
const found = [];
for (const f of files) {
  const rel = relative(ROOT, f);
  if (SKIP.some((k) => rel.includes(k))) continue;
  const lines = strip(readFileSync(f, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    const at = (rule, text) => found.push({ rule, file: rel, line: i + 1, text: text.trim().slice(0, 100) });
    // colour: remove allowed shapes first
    let c = line.replace(/var\(\s*--[\w-]+\s*,[^)]*\)/g, '').replace(/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,[^)]*\)/g, '');
    if (/#[0-9a-fA-F]{3,8}\b/.test(c) || /\b(?:rgba?|hsla?)\(/.test(c)) at('colour', line);
    const size = /font-size\s*:\s*([^;}]+)/.exec(line);
    if (size) {
      const v = size[1].trim();
      const ok = /^(inherit|initial|unset)$/.test(v) || /^var\(--(t-[a-z-]+-size|text-[a-z0-9]+|num-[a-z0-9-]+|fig-[a-z0-9]+|amount-fs)\)$/.test(v) || (/^(calc|clamp|max|min)\(/.test(v) && /var\(--/.test(v));
      if (!ok) at('size', line);
    }
    const w = /font-weight\s*:\s*([^;}]+)/.exec(line);
    if (w) { const v = w[1].trim(); if (!(/^var\(--(weight-(regular|medium|semibold|bold|heavy)|t-[a-z]+-weight)\)$/.test(v) || /^(inherit|initial|unset)$/.test(v))) at('weight', line); }
    const l = /letter-spacing\s*:\s*([^;}]+)/.exec(line);
    if (l) { const v = l[1].trim(); if (!(/^var\(--(tracking-[a-z]+|t-[a-z]+-tracking)\)$/.test(v) || /^(0|normal|inherit|initial)$/.test(v) || /^0?\.?\d+em$/.test(v) && Number(v.replace('em', '')) >= 0)) at('tracking', line); }
  });
}

const counts = {};
for (const x of found) counts[x.rule] = (counts[x.rule] ?? 0) + 1;
const perFile = {};
for (const x of found) { perFile[x.file] ??= {}; perFile[x.file][x.rule] = (perFile[x.file][x.rule] ?? 0) + 1; }

if (args.has('--list')) { for (const x of found) console.log(`${x.rule.padEnd(8)} ${x.file}:${x.line}  ${x.text}`); }

if (!existsSync(BASELINE) || args.has('--init')) { writeFileSync(BASELINE, JSON.stringify(perFile, null, 1) + '\n'); console.log('baseline written:', counts); process.exit(0); }
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const fails = [];
const lowered = JSON.parse(JSON.stringify(base));
for (const [file, rules] of Object.entries(perFile)) for (const [rule, n] of Object.entries(rules)) {
  const was = base[file]?.[rule] ?? 0;
  if (n > was) fails.push(`${file}: ${n - was} new raw ${rule} value(s) (${was} allowed). ${found.filter((x) => x.file === file && x.rule === rule).slice(-(n - was)).map((x) => `line ${x.line}: ${x.text}`).join(' | ')}`);
}
for (const [file, rules] of Object.entries(base)) for (const [rule, was] of Object.entries(rules)) { const n = perFile[file]?.[rule] ?? 0; if (n < was) { lowered[file][rule] = n; if (!n) delete lowered[file][rule]; } }
for (const k of Object.keys(lowered)) if (!Object.keys(lowered[k]).length) delete lowered[k];
if (args.has('--update')) { writeFileSync(BASELINE, JSON.stringify(lowered, null, 1) + '\n'); console.log('baseline lowered'); }
console.log(`design lint: ${Object.values(counts).reduce((a, b) => a + b, 0)} existing exceptions (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})`);
if (fails.length) { console.error('\nFAIL: new raw values. Use a token (see docs/design/DESIGN-SYSTEM.md):\n' + fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('design lint: ok');

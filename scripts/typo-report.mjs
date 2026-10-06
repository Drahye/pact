// Reads the rendered-type dump from contrast-audit.mjs (typo.json) and reports how well the type roles are followed.
// Usage: node scripts/typo-report.mjs [/tmp/contrast-full/typo.json] [--theme=light]
import { readFileSync } from 'node:fs';
const file = process.argv.find((a) => a.endsWith('.json')) ?? '/tmp/contrast-full/typo.json';
const theme = (process.argv.find((a) => a.startsWith('--theme=')) ?? '--theme=light').split('=')[1];
const rows = JSON.parse(readFileSync(file, 'utf8')).filter((r) => r.theme === theme);
// The role scale, in px at a 16px root. Sizes that are clamp()s (display, page, hero numerals) are listed by their phone-width result.
const SCALE = new Map([[11, 'label'], [12, 'caption'], [13, 'meta'], [14, 'sm'], [15, 'support'], [16, 'body'], [17, 'lead'], [18, 'lg'], [19, 'object'], [20, 'h-sm'], [22, 'title'], [24, 'h4'], [28, 'h3'], [32, 'h2']]);
const key = (r) => `${Math.round(r.size * 100) / 100}px/${r.weight}`;
const bySize = new Map();
for (const r of rows) { const k = key(r); const g = bySize.get(k) ?? { n: 0, screens: new Set(), sigs: new Map(), r }; g.n++; g.screens.add(r.screen); g.sigs.set(r.sig, (g.sigs.get(r.sig) ?? 0) + 1); bySize.set(k, g); }
console.log(`${rows.length} text lines, ${bySize.size} distinct size/weight pairs (${theme})\n`);
const sizes = new Map();
for (const r of rows) sizes.set(Math.round(r.size * 100) / 100, (sizes.get(Math.round(r.size * 100) / 100) ?? 0) + 1);
console.log('SIZES (px: lines)');
console.log([...sizes].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}:${n}`).join('  '));
console.log('\nPAIRS by size');
for (const [k, g] of [...bySize].sort((a, b) => a[1].r.size - b[1].r.size || a[1].r.weight - b[1].r.weight)) {
  const top = [...g.sigs].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, n]) => `${s.slice(0, 38)}×${n}`).join('  ');
  console.log(`${k.padEnd(14)} n=${String(g.n).padStart(4)} screens=${String(g.screens.size).padStart(2)}  ${top}`);
}
// Hierarchy: on each screen, list the distinct size/weight ladder top to bottom, flag when a lower-ranked piece of text is as large as a title.
console.log('\nOFF-SCALE sizes (not a role size)');
for (const [s, n] of [...sizes].sort((a, b) => b[1] - a[1])) if (![...SCALE.keys()].includes(s) && s < 30) {
  const ex = rows.filter((r) => Math.round(r.size * 100) / 100 === s).slice(0, 3).map((r) => `${r.sig.slice(0, 34)} "${r.text.slice(0, 18)}" (${r.screen})`).join('  |  ');
  console.log(`${String(s).padEnd(6)} n=${String(n).padStart(3)}  ${ex}`);
}
console.log('\nSMALL text under 12px');
for (const r of rows.filter((x) => x.size < 12 && !x.numeric).slice(0, 25)) console.log(`${r.size}px/${r.weight} ${r.tt} ${r.sig.slice(0, 40)} "${r.text.slice(0, 20)}" (${r.screen})`);
console.log('\nWEIGHTS');
const w = new Map(); for (const r of rows) w.set(r.weight, (w.get(r.weight) ?? 0) + 1);
console.log([...w].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}:${n}`).join('  '));
console.log('\nLINE-HEIGHT / size ratio outliers (multi-line text risk)');
for (const r of rows) { const lh = parseFloat(r.lh); if (!isNaN(lh)) { const q = lh / r.size; r.q = q; } }
const tight = rows.filter((r) => r.q && r.q < 1.12 && r.size < 28 && r.rects).slice(0, 0);
const lhs = new Map(); for (const r of rows) if (r.q) { const k = `${Math.round(r.size)}px lh ${r.q.toFixed(2)}`; lhs.set(k, (lhs.get(k) ?? 0) + 1); }
console.log([...lhs].filter(([k]) => parseFloat(k) < 24).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([k, n]) => `${k}:${n}`).join('  '));

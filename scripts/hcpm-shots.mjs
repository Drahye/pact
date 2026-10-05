// Home / Circle / Plan / Me captures (full page) for the redesign review.
// Usage: node scripts/hcpm-shots.mjs <outDir> [--w=390,430] [--theme=light|dark]   (after scripts/detail-up.sh; uses the saved session once)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const out = process.argv[2] ?? 'exports/hcpm';
const widths = arg('w', '390').split(',').map(Number);
const themes = arg('theme', 'light').split(',');
const BASE = 'http://localhost:5174';
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const screens = [['home', '/app/home'], ['circle', `/app/circles/${ids.boys}`], ['circle-quiet', `/app/circles/${ids.circleQuiet}`], ['plan', `/app/plans/${ids.planOpen}`], ['plan-converted', `/app/plans/${ids.planConverted}`], ['pact-active', `/app/pact/${ids.pactActive}`], ['pact-progress', `/app/pact/${ids.pactProgress}`], ['pact-completed', `/app/pact/${ids.pactCompleted}`], ['me', '/app/profile']];
const ctx = await browser.newContext({ viewport: { width: widths[0], height: 844 }, storageState: '/tmp/detail-state.json' });
await ctx.addInitScript((t) => { try { localStorage.setItem('pact.theme', t); } catch {} }, themes[0]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
for (const w of widths) {
  await page.setViewportSize({ width: w, height: 844 });
  for (const [name, path] of screens) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}/${name}-${themes[0]}-${w}.png`, fullPage: true });
  }
}
// Keep the rotated session so the next run (another theme or width) continues the same chain instead of replaying a spent cookie.
await ctx.storageState({ path: '/tmp/detail-state.json' });
console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'captured, no page errors');
await browser.close();

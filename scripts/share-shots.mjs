// Phase E: every shared/public state, signed out (default) or as a signed-in non-member (--in).
// Usage: node scripts/share-shots.mjs <outDir> [--w=360,390,430] [--theme=light|dark] [--only=ask,plan] [--in] [--axe]
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const out = process.argv[2] ?? 'exports/phase-e';
const BASE = 'http://localhost:5174';
const widths = arg('w', '390').split(',').map(Number);
const theme = arg('theme', 'light');
const only = arg('only', '').split(',').filter(Boolean);
const signedIn = process.argv.includes('--in');
const withAxe = process.argv.includes('--axe');
const T = JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')).tokens;
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const screens = [
  ['ask-open', `/a/${T.ask}`], ['ask-attendance', `/a/${T.askAttendance}`], ['ask-closed', `/a/${T.askClosed}`], ['ask-gone', `/a/${'x'.repeat(43)}`],
  ['plan-open', `/p/${T.plan}`], ['plan-done', `/p/${T.planDone}`], ['plan-pact', `/p/${T.planPact}`],
  ['split-open', `/s/${T.split}`], ['split-settled', `/s/${T.splitSettled}`],
  ['circle', `/app/c/${T.circle}`], ['circle-revoked', `/app/c/${T.circleRevoked}`],
  ['recap-pact', `/r/${T.recapPact}`], ['recap-split', `/r/${T.recapSplit}`],
].filter(([n]) => !only.length || only.some((o) => n.startsWith(o)));
let state;
if (signedIn) {
  const phone = `80${String(Date.now()).slice(-8)}`;
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  await p.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await p.getByLabel('Mobile number').fill(phone);
  await p.getByRole('button', { name: 'Send code' }).click();
  await p.getByRole('button', { name: 'Fill it in' }).click();
  await p.getByLabel('First name').waitFor({ timeout: 15000 });
  await p.getByLabel('First name').fill('Kemi');
  await p.getByLabel('Last name').fill('Visitor');
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.waitForURL(/\/app\/(home|onboarding)/, { timeout: 15000 });
  state = await c.storageState();
  await c.close();
}
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, deviceScaleFactor: width >= 768 ? 1 : 2, colorScheme: theme, ...(state ? { storageState: state } : {}) });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [name, path] of screens) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1700);
    const tag = `${out}/${width}-${theme}-${signedIn ? 'in' : 'out'}-${name}`;
    await page.screenshot({ path: `${tag}.png` });
    if (width < 600) {
      await page.setViewportSize({ width, height: 1800 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${tag}-full.png` });
      await page.setViewportSize({ width, height: 844 });
    }
    if (withAxe) {
      await page.addScriptTag({ content: axeSource });
      const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
      const h1 = await page.locator('h1').count();
      console.log(r.violations.length || h1 !== 1 ? ' FAIL ' : '  ok  ', `axe ${width} ${theme} ${signedIn ? 'in' : 'out'} ${name} h1=${h1}`, r.violations.map((v) => `${v.id}:${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join('|')}`).join(' ; '));
    }
  }
  console.log('✓', width, theme, signedIn ? 'signed in' : 'signed out', errors.length ? `${errors.length} page errors: ${[...new Set(errors)].slice(0, 2).join(' | ')}` : 'no page errors');
  await ctx.close();
}
await browser.close();

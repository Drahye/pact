// Phase F captures. Usage: node scripts/f-shots.mjs <outDir> [--w=390,430] [--theme=light|dark] [--only=profile,activity] [--out]
// Signed in as Abraham (scripts/detail-up.sh first); --out captures the signed-out screens instead.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const out = process.argv[2] ?? 'exports/phase-f';
const BASE = 'http://localhost:5174';
const widths = arg('w', '390').split(',').map(Number);
const theme = arg('theme', 'light');
const only = arg('only', '').split(',').filter(Boolean);
const signedOut = process.argv.includes('--out');
const withAxe = process.argv.includes('--axe');
// --mock=emailonly|configured|phone: stands in for /api/me/account so Me shows each way of being verified (a stand-in; the demo account is phone-only).
const mock = arg('mock', '');
const ACCOUNT = { emailonly: { email: { address: 'kemi.ade@example.com' }, google: { connected: false, email: null }, phone: null, hasPin: false, signInMethods: 1 }, configured: { email: { address: 'abraham.okafor@example.com' }, google: { connected: true, email: 'abraham.okafor@example.com' }, phone: { number: '08010000001' }, hasPin: true, signInMethods: 3 }, phone: { email: null, google: { connected: false, email: null }, phone: { number: '08010000001' }, hasPin: true, signInMethods: 1 } };
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const inScreens = [
  ['activity', '/app/activity'], ['profile', '/app/profile'], ['settings', '/app/profile/settings'], ['account', '/app/profile/account'], ['security', '/app/profile/security'],
  ['start-1', '/app/start'], ['home', '/app/home'], ['circles', '/app/circles'], ['pacts', '/app/pacts'], ['notifications', '/app/notifications'],
  ['recap-pact', `/app/recap/pact/${ids.pactCompleted}`], ['recap-split', `/app/recap/split/${ids.splitSettled}`],
];
const outScreens = [['welcome', '/app'], ['get-started', '/app/auth/start'], ['sign-in', '/app/auth/signin'], ['email', '/app/auth/email'], ['phone', '/app/auth/phone']];
const screens = (signedOut ? outScreens : inScreens).filter(([n]) => !only.length || only.some((o) => n.startsWith(o)));
let state;
if (!signedOut) state = JSON.parse(readFileSync('/tmp/detail-state.json', 'utf8'));
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, deviceScaleFactor: width >= 768 ? 1 : 2, colorScheme: theme, ...(state ? { storageState: state } : {}) });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
  const page = await ctx.newPage();
  if (mock) await page.route('**/api/me/account', (r) => r.fulfill({ json: ACCOUNT[mock] }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [name, path] of screens) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    const tag = `${out}/${width}-${theme}-${mock ? mock + '-' : ''}${name}`;
    await page.screenshot({ path: `${tag}.png` });
    if (width < 600) {
      await page.setViewportSize({ width, height: Number(arg('tall', 2200)) });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${tag}-full.png` });
      await page.setViewportSize({ width, height: 844 });
    }
    if (withAxe) {
      await page.addScriptTag({ content: axeSource });
      const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
      const h1 = await page.locator('h1').count();
      console.log(r.violations.length || h1 !== 1 ? ' FAIL ' : '  ok  ', `axe ${width} ${theme} ${name} h1=${h1}`, r.violations.map((v) => `${v.id}:${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join('|')}`).join(' ; '));
    }
  }
  if (!signedOut) { state = await ctx.storageState(); writeFileSync('/tmp/detail-state.json', JSON.stringify(state)); }
  console.log('✓', width, theme, signedOut ? 'signed out' : 'signed in', errors.length ? `${errors.length} page errors: ${[...new Set(errors)].slice(0, 2).join(' | ')}` : 'no page errors');
  await ctx.close();
}
await browser.close();

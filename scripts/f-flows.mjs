// Phase F flows: guided start (every step, then create), auth screens (Google present, email, OTP), a brand-new person's empty states.
// Usage: node scripts/f-flows.mjs <outDir> [--w=390,430,768,1440] [--theme=light|dark] [--axe]
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const out = process.argv[2] ?? 'exports/phase-f';
const BASE = 'http://localhost:5174';
const widths = arg('w', '390').split(',').map(Number);
const theme = arg('theme', 'light');
const withAxe = process.argv.includes('--axe');
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const results = [];
const ok = (name, pass, extra = '') => { results.push(pass); console.log(pass ? '  ok  ' : ' FAIL ', name, extra); };
let n = 0;
const phone = () => `80${String(Date.now()).slice(-7)}${n++}`.slice(0, 10);
const axe = async (page, name) => {
  if (!withAxe) return;
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  ok(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}:${v.nodes.slice(0, 2).map((x) => x.target.join(' ')).join('|')}`).join(' ; '));
};
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, deviceScaleFactor: width >= 768 ? 1 : 2, colorScheme: theme });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${width}-${theme}-${name}.png` }); };
  // Google is off on the demo stack (no Stytch): show the door as it looks where it is on.
  await page.route('**/api/config', async (r) => { const res = await r.fetch(); const j = await res.json(); j.auth = { ...(j.auth ?? {}), stytchGoogle: true, email: true }; await r.fulfill({ response: res, json: j }); });

  // ---- Auth, signed out
  await page.goto(`${BASE}/app`, { waitUntil: 'load' }); await page.waitForTimeout(1800);
  await shot('auth-0-welcome');
  await page.goto(`${BASE}/app/auth/start`, { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await shot('auth-1-get-started');
  ok('auth: Google is offered where it is on', (await page.getByRole('button', { name: 'Continue with Google' }).count()) === 1);
  ok('auth: email stays open beneath it', (await page.getByLabel('Email address').count()) === 1);
  ok('auth: no dev or staging words', !/Dev note|STYTCH|Sandbox/.test(await page.locator('main').innerText()) || (process.env.ALLOW_DEV === '1'));
  await axe(page, 'auth get started');
  await page.goto(`${BASE}/app/auth/signin`, { waitUntil: 'load' }); await page.waitForTimeout(900);
  await shot('auth-2-sign-in');
  await page.getByLabel('Email address').fill(`ada.${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.waitForURL(/auth\/email-code/);
  await page.waitForTimeout(700);
  await shot('auth-3-email-code');
  ok('auth: Resend and Change email are both there, same size', await page.evaluate(() => { const r = [...document.querySelectorAll('.auth__resend > *')].map((e) => Math.round(e.getBoundingClientRect().height)); return r.length === 2 && Math.abs(r[0] - r[1]) <= 2 && r.every((h) => h >= 44); }));
  await axe(page, 'auth email code');
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' }); await page.waitForTimeout(900);
  await shot('auth-4-phone');

  // ---- A brand-new person: guided start, then empty states
  const p = phone();
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await page.getByLabel('Mobile number').fill(p);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
  await page.getByLabel('First name').waitFor({ timeout: 15000 });
  await page.getByLabel('First name').fill('Nia'); await page.getByLabel('Last name').fill('Newcomer');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/app\/(home|onboarding)/, { timeout: 15000 });
  await page.evaluate(async () => { const r = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'x-pact-client': 'web', 'content-type': 'application/json' }, body: '{}' }); const t = await r.json(); const me = await (await fetch('/api/me', { headers: { authorization: `Bearer ${t.accessToken}` } })).json(); localStorage.setItem(`pact.onboarding.${me.id ?? me.data?.id}`, JSON.stringify({ version: 1, how: 'skipped', at: new Date().toISOString() })); });
  for (const [name, path] of [['empty-home', '/app/home'], ['empty-circles', '/app/circles'], ['empty-activity', '/app/activity'], ['empty-pacts', '/app/pacts'], ['empty-me', '/app/profile']]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' }); await page.waitForTimeout(1500); await shot(name);
    if (name === 'empty-activity') ok('empty activity says what will happen', (await page.getByText('When your people start moving').count()) === 1);
    if (name === 'empty-me') ok('empty Me has a place for Circles and for finished things', (await page.getByText('Nothing made it all the way yet.').count()) === 1);
    await axe(page, name);
  }
  // Guided start
  await page.goto(`${BASE}/app/start`, { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await shot('start-1-kind');
  await axe(page, 'guided start kind');
  ok('start: Next waits for a choice', await page.getByRole('button', { name: 'Next', exact: true }).isDisabled());
  await page.getByRole('radio', { name: 'Trip' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Name').fill('Ibadan road trip');
  await shot('start-2-name');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'In a month' }).click();
  await shot('start-3-when');
  await axe(page, 'guided start when');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /₦250,000/ }).click();
  await shot('start-4-amount');
  await axe(page, 'guided start amount');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForTimeout(500);
  ok('start: Back keeps the date', (await page.getByRole('button', { name: 'In a month' }).getAttribute('aria-pressed')) === 'true');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Create Pact' }).click();
  await page.waitForTimeout(500);
  await shot('start-5-made');
  await page.waitForURL(/\/app\/pact\/[0-9a-f-]{36}\/invite/, { timeout: 9000 });
  ok('start: lands on inviting people', true);
  console.log(errors.length ? `   page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}` : '   no page errors');
  await ctx.close();
}
await browser.close();
console.log(results.every(Boolean) ? 'ALL PASS' : `${results.filter((x) => !x).length} FAILED`);

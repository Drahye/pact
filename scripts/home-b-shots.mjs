// Phase B Home captures: populated at 360 / 390 / 430 / 768 / 1024 / 1440, dark at 430, empty (new person) at 390 and 430, and close-ups of each section.
// Usage: node scripts/home-b-shots.mjs <outDir> [base]   (fresh demo stack + home-fixture first)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
const out = process.argv[2] ?? 'exports/home-b';
const BASE = (process.argv[3] ?? 'http://localhost:5174').replace(/\/$/, '');
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});

async function signIn(ctx, phone, name) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
  if (name) {
    await page.getByLabel('First name').waitFor({ timeout: 15000 });
    await page.getByLabel('First name').fill(name);
    await page.getByLabel('Last name').fill('Newcomer');
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await page.waitForURL(/\/app\/(home|onboarding)/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.close();
}


// A brand new person is sent to the intro once. Mark it seen (as finishing it would) so Home itself is what is shown.
async function skipIntro(page) {
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'x-pact-client': 'web', 'content-type': 'application/json' }, body: '{}' });
    const t = await r.json();
    const me = await (await fetch('/api/me', { headers: { authorization: `Bearer ${t.accessToken}` } })).json();
    localStorage.setItem(`pact.onboarding.${me.id ?? me.data?.id}`, JSON.stringify({ version: 1, how: 'skipped', at: new Date().toISOString() }));
  });
}

const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
await signIn(first, '8010000001');
let state = await first.storageState();
await first.close();

for (const [width, theme] of [[390, 'light'], [430, 'light'], [430, 'dark'], [360, 'light'], [768, 'light'], [1024, 'light'], [1440, 'light']]) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, deviceScaleFactor: width >= 768 ? 1 : 2, colorScheme: theme, storageState: state });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
  await page.locator('.home__header').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1800);
  const tag = `${width}-${theme}`;
  await page.screenshot({ path: `${out}/${tag}-fold.png` });
  if (width < 600) {
    await page.setViewportSize({ width, height: 3400 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${tag}-full.png` });
  } else {
    const moved = await page.evaluate(() => { const el = document.querySelector('.screen'); if (!el || el.scrollHeight <= el.clientHeight + 40) return false; el.scrollTop = el.clientHeight * 0.85; return true; });
    if (moved) { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${tag}-b.png` }); }
  }
  if (width === 390) {
    await page.setViewportSize({ width, height: 3400 });
    await page.waitForTimeout(700);
    for (const [name, sel] of [['needs-you', 'section[aria-labelledby="needs-you-h"]'], ['circles', 'section[aria-labelledby="hv2-circles-h"]'], ['coming-up', 'section[aria-labelledby="hv2-soon-h"]'], ['recent', 'section[aria-labelledby="hv2-recent-h"]'], ['made-it-happen', 'section[aria-labelledby="hv2-recap-h"]'], ['prompt', '.strip']]) {
      const el = page.locator(sel).first();
      if (await el.count()) await el.screenshot({ path: `${out}/closeup-${name}.png` });
    }
  }
  console.log('✓', tag, errors.length ? `(${errors.length} page errors: ${errors[0]})` : '');
  state = await ctx.storageState();
  await ctx.close();
}

// A new person: nothing yet.
const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await signIn(fresh, '8099990021', 'Daniel');
const p = await fresh.newPage();
await p.goto(`${BASE}/app/home`, { waitUntil: 'load' });
// A brand new person is sent to the intro once; skip it so Home itself is shown.
await skipIntro(p);
await p.goto(`${BASE}/app/home`, { waitUntil: 'load' });
await p.waitForTimeout(1500);
console.log('new person url', p.url());
await p.screenshot({ path: `${out}/390-empty-fold.png` });
await p.setViewportSize({ width: 390, height: 2400 });
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/390-empty-full.png` });
await fresh.close();

const f430 = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
await signIn(f430, '8099990022', 'Daniel');
const p4 = await f430.newPage();
await p4.goto(`${BASE}/app/home`, { waitUntil: 'load' });
await skipIntro(p4);
await p4.goto(`${BASE}/app/home`, { waitUntil: 'load' });
await p4.waitForTimeout(1500);
await p4.screenshot({ path: `${out}/430-empty-fold.png` });
await browser.close();

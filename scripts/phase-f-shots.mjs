// Phase F screens: Activity, Me, Circles list, Pacts list, Notifications; and the empty versions for a brand new person.
// Usage: node scripts/phase-f-shots.mjs <outDir> [base] [widths...]   (demo stack + home-fixture + phase-c-fixture first)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
const out = process.argv[2] ?? 'exports/phase-f';
const BASE = (process.argv[3] ?? 'http://localhost:5174').replace(/\/$/, '');
const widths = process.argv.slice(4).map(Number).filter(Boolean);
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
  await page.waitForTimeout(1200);
  await page.close();
}

const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
await signIn(first, '8010000001');
let state = await first.storageState();
await first.close();

const screens = [['activity', '/app/activity'], ['me', '/app/profile'], ['circles', '/app/circles'], ['pacts', '/app/pacts'], ['notifications', '/app/notifications']];
for (const width of widths.length ? widths : [390, 430, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, deviceScaleFactor: width >= 768 ? 1 : 2, storageState: state });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [name, path] of screens) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${width}-${name}.png`, fullPage: width < 600 });
    if (width >= 600) {
      const moved = await page.evaluate(() => { const el = document.querySelector('.screen'); if (!el || el.scrollHeight <= el.clientHeight + 40) return false; el.scrollTop = el.clientHeight * 0.85; return true; });
      if (moved) { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${width}-${name}-b.png` }); }
    }
  }
  console.log('✓', width, errors.length ? `(${errors.length} page errors: ${errors[0]})` : '');
  state = await ctx.storageState();
  await ctx.close();
}

// A brand new person: nothing yet, so every empty state is the first thing they see.
const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await signIn(fresh, '8099990011', 'Nia');
const page = await fresh.newPage();
for (const [name, path] of [['empty-circles', '/app/circles'], ['empty-pacts', '/app/pacts'], ['empty-activity', '/app/activity'], ['empty-notifications', '/app/notifications'], ['empty-me', '/app/profile']]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${out}/390-${name}.png`, fullPage: true });
}
console.log('✓ new person');
await browser.close();

// Phase F: Activity grouped by day, Me as identity first, Circles as tiles, and honest empty states for someone new.
// Usage: node scripts/phase-f-check.mjs [base]   (demo stack + home-fixture + phase-c-fixture first)
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
const BASE = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const results = [];
const check = (name, ok, detail = '') => (results.push(ok), console.log(ok ? '✓' : '✗', name, detail));
const errors = [];

async function signIn(ctx, phone, name) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
  if (name) {
    await page.getByLabel('First name').waitFor({ timeout: 15000 });
    await page.getByLabel('First name').fill(name);
    await page.getByLabel('Last name').fill('Check');
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await page.waitForURL(/\/app\/(home|onboarding)/, { timeout: 15000 });
  await page.waitForTimeout(800);
  return page;
}

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await signIn(ctx, '8010000001');

await page.goto(`${BASE}/app/activity`, { waitUntil: 'load' });
await page.locator('.hv3-day').first().waitFor();
const days = await page.locator('.hv3-day__name').allInnerTexts();
check('Activity: grouped by day (Today first)', /^today$/i.test(days[0]), JSON.stringify(days));
check('Activity: rows say who did what, with the kind of thing it was', (await page.locator('.hv3-day .ox-who__kind').count()) > 0 && (await page.locator('.ox-activity__time').first().innerText()).length > 0);

await page.goto(`${BASE}/app/profile`, { waitUntil: 'load' });
await page.locator('.me__proof').first().waitFor({ timeout: 8000 });
await page.locator('#hv2-circles-h').waitFor({ timeout: 8000 });
check('Me: name and what has been proven come first', (await page.locator('.me__proof').count()) >= 2);
check('Me: Circles and finished things before settings', await page.evaluate(() => { const t = [...document.querySelectorAll('.screen__content h2, .screen__content .menu-label')].map((e) => e.textContent.trim()); return t.indexOf('Your Circles') >= 0 && t.indexOf('Your Circles') < t.indexOf('Identity and security') && t.indexOf('Identity and security') < t.indexOf('Settings'); }));

await page.goto(`${BASE}/app/circles`, { waitUntil: 'load' });
await page.locator('.ch-tiles').waitFor();
check('Circles: tiles with a live line, and a way to add one', (await page.locator('.ch-tiles .ox-circle').count()) >= 3 && (await page.locator('.ch-tiles__new').count()) === 1);
const tile = await page.locator('.ch-tiles .ox-circle').first().click().then(() => page.waitForURL(/\/app\/circles\/[0-9a-f-]{36}/)).then(() => true).catch(() => false);
check('Circles: a tile opens its Circle', tile);

// A brand new person
const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await signIn(fresh, '8099990012', 'Nia');
await p2.goto(`${BASE}/app/circles`, { waitUntil: 'load' });
await p2.locator('.empty').waitFor();
check('No Circles: starts with the people you already plan with', /Start with the people you already plan with/.test(await p2.locator('.empty').innerText()));
await p2.goto(`${BASE}/app/pacts`, { waitUntil: 'load' });
await p2.locator('.empty').waitFor();
check('No Pacts: turns a plan into something to commit to', /Turn a plan into something everyone can commit to/.test(await p2.locator('.empty').innerText()));
await p2.goto(`${BASE}/app/activity`, { waitUntil: 'load' });
await p2.locator('.empty').waitFor();
check('No activity: says what will appear', /see it here/.test(await p2.locator('.empty').innerText()));
await p2.goto(`${BASE}/app/notifications`, { waitUntil: 'load' });
await p2.locator('.done').waitFor();
check('No notifications: a completion state, not "No items"', /all caught up/.test(await p2.locator('.done').innerText()));

// 320px with reduced motion: no horizontal overflow
const small = await browser.newContext({ viewport: { width: 320, height: 700 }, reducedMotion: 'reduce', storageState: await ctx.storageState() });
const p3 = await small.newPage();
for (const path of ['/app/activity', '/app/profile', '/app/circles', '/app/pacts', '/app/notifications']) {
  await p3.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await p3.waitForTimeout(900);
  const over = await p3.evaluate(() => { const el = document.querySelector('.screen'); return el ? el.scrollWidth - el.clientWidth : 0; });
  check(`320px: no horizontal overflow on ${path}`, over <= 0, `(${over}px)`);
}
check('no page errors', errors.length === 0, errors[0] ?? '');
await browser.close();
console.log(results.every(Boolean) ? 'all phase F checks passed' : 'SOME CHECKS FAILED');
process.exit(results.every(Boolean) ? 0 : 1);

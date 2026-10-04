// Home screenshots for review: 390 light, 390 dark and 430 light, each at phone height and as one tall frame.
// Usage: node scripts/home-shots.mjs <outDir> [base]   (needs the demo stack and scripts/home-fixture.mjs)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'exports/home';
const BASE = (process.argv[3] ?? 'http://localhost:5174').replace(/\/$/, '');
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});

const variants = [
  { name: '390-light', width: 390, theme: 'light' },
  { name: '390-dark', width: 390, theme: 'dark' },
  { name: '430-light', width: 430, theme: 'light' },
];
for (const v of variants) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: 844 }, deviceScaleFactor: 2, colorScheme: v.theme });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), v.theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await page.getByLabel('Mobile number').fill('8010000001');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
  await page.locator('.home__header').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${v.name}-fold.png` });
  await page.setViewportSize({ width: v.width, height: 3400 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${v.name}-full.png` });
  console.log('✓', v.name, errors.length ? `(${errors.length} page errors: ${errors[0]})` : '');
  await ctx.close();
}
await browser.close();

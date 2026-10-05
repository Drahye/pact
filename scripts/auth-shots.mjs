// Auth screenshots at 390 and 430: introduction, the way in, and the code screen (empty, partly typed, error).
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'exports/auth';
const BASE = (process.argv[3] ?? 'http://localhost:5179').replace(/\/$/, '');
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
for (const width of [390, 430]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/app/auth/welcome`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Get started' }).or(page.getByRole('link', { name: 'Get started' })).waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${width}-1-intro.png` });
  await page.getByRole('link', { name: 'Get started' }).click();
  await page.getByLabel('Email address').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${width}-2-entry.png` });
  await page.getByLabel('Email address').fill(`shots.${width}@example.com`);
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.locator('.code-field__input').waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${width}-3-code-empty.png` });
  await page.locator('.code-field__input').pressSequentially('48', { delay: 60 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${width}-4-code-typing.png` });
  await page.locator('.code-field__input').fill('');
  await page.locator('.code-field__input').pressSequentially('000000', { delay: 40 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${width}-5-code-error.png` });
  console.log('✓', width, errors.length ? `(${errors.length} page errors: ${errors[0]})` : '');
  await ctx.close();
}
await browser.close();

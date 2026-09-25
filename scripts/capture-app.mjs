// Walks the prototype's core flow at 390×844 and saves one PNG per screen.
// Usage: node scripts/capture-app.mjs [outDir]
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { phoneFrameCss, saveHtml } from './lib/html-snapshot.mjs';

const out = process.argv[2] ?? 'exports/app';
const base = process.env.BASE_URL ?? 'http://localhost:5173';
mkdirSync(out, { recursive: true });
const htmlOut = process.env.HTML_OUT; // e.g. exports/html
if (htmlOut) mkdirSync(htmlOut, { recursive: true });

// Prefer the lightweight headless shell; fall back to full Chromium, then Playwright's default.
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const full = `${homedir()}/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium`;
const cached = existsSync(shell) ? shell : full;
const browser = await chromium.launch(existsSync(cached) ? { executablePath: cached } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const shot = async (name, wait = 1400) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
  if (htmlOut) await saveHtml(page, `${htmlOut}/app-${name}.html`, { title: `PACT app · ${name.replace(/^\d+-/, '').replace(/-/g, ' ')}`, extraCss: phoneFrameCss });
  console.log('saved', name);
};
// Press-and-hold confirm: the app's contribute button is a hold gesture.
const hold = async () => {
  const box = await page.locator('.hold').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
};
const go = async (path, name, wait) => {
  await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 60000 });
  await shot(name, wait);
};

await go('/app', '01-welcome', 2600);
await go('/app/home', '02-home', 2000);

await page.goto(`${base}/app/create`, { waitUntil: 'load', timeout: 60000 });
await page.getByLabel('What’s the money for?').fill('Sarah’s Birthday');
await page.getByLabel('How much do you need?').fill('500000');
await page.getByLabel('When do you need it?').fill('2026-10-18');
await page.getByRole('button', { name: /Invite people/ }).click();
for (const n of ['Sarah Adeyemi', 'David Eze', 'Maya Bello']) await page.getByRole('button', { name: n }).click();
await page.getByRole('button', { name: /Add 3 people/ }).click();
await shot('03-create', 900);

await go('/app/pact/sarahs-birthday', '04-pact-detail', 2000);
await go('/app/pact/sarahs-birthday/invite', '05-invite', 1200);
await go('/app/pact/sarahs-birthday/contribute', '06-contribute', 1200);
await hold();
await shot('07-confirmation', 2600);
await go('/app/activity', '08-activity', 1200);

// Completed: cover what's left, then open the finished Pact.
await page.goto(`${base}/app/pact/sarahs-birthday/contribute`, { waitUntil: 'load', timeout: 60000 });
await page.getByRole('button', { name: /Cover the rest/ }).click();
await hold();
await page.waitForTimeout(1800);
await page.getByRole('button', { name: 'See it complete' }).click();
await shot('09-completed', 3200);

// New-Pact flow: invite screen with people arriving live.
await page.goto(`${base}/app/create`, { waitUntil: 'load', timeout: 60000 });
await page.getByLabel('What’s the money for?').fill('Weekend in Lagos');
await page.getByLabel('How much do you need?').fill('300000');
await page.getByLabel('When do you need it?').fill('2026-11-20');
await page.getByRole('button', { name: 'Create Pact' }).click();
await page.waitForTimeout(1500);
await page.getByRole('link', { name: 'Invite people' }).click();
await shot('10-invite-new-pact', 5500);

await browser.close();

// Checks skeleton loaders, saved drafts and autofill against the running dev stack (`npm run dev`).
// Usage: node scripts/qol-check.mjs [outDir]
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'exports/qol';
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const BASE = 'http://localhost:5173';
const phone = `80${String(Date.now()).slice(-8)}`;
let failed = 0;
const ok = (cond, msg) => {
  console.log(cond ? '✓' : '✗', msg);
  if (!cond) failed++;
};
const pinPad = async () => {
  for (const d of '2580') await page.getByRole('button', { name: d, exact: true }).last().click();
};
const btn = (name) => page.getByRole('button', { name }).first();
const store = (prefix) => page.evaluate((p) => Object.keys(localStorage).filter((k) => k.startsWith(p)), prefix);

try {
  // Sign up a fresh person.
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await page.getByLabel('Mobile number').fill(phone);
  await btn('Send code').click();
  await page.getByText('Your code is').waitFor();
  await btn('Fill it in').click();
  await page.getByLabel('First name').fill('Tobi');
  await page.getByLabel('Last name').fill('Quill');
  await btn('Continue').click();
  await page.getByText('Create a PIN').waitFor();
  await pinPad();
  await page.waitForTimeout(600);
  await pinPad();
  await page.waitForURL(/\/app\/home/, { timeout: 15000 });

  // Autofill: the number is remembered on this device.
  ok((await page.evaluate(() => localStorage.getItem('pact.device.lastPhone'))) === phone, 'sign-in number remembered on the device');

  // Skeleton loaders: hold the API back and look at the page while it waits.
  let slow = true;
  await page.route('**/api/pacts', async (route) => {
    if (slow) await new Promise((r) => setTimeout(r, 1800));
    await route.continue().catch(() => undefined);
  });
  await page.goto(`${BASE}/app/pacts`, { waitUntil: 'commit' });
  await page.locator('.sk[role="status"]').waitFor({ timeout: 4000 });
  ok(true, 'Pacts shows a skeleton while loading');
  await page.screenshot({ path: `${out}/skeleton-pacts.png` });
  slow = false;

  // Drafts: half-fill Create Pact, reload, and it should all be back.
  await page.goto(`${BASE}/app/create`, { waitUntil: 'load' });
  await page.getByLabel('Name', { exact: true }).fill('Lagos to Kribi');
  await page.getByRole('button', { name: 'In 2 weeks' }).click();
  await page.getByRole('textbox', { name: 'Target' }).fill('750000');
  await page.getByRole('button', { name: /Add your own/ }).count();
  await page.waitForTimeout(700);
  ok((await store('pact.draft.')).length === 1, 'create form saved a draft');
  await page.reload({ waitUntil: 'load' });
  ok((await page.getByLabel('Name', { exact: true }).inputValue()) === 'Lagos to Kribi', 'name restored after reload');
  ok((await page.getByRole('textbox', { name: 'Target' }).inputValue()).replace(/\D/g, '') === '750000', 'target restored after reload');
  ok(await page.getByText('We kept what you’d filled in.').isVisible(), 'restored notice shown');
  await page.screenshot({ path: `${out}/draft-restored.png` });
  await page.getByRole('button', { name: 'Start over' }).click();
  ok((await page.getByLabel('Name', { exact: true }).inputValue()) === '', 'start over clears the form');
  await page.waitForTimeout(600);
  ok((await store('pact.draft.')).length === 0, 'start over removes the draft');

  // Refill, submit, and the draft goes with it.
  await page.getByLabel('Name', { exact: true }).fill('Kribi Trip');
  await page.getByRole('button', { name: 'In a month' }).click();
  await page.getByRole('textbox', { name: 'Target' }).fill('300000');
  await btn(/Create Pact/).click();
  await page.waitForURL(/\/invite/, { timeout: 15000 });
  await page.waitForTimeout(800);
  ok((await store('pact.draft.')).length === 0, 'creating the Pact clears the draft');

  // Sign out on purpose: drafts and the remembered number are wiped.
  await page.goto(`${BASE}/app/create`, { waitUntil: 'load' });
  await page.getByLabel('Name', { exact: true }).fill('Unfinished');
  await page.waitForTimeout(700);
  await page.goto(`${BASE}/app/profile`, { waitUntil: 'load' });
  await btn('Sign out').click();
  await page.waitForTimeout(1200);
  ok((await store('pact.')).filter((k) => /draft|recent|device/.test(k)).length === 0, 'explicit sign-out wipes drafts and remembered values');
} catch (err) {
  await page.screenshot({ path: `${out}/FAILED.png` });
  console.error('FAILED:', err.message);
  failed++;
} finally {
  await browser.close();
  process.exitCode = failed ? 1 : 0;
}

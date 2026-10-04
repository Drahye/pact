// The beta front door with Google OFF (the default): email first, phone as the fallback, and no mention of Google in any auth screen.
// Usage: scripts/e2e-beta.sh
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = (process.env.E2E_BASE ?? 'http://localhost:5176').replace(/\/$/, '');
const out = process.argv[2] ?? 'exports/e2e-beta';
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const stamp = String(Date.now()).slice(-8);
const bad = [];
const ok = (name, pass, detail = '') => (console.log(pass ? '✓' : '✗', name, detail), pass || bad.push(name));
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
const noGoogle = async (label) => ok(`${label}: no mention of Google`, !/google/i.test(await page.locator('body').innerText()));

try {
  const cfg = await (await fetch(`${BASE}/api/config`)).json();
  ok('the server reports Google off and email on', cfg.auth?.google === false && cfg.auth?.email === true);

  await page.goto(`${BASE}/app/auth/welcome`, { waitUntil: 'load' });
  await page.getByText('Make things happen with your people.').waitFor();
  await page.screenshot({ path: `${out}/01-welcome.png` });
  ok('email is the primary action', (await page.getByRole('link', { name: 'Continue with email' }).count()) === 1);
  ok('no Google button', (await page.getByRole('button', { name: /google/i }).count()) === 0 && (await page.locator('svg path[fill="#4285F4"]').count()) === 0);
  ok('phone sign-in is offered as the fallback', (await page.getByText('Already use PACT with your phone?').count()) === 1 && (await page.getByRole('link', { name: 'Sign in with phone' }).count()) === 1);
  await noGoogle('front door');

  // a stale Google error in the URL does not surface a Google message
  await page.goto(`${BASE}/app/auth/welcome?error=google`, { waitUntil: 'load' });
  await page.getByText('Make things happen with your people.').waitFor();
  await noGoogle('front door with a stale ?error=google');

  // Email OTP: new person -> name -> in, no phone, no PIN
  await page.goto(`${BASE}/app/auth/welcome`);
  await page.getByRole('link', { name: 'Continue with email' }).click();
  await page.getByLabel('Email').fill(`beta.${stamp}@example.com`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Check your inbox').waitFor();
  await noGoogle('email code screen');
  await page.getByRole('button', { name: 'Fill it in' }).click();
  await page.getByLabel('First name').waitFor();
  await noGoogle('name screen');
  await page.getByLabel('First name').fill('Beta');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByRole('button', { name: 'Continue' }).click();
  // The intro (first time only), then Home: skip it as a person can.
  for (let i = 0; i < 20 && !(await page.locator('.home__header').count()); i++) {
    if (page.url().includes('/onboarding')) await page.getByRole('button', { name: 'Skip' }).click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  await page.locator('.home__header').waitFor({ timeout: 10000 });
  ok('a new email user lands in the app with no phone or PIN step', true);

  // Profile / Account: email and phone verification, nothing about Google
  await page.goto(`${BASE}/app/profile/account`);
  await page.getByText('Add email').or(page.getByText(/Verified/)).first().waitFor();
  await page.getByText('Verify phone').first().waitFor();
  await page.screenshot({ path: `${out}/02-account.png` });
  ok('Account shows Email and Phone', (await page.getByText('Email', { exact: true }).count()) > 0 && (await page.getByText('Phone', { exact: true }).count()) > 0);
  ok('Account has no Connect Google', (await page.getByRole('button', { name: /connect/i }).count()) === 0);
  await noGoogle('account screen');
  await page.goto(`${BASE}/app/home`);
  await page.waitForTimeout(800);
  await noGoogle('home (no sign-in upgrade prompt for an email user)');

  // Phone fallback still works: a fresh person signs up by phone
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/app/auth/welcome`);
  await p2.getByRole('link', { name: 'Sign in with phone' }).click();
  await p2.getByLabel('Mobile number').fill(`81${stamp}`.slice(0, 10));
  await p2.getByRole('button', { name: 'Send code' }).click();
  await p2.getByRole('button', { name: 'Fill it in' }).click();
  await p2.getByLabel('First name').fill('Phone');
  await p2.getByLabel('Last name').fill('Fallback');
  await p2.getByRole('button', { name: 'Continue' }).click();
  for (let i = 0; i < 20 && !(await p2.locator('.home__header').count()); i++) {
    if (p2.url().includes('/onboarding')) await p2.getByRole('button', { name: 'Skip' }).click().catch(() => undefined);
    await p2.waitForTimeout(400);
  }
  await p2.locator('.home__header').waitFor({ timeout: 10000 });
  await p2.getByText('Make signing in easier').waitFor({ timeout: 8000 });
  const prompt = await p2.locator('.upgrade').innerText();
  ok('phone user sees the upgrade nudge, with email only', /Add an email/.test(prompt) && !/google/i.test(prompt));
  await p2.screenshot({ path: `${out}/03-phone-user-home.png` });
  await ctx2.close();

  ok('no console errors', errors.length === 0, errors[0] ?? '');
} catch (e) {
  console.error('✗', e.message);
  bad.push(e.message);
}
await browser.close();
console.log(bad.length ? `FAILED: ${bad.join('; ')}` : 'beta auth UI checks passed');
process.exitCode = bad.length ? 1 : 0;

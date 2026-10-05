// Beta with SMS_PROVIDER=disabled: no screen offers phone sign-in or phone verification, the phone routes lead back to the front door,
// and email sign-in still works. Usage: scripts/e2e-phone-off.sh
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = (process.env.E2E_BASE ?? 'http://localhost:5178').replace(/\/$/, '');
const out = process.argv[2] ?? 'exports/e2e-phone-off';
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const stamp = String(Date.now()).slice(-8);
const bad = [];
const ok = (name, pass, detail = '') => (console.log(pass ? '✓' : '✗', name, detail), pass || bad.push(name));
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const noPhone = async (label) => {
  const t = await text();
  ok(`${label}: no phone sign-in`, !/sign in with phone|mobile number|(^|\\s)send code|verify (your )?phone|phone not verified/i.test(t) && (await page.locator('a[href*="auth/phone"]').count()) === 0, t.slice(0, 0));
};

try {
  const cfg = await (await fetch(`${BASE}/api/config`)).json();
  ok('the server reports phone off and email on', cfg.auth?.phone === false && cfg.auth?.email === true);
  const otp = await fetch(`${BASE}/api/auth/otp/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '08031112222' }) });
  ok('a phone code request is refused cleanly', otp.status === 503 && (await otp.json()).error.code === 'feature_unavailable');

  for (const [label, path] of [['front door (get started)', '/app/auth/start'], ['front door (sign in)', '/app/auth/signin'], ['welcome', '/app']]) {
    await page.goto(`${BASE}${path}`);
    await page.locator('h1').first().waitFor();
    await page.waitForTimeout(800);
    await noPhone(label);
  }
  await page.goto(`${BASE}/app/auth/start`);
  ok('email is still the way in', (await page.getByLabel('Email address').count()) === 1);
  await page.screenshot({ path: `${out}/01-front-door.png` });

  for (const path of ['/app/auth/phone', '/app/auth/code']) {
    await page.goto(`${BASE}${path}`);
    await page.getByLabel('Email address').waitFor();
    ok(`${path} leads back to the front door`, new URL(page.url()).pathname === '/app/auth/start', new URL(page.url()).pathname);
  }

  // Email OTP still signs a new person up.
  await page.getByLabel('Email address').fill(`nophone.${stamp}@example.com`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Check your email').waitFor();
  await noPhone('email code screen');
  // "Fill it in" belongs to the phone test codes, which are off: take the dev email code from the API and type it, as a person would.
  const again = await (await fetch(`${BASE}/api/auth/email/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `nophone.${stamp}@example.com` }) })).json();
  ok('the email code is still issued', /^\d{6}$/.test(again.devCode ?? ''));
  await page.locator('input').first().click();
  await page.keyboard.type(again.devCode);
  await page.getByLabel('First name').waitFor();
  await page.getByLabel('First name').fill('No');
  await page.getByLabel('Last name').fill('Phone');
  await page.getByRole('button', { name: 'Continue' }).click();
  for (let i = 0; i < 20 && !(await page.locator('.home__header').count()); i++) {
    if (page.url().includes('/onboarding')) await page.getByRole('button', { name: 'Skip' }).click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  await page.locator('.home__header').waitFor({ timeout: 10000 });
  ok('a new email user reaches Home', true);

  // Signed in: nowhere asks for a phone.
  for (const [label, path] of [['Me', '/app/profile'], ['Account', '/app/profile/account'], ['Account with ?verify=phone', '/app/profile/account?verify=phone'], ['Settings', '/app/profile/settings'], ['Wallet', '/app/wallet'], ['Withdraw', '/app/wallet/withdraw'], ['Bank accounts', '/app/profile/banks'], ['Security', '/app/profile/security'], ['Verify identity', '/app/profile/verify']]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(1500);
    await noPhone(label);
    ok(`${label}: no phone sheet open`, (await page.getByRole('dialog').count()) === 0);
  }
  await page.goto(`${BASE}/app/wallet/withdraw`);
  await page.waitForTimeout(1200);
  ok('Withdraw explains instead of sending to a dead end', /isn.t available in this beta/i.test(await text()));
  await page.screenshot({ path: `${out}/02-withdraw.png` });
  await page.goto(`${BASE}/app/profile/account`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/03-account.png` });
  ok('Account still shows the email', /Email/.test(await text()));
  ok('no console errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('journey completed', false, String(e.message).split('\n')[0]);
}
await browser.close();
console.log(bad.length ? `${bad.length} FAILED: ${bad.join('; ')}` : 'phone-off UI checks passed');
process.exit(bad.length ? 1 : 0);

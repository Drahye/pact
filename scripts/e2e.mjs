// End-to-end journey for a brand-new user, at phone width, against the running dev stack.
// Usage: node scripts/e2e.mjs [outDir]   (needs `npm run dev`)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'exports/e2e';
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));

const BASE = 'http://localhost:5173';
// REFRESH_LOG: record auth refresh outcomes to diagnose session loss.
const refreshLog = [];
page.on('response', async (r) => {
  if (r.url().includes('/api/auth/refresh')) refreshLog.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 90)}`);
});
page.on('requestfailed', (r) => { if (r.url().includes('/api/auth/refresh')) refreshLog.push(`ABORTED ${r.failure()?.errorText}`); });
const phone = `080${String(Date.now()).slice(-8)}`;
const PIN = '2580';
let n = 0;
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` });
  console.log('✓', name);
};
const pin = async () => {
  for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).last().click();
};
const tap = (name) => page.getByRole('button', { name, exact: false }).first().click();
const link = (name) => page.getByRole('link', { name, exact: false }).first().click();

try {
  await page.goto(`${BASE}/app`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await shot('welcome');

  // Sign up
  // Welcome renders a live WebGL scene; under headless software rendering Playwright's
  // stability check can time out, so this one click skips it.
  await page.getByRole('link', { name: 'Get started' }).click({ force: true });
  await page.getByText('What’s your number?').waitFor();
  await page.waitForTimeout(600); // let the push transition settle
  await page.getByLabel('Mobile number').fill(phone.slice(1));
  await shot('phone');
  await tap('Send code');
  await page.getByText('Your code is').waitFor();
  await shot('code');
  await tap('Fill it in');
  await page.getByLabel('First name').waitFor();
  await page.getByLabel('First name').fill('Ngozi');
  await page.getByLabel('Last name').fill('Adebayo');
  await shot('profile');
  await tap('Continue');
  await page.getByText('Create a PIN').waitFor();
  await pin();
  await page.getByText('Confirm your PIN').waitFor();
  await shot('pin-confirm');
  await pin();
  await page.getByText('Wallet balance').waitFor();
  await shot('home-new-user');

  // Top up by card through the sandbox checkout
  await link('Top up');
  await page.getByText('Add money').waitFor();
  await page.getByRole('radio', { name: /Debit card/ }).click();
  await page.getByRole('radio', { name: '₦20k' }).click();
  await shot('topup');
  await tap('Pay ₦20,300');
  await page.getByText('Sandbox checkout').waitFor();
  await shot('checkout');
  await tap('Pay ₦20,300');
  await page.getByText('Money added').waitFor();
  await shot('topup-success');
  await tap('Done');

  // Create a Pact
  await page.goto(`${BASE}/app/create`);
  await page.getByLabel('Name', { exact: true }).fill('Lagos Beach Weekend');
  await page.getByRole('radio', { name: 'Trip' }).click();
  await page.getByLabel('Target', { exact: true }).fill('60000');
  const d = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel('When is it happening?').fill(d);
  await tap('Invite people');
  await page.getByLabel('Add by phone number').fill('08031112222');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await shot('create-invite-sheet');
  await page.getByRole('button', { name: /Add 1 person/ }).click();
  await page.getByRole('radio', { name: /Equal shares/ }).click();
  await page.getByRole('button', { name: 'Book the flights' }).click();
  await shot('create');
  await tap('Create Pact');
  await page.getByText('Bring your people in.').waitFor();
  await shot('invite');

  // Contribute: hold (keyboard confirms), then PIN
  await link('Done');
  await page.getByText('If the goal isn’t reached').waitFor();
  await shot('pact-detail');
  await page.getByRole('link', { name: /Add to Pact|Add your share|Contribute/ }).first().click();
  await page.getByText('From your wallet').waitFor();
  await shot('contribute-short');
  await page.getByRole('radio', { name: '₦5k' }).click();
  await page.locator('.hold').waitFor();
  await shot('contribute');
  await page.locator('.hold').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  await shot('pin-sheet');
  await pin();
  await page.getByText('You’re in.').waitFor();
  await shot('contribute-done');

  // Wallet history
  await page.goto(`${BASE}/app/wallet`);
  await page.getByText('History').waitFor();
  await shot('wallet');

  // Verify BVN
  await page.goto(`${BASE}/app/profile/verify`);
  await page.getByLabel('BVN').fill(`222${String(Date.now()).slice(-8)}`);
  await page.getByLabel('Date of birth').fill('1994-05-17');
  await shot('verify');
  await page.locator('.screen__footer').getByRole('button', { name: 'Verify BVN' }).click();
  await page.waitForURL((u) => !u.pathname.includes('/profile/verify'));

  // Withdraw to a new bank account
  await page.goto(`${BASE}/app/wallet/withdraw`);
  await page.getByText('Withdraw to bank').waitFor();
  await page.waitForTimeout(600);
  await page.locator('.screen__footer').getByRole('button', { name: 'Add a bank account' }).click();
  await page.getByLabel('Bank', { exact: true }).selectOption('058');
  await page.getByLabel('Account number').fill('0123456789');
  await page.getByText('NGOZI ADEBAYO').waitFor();
  await shot('add-bank');
  await tap('Save account');
  await page.getByText('Confirm with your PIN').waitFor();
  await pin();
  await page.getByRole('radio', { name: /Guaranty Trust/ }).waitFor();
  await page.getByLabel('Amount', { exact: true }).fill('2000');
  await shot('withdraw');
  await tap('Withdraw ₦2,000');
  await pin();
  await page.getByText('On its way').waitFor({ timeout: 15000 });
  await shot('withdraw-done');

  // Profile and notifications
  await page.goto(`${BASE}/app/notifications`);
  await page.getByText('Wallet topped up').first().waitFor();
  await shot('notifications');
  await page.goto(`${BASE}/app/profile`);
  await page.getByText('PIN and devices').waitFor();
  await shot('profile');

  // A seeded Pact with real people in it
  await page.goto(`${BASE}/app/home`);
  await shot('home-after');
  console.log(errors.length ? `\nPage errors:\n${errors.join('\n')}` : '\nNo page errors.');
} catch (err) {
  await page.screenshot({ path: `${out}/FAILED.png` });
  console.error('FAILED at step', n + 1, err.message);
  console.error('refresh log:', refreshLog.join(' | '));
  console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}

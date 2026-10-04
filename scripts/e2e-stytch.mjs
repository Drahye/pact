// Email sign-in through Stytch (a local stand-in), end to end in a real browser, with the shared-link returns:
//   Ask   /a/:token    -> email code -> back -> answer saved
//   Plan  /p/:token    -> email code -> back -> RSVP saved
//   Split /s/:token    -> email code -> back on the same link
//   Circle /app/c/:token -> email code -> joined that Circle (not Home)
// Usage: scripts/e2e-stytch.sh   (starts the fake Stytch and a stack with EMAIL_AUTH_PROVIDER=stytch)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = (process.env.E2E_BASE ?? 'http://localhost:5179').replace(/\/$/, '');
const STYTCH = process.env.FAKE_STYTCH ?? 'http://127.0.0.1:8793';
const out = process.argv[2] ?? 'exports/e2e-stytch';
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const stamp = String(Date.now()).slice(-8);
const errors = [];
let shots = 0;
const call = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(method === 'POST' ? { 'idempotency-key': `e2e-${Math.random().toString(36).slice(2)}-${Date.now()}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(json)}`);
  return json;
};
const phoneUser = async (phone, first) => {
  const otp = await call('POST', '/auth/otp/request', null, { phone });
  const v = await call('POST', '/auth/otp/verify', null, { phone, code: otp.devCode });
  return call('POST', '/auth/signup', null, { signupToken: v.signupToken, firstName: first, lastName: 'Setup' });
};
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const owner = await phoneUser(`080${stamp}`, 'Owen');
const tok = owner.accessToken;
const circle = (await call('POST', '/circles', tok, { name: 'E2E Crew', emoji: '🎉' })).data;
const invite = (await call('POST', `/circles/${circle.id}/invites`, tok, {})).data.invite.token;
const ask = (await call('POST', `/circles/${circle.id}/asks`, tok, { type: 'attendance', title: 'Friday drinks?' })).data;
const plan = (await call('POST', `/circles/${circle.id}/plans`, tok, { title: 'Beach day', category: 'trip', date: day(20) })).data;
const friend = await phoneUser(`081${stamp}`, 'Fay');
await call('POST', `/circle-invites/${invite}/join`, friend.accessToken, {});
const split = (await call('POST', `/circles/${circle.id}/splits`, tok, { title: 'Taxi', total: 6_000_00, participants: [{ userId: friend.user.id }] })).data;

const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${String(++shots).padStart(2, '0')}-${name}.png` }); };
const waitFor = async (fn, what, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn().catch(() => null)) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 400));
  }
};
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 300)));
  return page;
};
/** The front door -> email -> the code Stytch "sent" (read from the stand-in, as an inbox would be) -> verify. */
const emailIn = async (page, email, first) => {
  await page.getByText('Make things happen with your people.').waitFor();
  const noGoogle = !/google/i.test(await page.locator('body').innerText());
  if (!noGoogle) throw new Error('Google appears on the front door');
  await shot(page, 'front-door');
  await page.getByLabel('Email address').fill(email);
  await page.locator('form').getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Check your email').waitFor();
  await page.getByText(email).first().waitFor();
  if (await page.getByText(/Fill it in|Sandbox/).count()) throw new Error('a code was offered on screen: Stytch emails it');
  let code;
  await waitFor(async () => (code = (await (await fetch(`${STYTCH}/__code?email=${encodeURIComponent(email)}`)).json()).code), 'the code');
  await shot(page, 'check-your-email');
  await page.getByLabel('6-digit code').fill(code);
  if (first) {
    await page.getByLabel('First name').waitFor({ timeout: 15000 });
    await page.getByLabel('First name').fill(first);
    await page.getByLabel('Last name').fill('Mail');
    await page.getByRole('button', { name: 'Continue' }).click();
  }
};
const noHome = (page, label) => {
  const seen = [];
  page.on('framenavigated', (f) => f === page.mainFrame() && seen.push(new URL(f.url()).pathname));
  return () => { if (seen.includes('/app/home')) throw new Error(`${label}: detoured through Home (${seen.join(' > ')})`); };
};

try {
  {
    const page = await newPage();
    const check = noHome(page, 'Ask');
    await page.goto(`${BASE}/a/${ask.shareToken}`, { waitUntil: 'load' });
    await page.getByRole('radio', { name: 'I’m in' }).click();
    await page.getByText('Save your vote').waitFor();
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await emailIn(page, `ask.${stamp}@example.com`, 'Ada');
    await page.waitForURL(new RegExp(`/a/${ask.shareToken}$`), { timeout: 15000 });
    await waitFor(async () => (await call('GET', `/asks/${ask.id}`, tok)).data.responseCount === 1, 'the answer to be saved');
    check();
    console.log('✓ Ask: email code -> back to the Ask -> answer saved');
    await page.context().close();
  }
  {
    const page = await newPage();
    const check = noHome(page, 'Plan');
    await page.goto(`${BASE}/p/${plan.shareToken}`, { waitUntil: 'load' });
    await page.getByRole('radio', { name: 'I’m in' }).first().click().catch(async () => page.getByRole('button', { name: 'I’m in' }).first().click());
    await page.getByText('Save your answer').waitFor();
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await emailIn(page, `plan.${stamp}@example.com`, 'Pia');
    await page.waitForURL(new RegExp(`/p/${plan.shareToken}$`), { timeout: 15000 });
    await waitFor(async () => (await call('GET', `/plans/${plan.id}`, tok)).data.counts.in === 1, 'the RSVP to be saved');
    check();
    console.log('✓ Plan: email code -> back to the Plan -> RSVP saved');
    await page.context().close();
  }
  {
    const page = await newPage();
    const check = noHome(page, 'Split');
    await page.goto(`${BASE}/s/${split.shareToken}`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'See my share' }).click();
    await emailIn(page, `split.${stamp}@example.com`, 'Spo');
    await page.waitForURL(new RegExp(`/s/${split.shareToken}$`), { timeout: 15000 });
    await page.getByText('Taxi').first().waitFor();
    check();
    console.log('✓ Split: email code -> back on the same Split link');
    await page.context().close();
  }
  {
    const page = await newPage();
    const check = noHome(page, 'Circle');
    await page.goto(`${BASE}/app/c/${invite}`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Join Circle' }).click();
    await emailIn(page, `circle.${stamp}@example.com`, 'Cia');
    await page.waitForURL(new RegExp(`/app/circles/${circle.id}$`), { timeout: 20000 });
    await waitFor(async () => (await call('GET', `/circles/${circle.id}`, tok)).data.memberCount >= 3, 'the new person to be in the Circle');
    check();
    console.log('✓ Circle invite: email code -> joined that Circle (no Home detour)');
    await page.context().close();
  }
  // Wrong code is a plain message, never Stytch's
  {
    const page = await newPage();
    await page.goto(`${BASE}/app/auth/welcome`, { waitUntil: 'load' });
    await page.getByLabel('Email address').fill(`bad.${stamp}@example.com`);
    await page.locator('form').getByRole('button', { name: 'Continue' }).click();
    await page.getByText('Check your email').waitFor();
    await page.getByLabel('6-digit code').fill('000000');
    await page.getByRole('alert').waitFor();
    const text = await page.getByRole('alert').innerText();
    if (/stytch|otp_|method/i.test(text)) throw new Error(`provider detail leaked: ${text}`);
    await shot(page, 'wrong-code');
    console.log('✓ wrong code: plain message —', JSON.stringify(text));
    await page.context().close();
  }
  if (errors.length) {
    console.log('console/page errors:\n', [...new Set(errors)].join('\n'));
    process.exitCode = 1;
  } else console.log('no console errors');
} catch (e) {
  console.error('✗', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

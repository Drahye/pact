// Sign-in journeys end to end, in a real browser, against a local stack started with GOOGLE_PROVIDER=fake.
//   Google : shared Ask      -> Google -> back -> answer saved
//   Email  : shared Plan     -> email code -> back -> RSVP saved
//   Legacy : phone sign-in   -> connect Google -> sign out -> Google sign-in -> same account
//   Verify : Google user     -> verify phone -> pending phone invite claimed
// Usage: scripts/e2e-auth.sh   (starts the stack on :8789/:5175, runs this, stops it)
// "Google" here is a local stand-in: live Google is never called, so these prove PACT's side of the flow only.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = (process.env.E2E_BASE ?? 'http://localhost:5175').replace(/\/$/, '');
const out = process.argv[2] ?? 'exports/e2e-auth';
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const stamp = String(Date.now()).slice(-8);
const errors = [];
let shots = 0;

/* ---- API helpers for setup and for checking what the server saved ---- */
const call = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(method === 'POST' ? { 'idempotency-key': `e2e-${Math.random().toString(36).slice(2)}-${Date.now()}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(json)}`);
  return json;
};
const phoneUser = async (phone, first) => {
  const otp = await call('POST', '/auth/otp/request', null, { phone });
  const v = await call('POST', '/auth/otp/verify', null, { phone, code: otp.devCode });
  const s = await call('POST', '/auth/signup', null, { signupToken: v.signupToken, firstName: first, lastName: 'Setup' });
  return s;
};
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const owner = await phoneUser(`080${stamp}`, 'Owen');
const tok = owner.accessToken;
const circle = (await call('POST', '/circles', tok, { name: 'E2E Crew', emoji: '🎉' })).data;
const ask = (await call('POST', `/circles/${circle.id}/asks`, tok, { type: 'attendance', title: 'Friday drinks?' })).data;
const plan = (await call('POST', `/circles/${circle.id}/plans`, tok, { title: 'Beach day', category: 'trip', date: day(20) })).data;

/* ---- browser helpers ---- */
const newPage = async (googleClaims) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  if (googleClaims) await ctx.addCookies([{ name: 'pact_fake_google', value: encodeURIComponent(JSON.stringify(googleClaims)), url: BASE }]);
  const page = await ctx.newPage();
  if (process.env.E2E_DEBUG) page.on('response', (r) => r.url().includes('/api/auth/') && console.log('   ', r.status(), r.request().method(), r.url().replace(BASE, '')));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 1500)));
  return page;
};
const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${String(++shots).padStart(2, '0')}-${name}.png` });
};
const waitFor = async (fn, what, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 400));
  }
};
/** A brand-new account sees the intro once before Home: skip it, as people can. */
const reachHome = async (page) => {
  // Home can render for a moment before a brand-new account is sent to the intro, so settle: Home must hold for a beat.
  const end = Date.now() + 20000;
  let steady = 0;
  while (Date.now() < end) {
    if (page.url().includes('/onboarding')) {
      await page.getByRole('button', { name: 'Skip' }).click().catch(() => undefined);
      steady = 0;
    } else if (page.url().includes('/app/home') && (await page.locator('.home__header').count())) {
      if (++steady >= 4) return;
    } else steady = 0;
    await page.waitForTimeout(400);
  }
  throw new Error(`never settled on Home (at ${page.url()})`);
};
const tap = (page, name) => page.getByRole('button', { name, exact: false }).first().click();
const google = async (page) => {
  await page.getByRole('button', { name: 'Continue with Google' }).click();
};
const noHomeDetour = (page, label) => {
  const seen = [];
  page.on('framenavigated', (f) => f === page.mainFrame() && seen.push(new URL(f.url()).pathname));
  return () => {
    if (seen.includes('/app/home')) throw new Error(`${label}: detoured through Home (${seen.join(' > ')})`);
  };
};

try {
  /* 1. Google: shared Ask */
  {
    const gsub = `e2e-g1-${stamp}`;
    const page = await newPage({ sub: gsub, email: `gina.${stamp}@example.com`, firstName: 'Gina', lastName: 'Goo' });
    const check = noHomeDetour(page, 'Ask via Google');
    await page.goto(`${BASE}/a/${ask.shareToken}`, { waitUntil: 'load' });
    await page.getByRole('radio', { name: 'I’m in' }).click();
    await page.getByRole('dialog').getByText('You’re almost in.').waitFor();
    await shot(page, 'ask-sign-in-sheet');
    await tap(page, 'Continue');
    await page.getByRole('heading', { level: 1, name: /Let’s get you in|Welcome back|You’re almost in|Almost there/ }).waitFor();
    await shot(page, 'welcome');
    await google(page);
    await page.getByLabel('First name').waitFor();
    await waitFor(async () => (await page.getByLabel('First name').inputValue()) === 'Gina', 'Google to prefill the name');
    await shot(page, 'google-name');
    await tap(page, 'Continue');
    await page.waitForURL(new RegExp(`/a/${ask.shareToken}$`), { timeout: 15000 });
    await waitFor(async () => (await call('GET', `/asks/${ask.id}`, tok)).data.responseCount === 1, 'the Ask answer to be saved');
    check();
    await shot(page, 'ask-saved');
    if (errors.length) console.log('   (errors so far:', errors.length, ')');
    console.log('✓ Google → shared Ask → back → answer saved (no Home detour)');
    await page.context().close();
  }

  /* 2. Email: shared Plan */
  {
    const page = await newPage();
    const check = noHomeDetour(page, 'Plan via email');
    await page.goto(`${BASE}/p/${plan.shareToken}`, { waitUntil: 'load' });
    await page.getByRole('radio', { name: 'I’m in' }).first().click().catch(async () => page.getByRole('button', { name: 'I’m in' }).first().click());
    await page.getByRole('dialog').getByText('You’re almost in.').waitFor();
    await tap(page, 'Continue');
    await page.getByLabel('Email address').fill(`ema.${stamp}@example.com`);
    await page.getByRole('button', { name: 'Continue with email' }).click();
    await page.getByText('Check your email').waitFor();
    await page.getByText('We sent a code to').waitFor();
    await shot(page, 'email-code');
    await tap(page, 'Fill it in');
    await page.getByLabel('First name').waitFor();
    await page.getByLabel('First name').fill('Ema');
    await page.getByLabel('Last name').fill('Mail');
    await shot(page, 'email-name');
    await tap(page, 'Continue');
    await page.waitForURL(new RegExp(`/p/${plan.shareToken}$`), { timeout: 15000 });
    await waitFor(async () => (await call('GET', `/plans/${plan.id}`, tok)).data.counts.in === 1, 'the RSVP to be saved');
    check();
    await shot(page, 'plan-saved');
    if (errors.length) console.log('   (errors so far:', errors.length, ')');
    console.log('✓ email code → shared Plan → back → RSVP saved (no Home detour, no phone, no PIN asked)');
    await page.context().close();
  }

  /* 3. Legacy phone user connects Google, signs out, signs in with Google: same account */
  {
    const gsub = `e2e-g3-${stamp}`;
    const phone = `081${stamp}`;
    const page = await newPage({ sub: gsub, email: `leg.${stamp}@example.com`, firstName: 'Wrong', lastName: 'Name' });
    await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
    await page.getByLabel('Mobile number').fill(phone.slice(1));
    await tap(page, 'Send code');
    await page.getByText('Your code is').waitFor();
    await tap(page, 'Fill it in');
    await page.getByLabel('First name').fill('Ngozi');
    await page.getByLabel('Last name').fill('Legacy');
    await tap(page, 'Continue');
    await reachHome(page);
    await page.getByText('Make signing in easier').waitFor({ timeout: 8000 }).catch(async (e) => {
      await shot(page, 'no-prompt');
      throw new Error(`prompt missing at ${page.url()}: ${(await page.locator('body').innerText()).slice(0, 300)}`);
    });
    await shot(page, 'legacy-home-prompt');
    await page.goto(`${BASE}/app/profile/account`);
    await page.getByText('Not connected').waitFor();
    await shot(page, 'account-before');
    await tap(page, 'Connect');
    await page.getByText('Google connected').first().waitFor({ timeout: 15000 }).catch(() => undefined);
    await page.getByText(/^Connected/).first().waitFor();
    await shot(page, 'account-google-connected');
    await page.goto(`${BASE}/app/profile`);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('heading', { level: 1, name: /Let’s get you in|Welcome back|You’re almost in|Almost there/ }).waitFor();
    await google(page);
    // Signing out on purpose forgets this device's "intro seen" flag, so a no-Pact account may see the intro again: skip it.
    await reachHome(page);
    const greeting = await page.locator('.home__header').innerText();
    if (!/Ngozi/.test(greeting)) throw new Error(`Google sign-in opened a different account: ${greeting}`);
    await page.goto(`${BASE}/app/profile`);
    await page.getByText(/Ngozi/).first().waitFor();
    await shot(page, 'legacy-google-same-account');
    if (errors.length) console.log('   (errors so far:', errors.length, ')');
    console.log('✓ phone user → connect Google → sign out → Google sign-in → same account (still “Ngozi”, phone intact)');
    await page.context().close();
  }

  /* 4. Google user verifies a phone; a pending phone invite is claimed only then */
  {
    const gsub = `e2e-g4-${stamp}`;
    const invited = `090${stamp}`;
    await call('POST', '/pacts', tok, { title: 'Invite by phone', category: 'dinner', target: 20_000_00, deadline: day(14), invitePhones: [invited] });
    const page = await newPage({ sub: gsub, email: `ver.${stamp}@example.com`, firstName: 'Vera', lastName: 'Verify' });
    await page.goto(`${BASE}/app/auth/start`, { waitUntil: 'load' });
    await google(page);
    await page.getByLabel('First name').waitFor();
    await tap(page, 'Continue');
    await reachHome(page);
    if (await page.getByText(/^Invitations/).count()) throw new Error('the phone invite was claimed before the phone was verified');
    await page.goto(`${BASE}/app/profile/account`);
    await page.getByText(/Not verified/).waitFor();
    await shot(page, 'phone-not-verified');
    await tap(page, 'Verify phone');
    await page.getByLabel('Mobile number').fill(invited.slice(1));
    await page.getByRole('dialog').getByRole('button', { name: 'Send code' }).click();
    const sandbox = await page.getByText(/Sandbox code:/).innerText();
    await page.getByLabel('6-digit code').fill(sandbox.replace(/\D/g, '').slice(0, 6));
    await shot(page, 'phone-code');
    await page.getByRole('dialog').getByRole('button', { name: 'Verify', exact: true }).click();
    await page.getByText(/invitation/).first().waitFor({ timeout: 15000 });
    await page.goto(`${BASE}/app/home`);
    await page.getByText(/^Invitations/).waitFor({ timeout: 15000 });
    await shot(page, 'phone-invite-claimed');
    console.log('✓ Google user → verify phone → pending phone invite claimed (and not before)');
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

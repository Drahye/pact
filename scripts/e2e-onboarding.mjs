// No Home flash after sign-in. A brand-new person goes from the code (or Google) straight to the intro; a returning person goes straight to
// Home; someone arriving from a shared link goes to that link and never sees Home or the intro on the way.
//   new email, new Google, returning email, returning Google, shared Ask, shared Plan, Circle invite (email and Google)
// "Saw Home" is any moment `.home` (Home's screen) or `.hsk` (its skeleton) was in the document, recorded by a MutationObserver from first paint.
// Usage: scripts/e2e-onboarding.sh   (a stack with the Stytch stand-in, including its Google start and token check)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = (process.env.E2E_BASE ?? 'http://localhost:5180').replace(/\/$/, '');
const STYTCH = process.env.FAKE_STYTCH ?? 'http://127.0.0.1:8795';
const out = process.argv[2] ?? 'exports/e2e-onboarding';
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
  await page.getByRole('heading', { level: 1, name: /Let’s get you in|Welcome back|You’re almost in|Almost there/ }).waitFor();
  await shot(page, 'front-door');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Continue with email' }).click();
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
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
};

const watch = async (page) => {
  await page.addInitScript(() => {
    const mark = () => { if (document.querySelector('.home, .hsk')) { try { sessionStorage.setItem('__sawHome', '1'); } catch {} } };
    new MutationObserver(mark).observe(document, { childList: true, subtree: true });
  });
  const paths = [];
  page.on('framenavigated', (f) => f === page.mainFrame() && paths.push(new URL(f.url()).pathname));
  return { paths, sawHome: () => page.evaluate(() => sessionStorage.getItem('__sawHome') === '1') };
};
const googleIn = async (page, email, first) => {
  await fetch(`${STYTCH}/__next_google?email=${encodeURIComponent(email)}`);
  await page.getByRole('button', { name: /Continue with Google/ }).click();
  if (first) {
    await page.getByLabel('First name').waitFor({ timeout: 20000 });
    await page.getByLabel('First name').fill(first);
    await page.getByLabel('Last name').fill('Goo');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
};
const expectPath = async (page, re, what) => { await page.waitForFunction(({ src }) => new RegExp(src).test(location.pathname), { src: re.source }, { timeout: 20000 }); await page.waitForTimeout(1500); if (!re.test(new URL(page.url()).pathname)) throw new Error(`${what}: moved on to ${page.url()}`); };
const verdict = async (w, label, { home, intro }) => {
  const saw = await w.sawHome();
  const wentIntro = w.paths.includes('/app/onboarding');
  if (!home && saw) throw new Error(`${label}: Home was on screen (${w.paths.join(' > ')})`);
  // A new person's URL does pass through /app/home (replaced straight away) while a plain loader shows; only a shared-link return must never touch it.
  if (!home && !intro && w.paths.includes('/app/home')) throw new Error(`${label}: detoured through /app/home (${w.paths.join(' > ')})`);
  if (intro && !wentIntro) throw new Error(`${label}: never reached the intro (${w.paths.join(' > ')})`);
  if (!intro && wentIntro) throw new Error(`${label}: sent to the intro (${w.paths.join(' > ')})`);
  console.log(`✓ ${label}  [${w.paths.join(' > ')}]`);
};
const startSignIn = (page) => page.goto(`${BASE}/app/auth/start`, { waitUntil: 'load' });
const openCircleInvite = async (page) => { await page.goto(`${BASE}/app/c/${invite}`, { waitUntil: 'load' }); await page.getByRole('button', { name: /^Join / }).click(); };

try {
  // 1. New email signup -> the intro, never Home
  { const page = await newPage(); const w = await watch(page);
    await startSignIn(page); await emailIn(page, `new.${stamp}@example.com`, 'Nia');
    await expectPath(page, /^\/app\/onboarding$/, 'new email'); await shot(page, 'new-email-intro');
    await verdict(w, 'new email signup: straight to the intro, no Home', { home: false, intro: true }); await page.context().close(); }
  // 2. New Google signup -> the intro, never Home
  { const page = await newPage(); const w = await watch(page);
    await startSignIn(page); await googleIn(page, `gnew.${stamp}@example.com`, 'Gia');
    await expectPath(page, /^\/app\/onboarding$/, 'new Google'); await shot(page, 'new-google-intro');
    await verdict(w, 'new Google signup: straight to the intro, no Home', { home: false, intro: true }); await page.context().close(); }
  // 3. Shared Ask (email) -> back on the Ask: no Home, no intro
  { const page = await newPage(); const w = await watch(page);
    await page.goto(`${BASE}/a/${ask.shareToken}`, { waitUntil: 'load' });
    await page.getByRole('radio', { name: 'I’m in' }).click();
    await page.getByRole('dialog').getByText('You’re almost in.').waitFor();
    await page.getByRole('button', { name: 'Continue', exact: true }).first().click();
    await emailIn(page, `ask.${stamp}@example.com`, 'Ada');
    await expectPath(page, new RegExp(`^/a/${ask.shareToken}$`), 'shared Ask');
    await verdict(w, 'shared Ask signup: back on the Ask, no Home, no intro', { home: false, intro: false }); await page.context().close(); }
  // 4. Shared Plan (email)
  { const page = await newPage(); const w = await watch(page);
    await page.goto(`${BASE}/p/${plan.shareToken}`, { waitUntil: 'load' });
    await page.getByRole('radio', { name: 'I’m in' }).first().click().catch(async () => page.getByRole('button', { name: 'I’m in' }).first().click());
    await page.getByRole('dialog').getByText('You’re almost in.').waitFor();
    await page.getByRole('button', { name: 'Continue', exact: true }).first().click();
    await emailIn(page, `plan.${stamp}@example.com`, 'Pia');
    await expectPath(page, new RegExp(`^/p/${plan.shareToken}$`), 'shared Plan');
    await verdict(w, 'shared Plan signup: back on the Plan, no Home, no intro', { home: false, intro: false }); await page.context().close(); }
  // 5. Circle invite (email): joins the Circle. This account is a returning person from here on.
  { const page = await newPage(); const w = await watch(page);
    await openCircleInvite(page); await emailIn(page, `circle.${stamp}@example.com`, 'Cia');
    await expectPath(page, new RegExp(`^/app/circles/${circle.id}$`), 'Circle invite (email)');
    await verdict(w, 'Circle invite signup (email): the Circle, no Home, no intro', { home: false, intro: false }); await page.context().close(); }
  // 6. Circle invite (Google): same, and this Google account is a returning person from here on.
  { const page = await newPage(); const w = await watch(page);
    await openCircleInvite(page); await googleIn(page, `gcircle.${stamp}@example.com`, 'Gus');
    await expectPath(page, new RegExp(`^/app/circles/${circle.id}$`), 'Circle invite (Google)');
    await verdict(w, 'Circle invite signup (Google): the Circle, no Home, no intro', { home: false, intro: false }); await page.context().close(); }
  // 7. Returning email user, on a fresh device (no local intro flag): straight to Home, no intro
  { const page = await newPage(); const w = await watch(page);
    await page.goto(`${BASE}/app/auth/signin`, { waitUntil: 'load' }); await emailIn(page, `circle.${stamp}@example.com`);
    await expectPath(page, /^\/app\/home$/, 'returning email'); await page.locator('.home').first().waitFor(); await shot(page, 'returning-email-home');
    await verdict(w, 'returning email user: Home, no intro', { home: true, intro: false }); await page.context().close(); }
  // 8. Returning Google user
  { const page = await newPage(); const w = await watch(page);
    await page.goto(`${BASE}/app/auth/signin`, { waitUntil: 'load' }); await googleIn(page, `gcircle.${stamp}@example.com`);
    await expectPath(page, /^\/app\/home$/, 'returning Google'); await page.locator('.home').first().waitFor(); await shot(page, 'returning-google-home');
    await verdict(w, 'returning Google user: Home, no intro', { home: true, intro: false }); await page.context().close(); }
  // 9. Someone who has seen the intro and reloads Home never waits on a loader: Home paints (skeleton or content) with no detour
  { const page = await newPage(); await watch(page);
    await startSignIn(page); await emailIn(page, `seen.${stamp}@example.com`, 'Sam');
    await expectPath(page, /^\/app\/onboarding$/, 'seen intro');
    await page.getByRole('button', { name: /Skip/i }).first().click();
    await expectPath(page, /^\/app\/home$/, 'after skipping the intro');
    await page.reload({ waitUntil: 'load' }); await expectPath(page, /^\/app\/home$/, 'reload after the intro was seen');
    console.log('✓ intro seen once: skip lands on Home, reload stays on Home (no loop)'); await page.context().close(); }
  if (errors.length) { console.log('console/page errors:\n', [...new Set(errors)].join('\n')); process.exitCode = 1; } else console.log('no console errors');
} catch (e) {
  console.error('✗', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

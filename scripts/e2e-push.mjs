// Notification prompt and state in a real browser, against a stack with Web Push configured. The browser's permission and PushManager are
// stubbed in the page (kept in localStorage, so they survive reloads like the real ones); the service worker, the app and the server are real.
//   first-time enable -> reload -> sign out and back in -> permission denied -> granted but subscription missing -> stale (server forgot it)
// Usage: scripts/e2e-push.sh
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = (process.env.E2E_BASE ?? 'http://localhost:5181').replace(/\/$/, '');
const out = process.argv[2] ?? 'exports/e2e-push';
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const stamp = String(Date.now()).slice(-6);
const errors = [];
const api = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'idempotency-key': `p-${Math.random().toString(36).slice(2)}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const account = async (phone, first) => {
  const o = await api('POST', '/auth/otp/request', null, { phone });
  const v = await api('POST', '/auth/otp/verify', null, { phone, code: o.devCode });
  return (await api('POST', '/auth/signup', null, { signupToken: v.signupToken, firstName: first, lastName: 'Push', pin: '2468' })).accessToken;
};
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const prompt = (page) => page.getByRole('button', { name: 'Turn on notifications' });
const stubBrowserPush = () => {
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  Object.defineProperty(Notification, 'permission', { configurable: true, get: () => get('__perm') || 'default' });
  Notification.requestPermission = async () => { localStorage.setItem('__perm', get('__answer') || 'granted'); return Notification.permission; };
  const make = (ep, key) => ({ endpoint: ep, options: { applicationServerKey: key }, toJSON: () => ({ endpoint: ep, keys: { p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) } }), unsubscribe: async () => { localStorage.removeItem('__sub'); return true; } });
  PushManager.prototype.getSubscription = async function () { const s = JSON.parse(get('__sub') || 'null'); return s ? make(s.ep, new Uint8Array(s.key).buffer) : null; };
  PushManager.prototype.subscribe = async function (o) {
    const ep = `https://fcm.googleapis.com/fcm/send/e2e-${Math.random().toString(36).slice(2)}-xxxxxxxxxxxx`;
    const key = Array.from(new Uint8Array(o.applicationServerKey));
    localStorage.setItem('__sub', JSON.stringify({ ep, key }));
    return make(ep, new Uint8Array(key).buffer);
  };
};
const newUser = async (first, n) => {
  const phone = `0803${stamp}${n}`.slice(0, 11);
  const token = await account(phone, first);
  await api('POST', '/pacts', token, { title: `Trip ${first}`, category: 'trip', target: 50_000_00, deadline: day(25) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(stubBrowserPush);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 300)));
  return { phone, token, ctx, page };
};
const signIn = async (page, phone) => {
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await page.getByLabel('Mobile number').fill(phone.replace(/^0/, ''));
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
  await page.waitForURL(/\/app\/home/, { timeout: 20000 });
  await settled(page);
};
/** Home has loaded and had time to show (or not show) the notification prompt. */
const settled = async (page) => { await page.locator('.home').first().waitFor({ timeout: 20000 }); await page.waitForTimeout(2200); };
const diag = async (page) => {
  await page.goto(`${BASE}/app/profile/settings`, { waitUntil: 'load' });
  await page.getByTestId('push-diagnostics').waitFor({ timeout: 15000 });
  await page.getByTestId('push-diagnostics').locator('summary').click();
  const text = await page.getByTestId('push-diagnostics').locator('pre').innerText();
  return Object.fromEntries(text.split('\n').map((l) => l.split(/:\s+/)));
};
const home = async (page) => { await page.goto(`${BASE}/app/home`, { waitUntil: 'load' }); await settled(page); };
const expect = (cond, what) => { if (!cond) throw new Error(what); console.log('  ok', what); };
let shots = 0;
const shot = (page, n) => page.screenshot({ path: `${out}/${String(++shots).padStart(2, '0')}-${n}.png` });

try {
  {
    console.log('first-time enable, reload, sign out and back in');
    const u = await newUser('Eno', 1);
    const { page } = u;
    await signIn(page, u.phone);
    expect(await prompt(page).count() === 1, 'permission not asked yet: the prompt is offered');
    await shot(page, 'prompt');
    await prompt(page).click();
    await page.getByText('Notifications are on').waitFor({ timeout: 15000 });
    expect(await prompt(page).count() === 0, 'enabled: the prompt goes away at once');
    expect(await page.evaluate(() => localStorage.getItem('__perm')) === 'granted', 'the browser was asked once and said yes');
    let d = await diag(page);
    expect(d['Notification.permission'] === 'granted' && d['service worker registered'] === 'yes' && d['service worker active'] === 'yes' && d['push subscription present'] === 'yes' && d['server subscription present'] === 'yes' && d['VAPID public key available'] === 'yes', `diagnostics all yes: ${JSON.stringify(d)}`);
    await shot(page, 'diagnostics');
    await home(page);
    expect(await prompt(page).count() === 0, 'reload after enable: no prompt');
    await page.reload({ waitUntil: 'load' });
    await settled(page);
    expect(await prompt(page).count() === 0, 'second reload: still no prompt');
    // Sign out (this removes the browser's subscription and the server's), then sign in as the same person.
    await page.goto(`${BASE}/app/profile/settings`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/app\/?$/, { timeout: 15000 });
    expect(await page.evaluate(() => localStorage.getItem('__sub')) === null, 'sign-out removed this browser’s subscription');
    await signIn(page, u.phone);
    expect(await prompt(page).count() === 0, 'signed back in as the same person: no prompt');
    d = await diag(page);
    expect(d['push subscription present'] === 'yes' && d['server subscription present'] === 'yes', 'and the subscription was quietly restored in the browser and on the server');
    // Stale: the server forgot this browser (removed, expired and swept). Repaired by saving it again, no prompt.
    const sub = await page.evaluate(() => JSON.parse(localStorage.getItem('__sub')).ep);
    await api('POST', '/push/unsubscribe', u.token, { endpoint: sub });
    await home(page);
    expect(await prompt(page).count() === 0, 'stale (server forgot it): no prompt');
    d = await diag(page);
    expect(d['server subscription present'] === 'yes', 'the server has it again after the repair');
    // Granted but the browser lost its subscription (cleared site data for push, browser update): quietly re-subscribed.
    await page.evaluate(() => localStorage.removeItem('__sub'));
    await home(page);
    expect(await prompt(page).count() === 0, 'permission granted but subscription missing: no prompt');
    d = await diag(page);
    expect(d['push subscription present'] === 'yes' && d['server subscription present'] === 'yes', 'a new subscription was made and saved');
    await u.ctx.close();
  }
  {
    console.log('a different person on a browser that already allows notifications');
    const u = await newUser('Ife', 2);
    await u.ctx.addInitScript(() => { try { if (!localStorage.getItem('__perm')) localStorage.setItem('__perm', 'granted'); } catch {} });
    await signIn(u.page, u.phone);
    expect(await prompt(u.page).count() === 1, 'granted for the browser but never turned on by this person: one tap (no subscription made behind their back)');
    expect(await u.page.evaluate(() => localStorage.getItem('__sub')) === null, 'nothing subscribed yet');
    await prompt(u.page).click();
    await u.page.getByText('Notifications are on').waitFor({ timeout: 15000 });
    expect(await u.page.evaluate(() => localStorage.getItem('__answer')) === null, 'no browser question was needed');
    await u.ctx.close();
  }
  {
    console.log('permission denied');
    const u = await newUser('Dee', 3);
    await u.ctx.addInitScript(() => { try { localStorage.setItem('__perm', 'denied'); } catch {} });
    await signIn(u.page, u.phone);
    expect(await prompt(u.page).count() === 0, 'blocked: the enable prompt is not shown');
    await u.page.goto(`${BASE}/app/profile/settings`, { waitUntil: 'load' });
    await u.page.getByText(/set to block notifications/).waitFor({ timeout: 15000 });
    expect(await u.page.getByRole('switch').isDisabled(), 'Settings shows a quiet, explained, disabled state');
    await shot(u.page, 'blocked-settings');
    await u.ctx.close();
  }
  {
    console.log('person says no in the browser question');
    const u = await newUser('Nko', 4);
    await u.ctx.addInitScript(() => { try { localStorage.setItem('__answer', 'denied'); } catch {} });
    await signIn(u.page, u.phone);
    await prompt(u.page).click();
    await u.page.waitForTimeout(1500);
    expect(await prompt(u.page).count() === 0, 'blocked right after: the prompt goes and does not come back');
    await home(u.page);
    expect(await prompt(u.page).count() === 0, 'and not after a reload');
    await u.ctx.close();
  }
  if (errors.length) { console.log('console/page errors:\n', [...new Set(errors)].join('\n')); process.exitCode = 1; } else console.log('no console errors');
} catch (e) {
  console.error('✗', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

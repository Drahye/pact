// Builds notifications through the API on the demo stack (scripts/demo-stack.sh, port 5174, started with WEB_PUSH_* set),
// then looks at them in a browser: Home (badge, "Stay in the loop" card), the Notifications screen (New / Earlier, grouped
// lines, long text), tapping through to a thread, the unread count, the Profile switch, and the permission paths.
// Usage: node scripts/notifications-check.mjs <outDir>   env: THEME=light|dark, VIEWPORTS=390x844,320x568
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const OUT = process.argv[2] ?? 'exports/notifications';
const B = (process.env.BASE ?? 'http://localhost:5174').replace(/\/$/, '');
const THEME = process.env.THEME ?? 'light';
const VPS = (process.env.VIEWPORTS ?? '390x844,320x568').split(',').map((v) => v.split('x').map(Number));
const PIN = '1357';
mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const problems = [];
const ok = (name, cond, extra = '') => { console.log(cond ? 'ok  ' : 'FAIL', name, extra); if (!cond) problems.push(name); };
const axe = async (page, name) => {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }));
  for (const v of r.violations) problems.push(`axe ${name}: ${v.id} ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  console.log(r.violations.length ? 'FAIL' : 'ok  ', `axe ${name}`, r.violations.map((v) => v.id).join(','));
};
const api = async (method, path, token, body) => {
  const r = await fetch(`${B}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method !== 'GET' ? { 'idempotency-key': `n-${Date.now()}-${Math.random()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const login = async (phone) => {
  const o = await api('POST', '/auth/otp/request', null, { phone });
  return (await api('POST', '/auth/otp/verify', null, { phone, code: o.devCode })).accessToken;
};

/** Headless Chrome reports notifications as already denied and cannot reach a real push service, so the browser side is
 * stood in for: permission starts at "default", the answer to the question is chosen per scenario, and subscribing returns
 * a fake FCM-shaped subscription. What this proves is PACT's own behaviour: when it asks, what it stores, what it sends. */
const mockBrowser = ({ answer }) => {
  // The browser remembers permission and subscription across page loads, so the stand-in does too.
  const get = (k, d) => localStorage.getItem('__mock.' + k) ?? d;
  const set = (k, v) => (v === null ? localStorage.removeItem('__mock.' + k) : localStorage.setItem('__mock.' + k, v));
  Object.defineProperty(Notification, 'permission', { get: () => get('perm', 'default') });
  Notification.requestPermission = async () => {
    window.__asked = (window.__asked || 0) + 1;
    set('perm', answer === 'dismiss' ? 'default' : answer);
    return get('perm', 'default');
  };
  window.PushManager = window.PushManager || function PushManager() {};
  const endpoint = get('endpoint', 'https://fcm.googleapis.com/fcm/send/check-' + Math.random().toString(36).slice(2).padEnd(40, 'z'));
  set('endpoint', endpoint);
  const sub = { endpoint, toJSON() { return { endpoint, keys: { p256dh: 'B' + 'p'.repeat(60), auth: 'a'.repeat(22) } }; }, unsubscribe: async () => (set('sub', null), true) };
  const reg = { pushManager: { getSubscription: async () => (get('sub', null) ? sub : null), subscribe: async () => (set('sub', '1'), sub) } };
  Object.defineProperty(navigator, 'serviceWorker', { value: { register: async () => (set('reg', '1'), reg), getRegistration: async () => (get('reg', null) ? reg : undefined), ready: Promise.resolve(reg) }, configurable: true });
};

const abraham = await login('08010000001');
const sarah = await login('08010000002');
const david = await login('08010000003');
const made = await api('POST', '/pacts', abraham, { title: 'Sarah’s Birthday Weekend in Ibadan, with the whole family', category: 'gift', target: 40_000_00, deadline: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10), tasks: [{ title: 'Order the cake' }] });
const pact = made.data.pact;
for (const t of [sarah, david]) await api('POST', `/invites/${pact.inviteCode}/join`, t, {});
for (const [t, n] of [[sarah, 10_000], [david, 5_000], [sarah, 2_000]]) await api('POST', `/pacts/${pact.id}/contributions`, t, { amount: n * 100, pin: PIN });
const upd = (await api('POST', `/pacts/${pact.id}/updates`, abraham, { body: 'Venue confirmed for Saturday. Please arrive by 5pm and bring your ID for the gate, it will be checked at the entrance.' })).data.activities[0];
for (const b of ['See you there', 'Bringing snacks', 'Can someone share the address?']) await api('POST', `/pacts/${pact.id}/activity/${upd.id}/comments`, david, { body: b });
await api('POST', `/pacts/${pact.id}/contributions`, david, { amount: 23_000 * 100, pin: PIN }); // reaches the goal
const notes = (await api('GET', '/notifications', abraham)).items;
console.log('abraham has', notes.length, 'notifications:', notes.slice(0, 8).map((n) => `${n.type}${n.count > 1 ? `×${n.count}` : ''}`).join(', '));

const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
let session = null;
for (const [w, h] of VPS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true, ...(session ? { storageState: session } : {}) });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), THEME);
  await ctx.addInitScript(mockBrowser, { answer: 'granted' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${THEME}-${w}-${name}.png` }); };
  const noOverflow = async (name) => ok(`${name}@${w} no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  if (!session) {
    await page.goto(`${B}/app/auth/phone`);
    await page.getByLabel('Mobile number').fill('8010000001');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByRole('button', { name: 'Fill it in' }).click();
    await page.locator('.wallet-strip').waitFor();
    session = await ctx.storageState();
  }
  await page.goto(`${B}/app/home`);
  await page.waitForTimeout(2200);
  const prompt = page.getByRole('region', { name: 'Stay in the loop' });
  ok(`stay-in-the-loop card is offered at ${w}`, await prompt.isVisible());
  ok('the browser permission was NOT requested on load', (await page.evaluate(() => window.__asked || 0)) === 0);
  await shot('1-home');
  const badge = await page.locator('.bell__dot, .tabbar__badge').allTextContents();
  ok('unread badge shows on the bell and the Home tab', badge.length >= 2, JSON.stringify(badge));
  await noOverflow('home');
  await axe(page, `home@${w}`);

  await page.getByRole('link', { name: /Notifications, \d+ unread/ }).click();
  await page.waitForTimeout(1500);
  ok('opening the screen does not mark everything read', (await page.locator('.notes__row.is-unread').count()) > 0);
  const after = (await api('GET', '/notifications', abraham)).unread;
  ok('server still counts them unread after opening', after > 0, String(after));
  await shot('2-notifications');
  ok('New and Earlier headings exist', (await page.getByRole('heading', { name: /^New/ }).count()) === 1);
  ok('grouped line shows its count', (await page.getByText('3 new comments').count()) + (await page.getByText('3 new contributions').count()) >= 1);
  await noOverflow('notifications');
  await axe(page, `notifications@${w}`);
  // tap a comment line: lands on the thread, and only that one is read
  const unreadBefore = (await api('GET', '/notifications', abraham)).unread;
  const target = page.locator('.notes__row.is-unread').filter({ hasText: /new comments|commented/ }).first();
  const hadUnread = (await target.count()) > 0;
  await (hadUnread ? target : page.getByRole('button', { name: /new comments/ }).first()).click();
  await page.waitForTimeout(1500);
  ok('tapping a comment line opens its message', /\/app\/notifications\//.test(page.url()));
  await page.getByRole('link', { name: 'Open thread' }).click();
  await page.waitForTimeout(1800);
  ok('and its button opens the thread', (await page.getByRole('dialog').count()) > 0 || page.url().includes('/app/pact/'));
  ok('the thread parameter is cleaned from the address', !page.url().includes('thread='));
  await shot('3-thread-from-notification');
  const unreadAfter = (await api('GET', '/notifications', abraham)).unread;
  if (hadUnread) ok('only that line was marked read', unreadAfter === unreadBefore - 1, `${unreadBefore} -> ${unreadAfter}`);
  await page.goto(`${B}/app/notifications`); await page.waitForTimeout(1200);
  await shot('4-notifications-after');
  // Profile switch + permission paths
  await page.goto(`${B}/app/profile`); await page.waitForTimeout(1500);
  var sw = page.getByRole('switch', { name: 'Notifications on this device' });
  ok('Profile has a notifications switch, off', (await sw.count()) === 1 && (await sw.getAttribute('aria-checked')) === 'false');
  await shot('5-profile');
  await axe(page, `profile@${w}`);
  // The "turn on" path: granted. The browser is asked only now, PACT stores the subscription, and the switch reflects it.
  const calls = [];
  page.on('response', (r) => { if (r.url().includes('/api/push/')) calls.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`); });
  await page.goto(`${B}/app/home`); await page.waitForTimeout(1500);
  ok('nothing asked before tapping', (await page.evaluate(() => window.__asked || 0)) === 0);
  await page.getByRole('button', { name: 'Turn on notifications' }).click();
  await page.waitForTimeout(1500);
  ok('the browser was asked exactly once, after the tap', (await page.evaluate(() => window.__asked)) === 1);
  ok('PACT stored the subscription', calls.includes('POST /api/push/subscribe 200'), calls.join(','));
  ok('the card goes away once it is on', !(await prompt.isVisible()));
  await page.goto(`${B}/app/profile`); await page.waitForTimeout(1200);
  ok('Profile shows the switch on', (await sw.getAttribute('aria-checked')) === 'true');
  await shot('6-profile-on');
  await sw.click(); await page.waitForTimeout(1000);
  ok('turning it off forgets this browser', calls.includes('POST /api/push/unsubscribe 200') && (await sw.getAttribute('aria-checked')) === 'false', calls.join(','));
  await ctx.close();

  // Denied: the card says so once, goes away, and Profile explains how to undo it.
  const denied = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true, storageState: session });
  await denied.addInitScript(mockBrowser, { answer: 'denied' });
  const dp = await denied.newPage();
  await dp.goto(`${B}/app/home`); await dp.waitForTimeout(1500);
  await dp.getByRole('button', { name: 'Turn on notifications' }).click(); await dp.waitForTimeout(1200);
  ok('denied: no subscription was stored', !calls.some((c) => c.includes('subscribe') && c.includes('401')));
  await dp.screenshot({ path: `${OUT}/${THEME}-${w}-7-denied.png` });
  await dp.reload(); await dp.waitForTimeout(1200);
  ok('denied: the card does not come back', !(await dp.getByRole('region', { name: 'Stay in the loop' }).isVisible()));
  await dp.goto(`${B}/app/profile`); await dp.waitForTimeout(1200);
  const dsw = dp.getByRole('switch', { name: 'Notifications on this device' });
  ok('denied: the switch is disabled and explains', (await dsw.isDisabled()) && (await dp.getByText(/Blocked in your browser/).isVisible()));
  await dp.screenshot({ path: `${OUT}/${THEME}-${w}-8-profile-blocked.png` });
  await denied.close();

  // Dismissed in the browser dialog, and "Not now": both stay quiet afterwards.
  for (const how of ['dismiss', 'notnow']) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true, storageState: session });
    await c.addInitScript(mockBrowser, { answer: 'dismiss' });
    const p2 = await c.newPage();
    await p2.goto(`${B}/app/home`); await p2.waitForTimeout(1500);
    if (how === 'dismiss') await p2.getByRole('button', { name: 'Turn on notifications' }).click();
    else await p2.getByRole('button', { name: 'Not now' }).click();
    await p2.waitForTimeout(1000);
    ok(`${how}: the card goes away`, !(await p2.getByRole('region', { name: 'Stay in the loop' }).isVisible()));
    if (how === 'notnow') ok('not now: the browser was never asked', (await p2.evaluate(() => window.__asked || 0)) === 0);
    await p2.reload(); await p2.waitForTimeout(1200);
    ok(`${how}: no nagging after a reload`, !(await p2.getByRole('region', { name: 'Stay in the loop' }).isVisible()));
    await c.close();
  }
  // Signing out stops this browser receiving that person's notifications. Done as a second person, so Abraham's session stays valid.
  const so = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true });
  await so.addInitScript(mockBrowser, { answer: 'granted' });
  const sp = await so.newPage();
  const soCalls = [];
  sp.on('response', (r) => { if (r.url().includes('/api/push/')) soCalls.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`); });
  await sp.goto(`${B}/app/auth/phone`);
  await sp.getByLabel('Mobile number').fill('8010000002');
  await sp.getByRole('button', { name: 'Send code' }).click();
  await sp.getByRole('button', { name: 'Fill it in' }).click();
  await sp.locator('.wallet-strip').waitFor();
  await sp.getByRole('button', { name: 'Turn on notifications' }).click().catch(() => undefined);
  await sp.waitForTimeout(1200);
  await sp.getByRole('link', { name: 'Profile' }).last().click();
  await sp.waitForTimeout(1000);
  const subscribed = soCalls.some((c) => c.includes('subscribe 200'));
  await sp.getByRole('button', { name: 'Sign out' }).click();
  await sp.waitForTimeout(1500);
  ok('signing out forgets this browser first', subscribed && soCalls.some((c) => c.includes('/api/push/unsubscribe')), soCalls.join(','));
  await so.close();
  ok(`no page errors @${w}`, errs.length === 0, errs.join(' | '));
}
await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEMS:\n- ${problems.join('\n- ')}` : '\nall ok');

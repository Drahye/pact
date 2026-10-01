// Builds a Pact with real conversation through the API on the demo stack (scripts/demo-stack.sh, port 5174),
// then looks at it in a browser: pinned card, activity with counts, a thread, posting an update, the composer
// with a keyboard open, a long comment, a closed Pact, light and dark, axe on each.
// Usage: node scripts/conversation-check.mjs <outDir>   env: THEME=light|dark, VIEWPORTS=390x844,320x568
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const OUT = process.argv[2] ?? 'exports/conversation';
const B = (process.env.BASE ?? 'http://localhost:5174').replace(/\/$/, '');
const THEME = process.env.THEME ?? 'light';
const VPS = (process.env.VIEWPORTS ?? '390x844,320x568').split(',').map((v) => v.split('x').map(Number));
const PIN = '1357';
mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const violations = [];
const layout = [];
/** No sideways scroll, and a sheet never taller or wider than the screen. */
const fits = async (page, name) => {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const out = [];
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
    const sc = document.querySelector('.screen');
    if (sc && sc.scrollWidth > sc.clientWidth + 1) out.push(`.screen scrollWidth ${sc.scrollWidth} > ${sc.clientWidth}`);
    const m = document.querySelector('.modal__panel');
    if (m) {
      const b = m.getBoundingClientRect();
      if (b.top < 0 || b.bottom > vh + 1 || b.right > vw + 1) out.push(`sheet ${Math.round(b.top)}..${Math.round(b.bottom)} x..${Math.round(b.right)} outside ${vw}x${vh}`);
      const c = document.querySelector('.composer__input');
      if (c) { const cb = c.getBoundingClientRect(); if (cb.bottom > vh + 1 || cb.top < 0) out.push('composer outside the visible area'); }
    }
    return out;
  });
  for (const x of r) layout.push(`${name}: ${x}`);
};
const axe = async (page, name) => {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }));
  for (const v of r.violations) violations.push(`${name}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
};
const api = async (method, path, token, body) => {
  const r = await fetch(`${B}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method !== 'GET' ? { 'idempotency-key': `c-${Date.now()}-${Math.random()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const login = async (phone) => {
  const o = await api('POST', '/auth/otp/request', null, { phone });
  return (await api('POST', '/auth/otp/verify', null, { phone, code: o.devCode })).accessToken;
};

const abraham = await login('08010000001');
const sarah = await login('08010000002');
const david = await login('08010000003');
const made = await api('POST', '/pacts', abraham, {
  title: 'Ibadan Weekend Trip', category: 'trip', target: 100_000_00, deadline: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
  tasks: [{ title: 'Book transport' }, { title: 'Pick up decorations' }],
});
const pact = made.data.pact;
for (const t of [sarah, david]) await api('POST', `/invites/${pact.inviteCode}/join`, t, {});
await api('POST', `/pacts/${pact.id}/contributions`, sarah, { amount: 25_000_00, pin: PIN });
const tasks = (await api('GET', `/pacts/${pact.id}`, abraham)).data.pact.tasks;
await api('PATCH', `/pacts/${pact.id}/tasks/${tasks[0].id}`, david, { assigneeId: 'me' });
await api('PATCH', `/pacts/${pact.id}/tasks/${tasks[0].id}`, david, { status: 'done' });
const upd = (await api('POST', `/pacts/${pact.id}/updates`, abraham, { body: 'Venue moved to the Civic Centre. Please arrive by 5pm, and bring your ID for the gate.' })).data.activities[0];
const feed = (await api('GET', `/pacts/${pact.id}`, abraham)).data.activities;
const contribution = feed.find((a) => a.type === 'contribution');
const taskDone = feed.find((a) => a.type === 'task_done');
const talk = async (aid, who, body) => api('POST', `/pacts/${pact.id}/activity/${aid}/comments`, who, { body });
await talk(contribution.id, david, 'Nice, almost there.');
await talk(contribution.id, sarah, 'I can add the rest on Friday.');
await talk(upd.id, david, 'On my way. ' + 'Will the gate need a printed ticket as well? '.repeat(6));
await talk(upd.id, sarah, 'Got it, thanks!');
for (const [aid, who, r] of [[taskDone.id, abraham, 'celebrate'], [taskDone.id, sarah, 'celebrate'], [taskDone.id, david, 'raised_hands'], [contribution.id, abraham, 'heart'], [contribution.id, david, 'thumbs_up'], [upd.id, sarah, 'thumbs_up']]) {
  await api('PUT', `/pacts/${pact.id}/activity/${aid}/reactions`, who, { reaction: r, on: true });
}
await api('PUT', `/pacts/${pact.id}/pin`, abraham, { activityId: upd.id });
const URL = `/app/pact/${pact.id}`;
console.log('pact', pact.id);

const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
let session = null;
for (const [w, h] of VPS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true, ...(session ? { storageState: session } : {}) });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), THEME);
  const page = await ctx.newPage();
  const shot = async (name) => { await page.waitForTimeout(800); await fits(page, `${name}@${w}`); await page.screenshot({ path: `${OUT}/${THEME}-${w}-${name}.png` }); };
  if (!session) {
    await page.goto(`${B}/app/auth/phone`);
    await page.getByLabel('Mobile number').fill('8010000001');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByRole('button', { name: 'Fill it in' }).click();
    await page.locator('.wallet-strip').waitFor();
  }
  await page.goto(`${B}${URL}`);
  await page.waitForTimeout(2200);
  await shot('1-top-pinned');
  await axe(page, `detail@${w}`);
  await page.locator('.activity-head').scrollIntoViewIfNeeded();
  await page.locator('.screen').first().evaluate((el) => el.scrollBy(0, -120)); await shot('2-activity');
  // open the thread on the update
  await page.getByRole('button', { name: /posted an update/ }).first().click();
  await page.waitForTimeout(1200); await shot('3-thread-update');
  await axe(page, `thread@${w}`);
  // type a comment with the keyboard open (viewport shrunk to model the keyboard)
  await page.getByLabel('Add a comment').fill('Thanks Abraham, noted.');
  await page.setViewportSize({ width: w, height: Math.round(h * 0.58) }); await shot('4-thread-keyboard');
  await page.setViewportSize({ width: w, height: h });
  await page.locator('.composer button[type=submit]').click();
  await page.waitForTimeout(1200); await shot('5-thread-after-send');
  await page.getByRole('button', { name: 'Close' }).first().click().catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(500);
  // reactions + counts on a system item
  await page.getByRole('button', { name: /contributed/ }).first().click();
  await page.waitForTimeout(1000); await shot('6-thread-contribution');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  // post an update
  await page.getByRole('button', { name: 'Post update' }).click();
  await page.waitForTimeout(600);
  await page.locator('.update-form .composer__input').fill('Bus leaves at 7am sharp from the main gate.');
  await shot('7-post-update');
  session = await ctx.storageState();
  await ctx.close();
}

// A closed Pact is read-only.
await api('POST', `/pacts/${pact.id}/cancel`, abraham, { pin: PIN });
for (const [w, h] of VPS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true, storageState: session });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), THEME);
  const page = await ctx.newPage();
  await page.goto(`${B}${URL}`); await page.waitForTimeout(2200);
  await page.getByRole('button', { name: /contributed/ }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/${THEME}-${w}-8-closed-readonly.png` });
  await ctx.close();
}
await browser.close();
console.log(layout.length ? `layout problems:\n${layout.join('\n')}` : 'layout: no overflow, sheets and composer inside the screen');
console.log(violations.length ? `axe violations:\n${violations.join('\n')}` : 'axe: no violations (detail, thread)');

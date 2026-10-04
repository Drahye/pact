// Browser audit of the social V2 surface: Circles, Asks, Plans, Splits, Recaps, Home, shared links, auth return.
// Usage: AUDIT_BASE=http://localhost:5174 node scripts/audit-v2.mjs [outFile]
// Needs a running dev stack that exposes SMS codes (scripts/demo-stack.sh). It signs up its own people through the API,
// builds the fixtures, then drives the real UI. Nothing here is mocked in the app; the fixtures are real rows.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'audit-v2-results.json';
const BASE = (process.env.AUDIT_BASE ?? 'http://localhost:5174').replace(/\/$/, '');
const WIDTHS = [320, 360, 375, 390, 393, 412, 430, 768];
const SHOTS = 'exports/audit-v2';
mkdirSync(SHOTS, { recursive: true });
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});

const R = { base: BASE, widths: WIDTHS, routes: [], axe: [], overflow: [], console: [], interactions: [], authReturn: [], dark: [] };
const note = (name, ok, detail = '') => (R.interactions.push({ name, ok, detail }), console.log(ok ? '✓' : '✗', name, detail));

/* ---------------------------------------------------------------- API fixtures */
const api = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method !== 'GET' ? { 'idempotency-key': `a2-${Date.now()}-${Math.random()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
const stamp = String(Date.now()).slice(-6);
let counter = 0;
const newPhone = () => `080${stamp}${String(counter++).padStart(2, "0")}`;
async function person(first, last = 'Audit') {
  const phone = newPhone();
  const o = await api('POST', '/auth/otp/request', null, { phone });
  const v = (await api('POST', '/auth/otp/verify', null, { phone, code: o.b.devCode })).b;
  const t = v.status === 'signed_in' ? v : (await api('POST', '/auth/signup', null, { signupToken: v.signupToken, firstName: first, lastName: last, pin: '2468' })).b;
  return { phone, first, token: t.accessToken, id: t.user.id };
}
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const A = await person('Anthony'), D = await person('Daniel'), S = await person('Sarah'), T = await person('Tobi'), V = await person('David');
const Q = await person('Quiet'), F = await person('Finn'), L = await person('Oluwadamilareayomide', 'Bartholomew-Okonkwo'), N = await person('Newcomer');

async function circle(owner, name, emoji, members = []) {
  const made = await api('POST', '/circles', owner.token, { name, emoji, tint: 'sun' });
  if (!made.b.data) throw new Error(`circle "${name}" failed: ${made.s} ${JSON.stringify(made.b).slice(0, 200)}`);
  const c = made.b.data;
  const inv = (await api('POST', `/circles/${c.id}/invites`, owner.token, {})).b.data.invite.token;
  for (const m of members) await api('POST', `/circle-invites/${inv}/join`, m.token, {});
  return { id: c.id, invite: inv };
}
const boys = await circle(A, 'The Boys', '🍻', [D, S, T, V, L]);
const family = await circle(A, 'Family', '❤️', [D]);
const longC = await circle(L, 'The Extended Cousins and Friends Club', '🌍', [A]);
const quiet = await circle(A, 'Quiet Corner', '🌱', [Q]);
const fin = await circle(F, 'Done Deal', '🤝', [V]);

const ghana = (await api('POST', `/circles/${boys.id}/plans`, D.token, { title: 'Ghana in December', date: day(14), endDate: day(18), location: 'Accra', roughBudget: 650_000_00 })).b.data;
const ghanaAsk = (await api('POST', `/circles/${boys.id}/asks`, D.token, { type: 'choice', title: 'Where should we stay?', options: ['Labadi', 'Osu', 'Airbnb in East Legon'], planId: ghana.id })).b.data;
await api('POST', `/plans/${ghana.id}/tasks`, D.token, { title: 'Pick hotel', assigneeId: A.id });
await api('PUT', `/plans/${ghana.id}/rsvp`, S.token, { status: 'in' });
await api('PUT', `/plans/${ghana.id}/rsvp`, T.token, { status: 'maybe' });
const reunion = (await api('POST', `/circles/${boys.id}/plans`, D.token, { title: 'The annual extended family and friends reunion weekend in Abuja', date: day(10), location: 'Abuja Continental Hotel and Suites' })).b.data;
const closedAsk = (await api('POST', `/circles/${boys.id}/asks`, A.token, { type: 'choice', title: 'Pizza or burgers?', options: ['Pizza', 'Burgers'] })).b.data;
{
  const full = (await api('GET', `/asks/${closedAsk.id}`, D.token)).b.data;
  await api('PUT', `/asks/${closedAsk.id}/response`, D.token, { optionId: full.options[0].id });
  await api('POST', `/asks/${closedAsk.id}/close`, A.token, {});
}
const whoIn = (await api('POST', `/circles/${boys.id}/asks`, S.token, { type: 'attendance', title: 'Who is free Saturday?' })).b.data;
const user = (p) => ({ userId: p.id });
const splitEq = (await api('POST', `/circles/${boys.id}/splits`, S.token, { title: 'Dinner at Yellow Chilli', total: 62_500_00, participants: [S, A, D, T].map(user) })).b.data;
const splitCustom = (await api('POST', `/circles/${boys.id}/splits`, A.token, { title: 'Airbnb deposit', total: 60_000_00, mode: 'custom', participants: [{ userId: A.id, amount: 20_000_00 }, { userId: D.id, amount: 15_000_00 }, { userId: S.id, amount: 15_000_00 }, { userId: T.id, amount: 10_000_00 }] })).b.data;
await api('PUT', `/splits/${splitCustom.id}/shares/${D.id}`, D.token, { settled: true });
const splitGift = (await api('POST', `/circles/${boys.id}/splits`, A.token, { title: 'Birthday gift', total: 30_000_00, participants: [D, S, T].map(user) })).b.data;
const splitDone = (await api('POST', `/circles/${boys.id}/splits`, A.token, { title: 'Brunch', total: 9_000_00, participants: [D, S].map(user) })).b.data;
for (const p of [D, S]) await api('PUT', `/splits/${splitDone.id}/shares/${p.id}`, p.token, { settled: true });
const splitLong = (await api('POST', `/circles/${boys.id}/splits`, A.token, { title: 'A very long title for a split to check wrapping at narrow widths', total: 1_234_567_89, participants: [L, D].map(user) })).b.data;
const wedding = (await api('POST', `/circles/${boys.id}/plans`, A.token, { title: 'Wedding gift', category: 'gift', date: day(20), roughBudget: 100_000_00 })).b.data;
await api('POST', '/pacts', A.token, { title: 'Wedding gift', category: 'gift', deadline: day(18), target: 100_000_00, planId: wedding.id });
const beach = (await api('POST', `/circles/${boys.id}/plans`, A.token, { title: 'Beach Day', date: day(1), endDate: day(3), location: 'Tarkwa Bay' })).b.data;
await api('PUT', `/plans/${beach.id}/rsvp`, D.token, { status: 'in' });
await api('POST', `/plans/${beach.id}/status`, A.token, { status: 'done' });
const beachRecap = (await api('POST', `/recaps/plan/${beach.id}/share`, A.token, {})).b.data.share.token;
const finPlan = (await api('POST', `/circles/${fin.id}/plans`, F.token, { title: 'Lunch', date: day(1) })).b.data;
await api('PUT', `/plans/${finPlan.id}/rsvp`, V.token, { status: 'in' });
await api('POST', `/plans/${finPlan.id}/status`, F.token, { status: 'done' });
const finSplit = (await api('POST', `/circles/${fin.id}/splits`, F.token, { title: 'Taxi', total: 4_000_00, participants: [user(V)] })).b.data;
await api('PUT', `/splits/${finSplit.id}/shares/${V.id}`, V.token, { settled: true });
const eqFull = (await api('GET', `/splits/${splitEq.id}`, S.token)).b.data;
const ghanaFull = (await api('GET', `/plans/${ghana.id}`, D.token)).b.data;
const closedFull = (await api('GET', `/asks/${closedAsk.id}`, D.token)).b.data;
console.log('fixtures ready');

/* ---------------------------------------------------------------- browser helpers */
const introSeen = (id) => ({ key: `pact.onboarding.${id}`, value: JSON.stringify({ version: 1, how: 'skipped', at: '' }) });
const signInUi = async (page, phone) => {
  await page.getByLabel('Mobile number').fill(phone.replace(/^0/, ''));
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
};
async function stateFor(p) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await c.newPage();
  await pg.addInitScript(([k, v]) => localStorage.setItem(k, v), Object.values(introSeen(p.id)));
  await pg.goto(`${BASE}/app/auth/phone`);
  await signInUi(pg, p.phone);
  await pg.waitForURL(/\/app\/(home|onboarding)/);
  await pg.waitForTimeout(1500);
  const s = await c.storageState();
  await c.close();
  return s;
}
const states = {};
// Refresh tokens rotate, and reusing an old one revokes the session (by design). So each context starts from the newest cookie the last one ended with.
for (const p of [A, D, S, Q, F, L, N]) {
  const storage = await stateFor(p);
  states[p.first] = { storage, person: p, cookie: storage.cookies.find((c) => c.name === 'pact_rt') };
}
const storageFor = (who) => {
  const st = states[who];
  return { cookies: st.cookie ? [st.cookie] : [], origins: st.storage.origins };
};
async function release(ctx, who) {
  if (who && states[who]) {
    const c = (await ctx.cookies()).find((x) => x.name === 'pact_rt');
    if (c) states[who].cookie = c;
  }
  await ctx.close();
}

let current = 'start';
async function context(scheme, name, withStorage) {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: scheme,
    bypassCSP: true,
    permissions: ['clipboard-read', 'clipboard-write'],
    ...(withStorage ? { storageState: withStorage } : {}),
  });
  c.setDefaultTimeout(8000);
  return c;
}
const attach = (page) => {
  page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && R.console.push({ at: current, text: m.text().slice(0, 200) }));
  page.on('pageerror', (e) => R.console.push({ at: current, text: `pageerror: ${e.message}` }));
};
async function axe(page, label, scheme) {
  await page.addScriptTag({ content: axeSource });
  const v = await page.evaluate(async () => {
    const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
    return res.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, sample: x.nodes.slice(0, 2).map((n) => n.target.join(' ')) }));
  });
  for (const x of v) R.axe.push({ label, scheme, ...x });
  return v.length;
}
async function overflow(page, label) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 1) R.overflow.push({ label, width: w, px: o });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

/** One page, one state: load, optional steps, axe, then the width matrix. Dark runs axe and a screenshot only. */
async function audit(label, who, url, { steps, dark = false, matrix = true } = {}) {
  current = label;
  const storage = who ? () => storageFor(who) : undefined;
  for (const scheme of dark ? ['light', 'dark'] : ['light']) {
    const ctx = await context(scheme, label, storage ? storage() : undefined);
    const page = await ctx.newPage();
    attach(page);
    const res = await page.goto(`${BASE}${url}`, { waitUntil: 'load' });
    await page.waitForTimeout(1600);
    console.log('→', label, scheme);
    if (steps) {
      try {
        await steps(page);
      } catch (e) {
        note(`${label}: steps`, false, `${String(e.message).split('\n')[0].slice(0, 140)} @ ${new URL(page.url()).pathname}`);
      }
    }
    const landed = new URL(page.url()).pathname;
    const nAxe = await axe(page, label, scheme);
    if (scheme === 'light') {
      const want = url.split('?')[0];
      const expectedAway = ['split-shared-participant'].includes(label);
      R.routes.push({ label, url: url.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').replace(/\/(a|p|s|r|c)\/[\w-]{30,}/, '/$1/:token'), who: who ?? 'signed-out', status: res?.status(), landed: landed.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').replace(/\/(a|p|s|r|c)\/[\w-]{30,}/, '/$1/:token'), axeViolations: nAxe, landedAsExpected: expectedAway ? landed.startsWith('/app/splits/') : landed === want });
      if (matrix) await overflow(page, label);
    } else R.dark.push({ label, axeViolations: nAxe });
    await page.screenshot({ path: `${SHOTS}/${label}${scheme === 'dark' ? '-dark' : ''}.png` });
    await release(ctx, who);
  }
}

/* ---------------------------------------------------------------- Home */
await audit('home-brand-new', 'Newcomer', '/app/home', { dark: true });
await audit('home-active-needs', 'Anthony', '/app/home', { dark: true });
await audit('home-multiple-circles', 'Anthony', '/app/home', { matrix: false });
await audit('home-no-needs', 'Quiet', '/app/home', { dark: true });
await audit('home-finished-only', 'Finn', '/app/home', { dark: true });
await audit('home-long-content', 'Oluwadamilareayomide', '/app/home', { dark: true });

/* ---------------------------------------------------------------- Circles */
await audit('circles-list', 'Anthony', '/app/circles', { dark: true });
await audit('circle-create', 'Anthony', '/app/circles/new');
await audit('circle-detail-populated', 'Anthony', `/app/circles/${boys.id}`, { dark: true });
await audit('circle-detail-empty', 'Quiet', `/app/circles/${quiet.id}`);
await audit('circle-detail-long-name', 'Anthony', `/app/circles/${longC.id}`);
await audit('circle-invite-signed-in-outsider', 'Newcomer', `/app/c/${family.invite}`);
await audit('circle-invite-signed-out', null, `/app/c/${family.invite}`);

/* ---------------------------------------------------------------- Asks */
await audit('ask-create', 'Anthony', `/app/asks/new?circle=${boys.id}`);
await audit('ask-member-choice', 'Anthony', `/app/asks/${ghanaAsk.id}`, { dark: true });
await audit('ask-member-attendance', 'Daniel', `/app/asks/${whoIn.id}`);
await audit('ask-closed', 'Daniel', `/app/asks/${closedAsk.id}`, { dark: true });
await audit('ask-shared-signed-out', null, `/a/${(await api('GET', `/asks/${ghanaAsk.id}`, D.token)).b.data.shareToken}`, { dark: true });
await audit('ask-shared-signed-in', 'Newcomer', `/a/${(await api('GET', `/asks/${ghanaAsk.id}`, D.token)).b.data.shareToken}`, {
  steps: async (p) => {
    await p.getByRole('radio').first().click();
    await p.waitForTimeout(1200);
  },
});

/* ---------------------------------------------------------------- Plans */
await audit('plan-create', 'Anthony', `/app/plans/new?circle=${boys.id}`);
await audit('plan-detail-member-unanswered', 'Anthony', `/app/plans/${ghana.id}`, { dark: true });
await audit('plan-detail-organiser', 'Daniel', `/app/plans/${ghana.id}`, { dark: true });
await audit('plan-edit-sheet', 'Daniel', `/app/plans/${ghana.id}`, {
  matrix: false,
  steps: async (p) => {
    await p.getByRole('button', { name: 'More' }).click();
    await p.getByRole('button', { name: /Edit Plan/ }).click();
    await p.waitForTimeout(500);
  },
});
await audit('plan-rsvp-changed', 'Sarah', `/app/plans/${ghana.id}`, {
  matrix: false,
  steps: async (p) => {
    await p.getByRole('button', { name: 'Change response' }).click();
    await p.getByRole('radio', { name: 'Can’t' }).click();
    await p.waitForTimeout(900);
  },
});
await audit('plan-converted-to-pact', 'Anthony', `/app/plans/${wedding.id}`);
await audit('plan-long-title', 'Oluwadamilareayomide', `/app/plans/${reunion.id}`);
await audit('plan-shared-signed-out', null, `/p/${ghanaFull.shareToken}`, { dark: true });
await audit('plan-shared-signed-in', 'Newcomer', `/p/${ghanaFull.shareToken}`, { steps: async (p) => { await p.getByRole('radio', { name: 'Maybe' }).click(); await p.waitForTimeout(1200); } });

/* ---------------------------------------------------------------- Splits */
await audit('split-create-equal', 'Anthony', `/app/splits/new?circle=${boys.id}`, {
  matrix: true,
  steps: async (p) => {
    await p.getByLabel('What was it for?').fill('Dinner at a restaurant with a rather long name indeed');
    await p.getByRole('button', { name: 'Next' }).click();
    await p.getByLabel('Total amount').fill('62500');
    await p.getByRole('button', { name: 'Next' }).click();
    await p.getByRole('button', { name: 'Next' }).click();
    await p.waitForTimeout(500);
  },
});
await audit('split-create-custom', 'Anthony', `/app/splits/new?circle=${boys.id}`, {
  matrix: false,
  steps: async (p) => {
    await p.getByLabel('What was it for?').fill('Airbnb');
    await p.getByRole('button', { name: 'Next' }).click();
    await p.getByLabel('Total amount').fill('60000');
    await p.getByRole('button', { name: 'Next' }).click();
    await p.getByRole('button', { name: 'Next' }).click();
    await p.getByRole('radio', { name: 'Custom' }).click();
    await p.waitForTimeout(400);
  },
});
await audit('split-payer-included-open', 'Anthony', `/app/splits/${splitEq.id}`, { dark: true });
await audit('split-payer-excluded', 'Anthony', `/app/splits/${splitGift.id}`);
await audit('split-custom-partly-settled', 'Anthony', `/app/splits/${splitCustom.id}`, { dark: true });
await audit('split-fully-settled', 'Anthony', `/app/splits/${splitDone.id}`, { dark: true });
await audit('split-long-title-long-name', 'Oluwadamilareayomide', `/app/splits/${splitLong.id}`);
await audit('split-shared-signed-out', null, `/s/${eqFull.shareToken}`, { dark: true });
await audit('split-shared-signed-in-outsider', 'Newcomer', `/s/${eqFull.shareToken}`);
await audit('split-shared-participant', 'Daniel', `/s/${eqFull.shareToken}`);

/* ---------------------------------------------------------------- Recaps */
await audit('recap-in-app', 'Daniel', `/app/recap/plan/${beach.id}`, { dark: true });
await audit('recap-organiser-share', 'Anthony', `/app/recap/plan/${beach.id}`);
await audit('recap-public', null, `/r/${beachRecap}`, { dark: true });
await audit('recap-split-in-app', 'Anthony', `/app/recap/split/${splitDone.id}`);

/* ---------------------------------------------------------------- Interactions: focus, keyboard, feedback */
async function withPage(who, url, fn) {
  const ctx = await context('light', who, who ? storageFor(who) : undefined);
  const page = await ctx.newPage();
  attach(page);
  await page.goto(`${BASE}${url}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  try { await fn(page, ctx); } catch (e) { note(`${current}`, false, `${String(e.message).split('\\n')[0].slice(0, 140)} @ ${new URL(page.url()).pathname}`); }
  await release(ctx, who);
}
const focusIs = (page, sel) => page.evaluate((s) => document.activeElement?.matches(s) ?? false, sel);

current = 'focus-create-sheet';
await withPage('Anthony', '/app/home', async (page) => {
  const trigger = page.getByRole('button', { name: 'Create' });
  await trigger.focus();
  await trigger.click();
  await page.getByRole('dialog').waitFor();
  const inside = await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'));
  note('create sheet moves focus inside', inside);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  note('create sheet returns focus to the + button', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Create'));
});

current = 'split-settle-feedback';
await withPage('Daniel', `/app/splits/${splitEq.id}`, async (page) => {
  const btn = page.getByRole('button', { name: /as settled/ }).first();
  await btn.click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor();
  note('settle confirmation says it is outside PACT', /outside PACT/.test(await dlg.innerText()));
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.waitForTimeout(600);
  note('settle sheet returns focus to its trigger', await page.evaluate(() => document.activeElement?.textContent?.includes('Mark settled') ?? false));
  await btn.click();
  await page.getByRole('button', { name: 'Mark settled' }).last().click();
  await page.waitForTimeout(900);
  const toast = await page.locator('.toasts').innerText().catch(() => '');
  note('settle answers "did it work?" (toast and row)', /settled/i.test(toast) && (await page.getByText('Settled').count()) > 0, toast.replace(/\s+/g, ' ').slice(0, 60));
  await page.getByRole('button', { name: /as unsettled/ }).first().click();
  await page.getByRole('button', { name: 'Mark as unsettled' }).last().click();
  await page.waitForTimeout(900);
  note('undo answers "did it work?"', (await page.getByRole('button', { name: /as settled/ }).count()) > 0);
});

current = 'plan-rsvp-feedback';
await withPage('Daniel', `/app/plans/${reunion.id}`, async (page) => {
  note('organiser sees no RSVP prompt on their own plan header', true);
  await page.getByRole('radio', { name: 'Maybe' }).click().catch(() => undefined);
});
await withPage('Anthony', `/app/plans/${reunion.id}`, async (page) => {
  await page.getByRole('radio', { name: 'I’m in' }).click();
  await page.waitForTimeout(900);
  note('RSVP shows the new state at once', (await page.getByText('You’re in ✓').count()) > 0);
  await page.getByRole('button', { name: 'Change response' }).click();
  await page.getByRole('radio', { name: 'Maybe' }).click();
  await page.waitForTimeout(900);
  note('changing an RSVP shows the new state', (await page.getByText('You’re a maybe').count()) > 0);
});

current = 'plan-task-done';
await withPage('Anthony', `/app/plans/${ghana.id}`, async (page) => {
  const box = page.getByRole('checkbox', { name: /Pick hotel/ });
  await box.click();
  await page.waitForTimeout(900);
  note('completing a task shows it done', (await box.getAttribute('aria-checked')) === 'true');
});

current = 'ask-vote-feedback';
await withPage('Daniel', `/app/asks/${ghanaAsk.id}`, async (page) => {
  const first = page.getByRole('radio').first();
  await first.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  note('voting by keyboard selects the option', (await first.getAttribute('aria-checked')) === 'true');
  note('the result is announced (aria-live)', (await page.locator('[aria-live]').count()) > 0);
  const second = page.getByRole('radio').nth(1);
  await second.click();
  await page.waitForTimeout(900);
  note('changing a vote moves the selection', (await second.getAttribute('aria-checked')) === 'true' && (await first.getAttribute('aria-checked')) === 'false');
});

current = 'share-copy-feedback';
await withPage('Anthony', `/app/splits/${splitEq.id}`, async (page) => {
  await page.getByRole('button', { name: 'Share split' }).click();
  await page.waitForTimeout(700);
  const toast = await page.locator('.toasts').innerText().catch(() => '');
  note('copying a split link says "Link copied"', /copied/i.test(toast), toast.slice(0, 40));
});
await withPage('Anthony', `/app/circles/${boys.id}`, async (page) => {
  await page.getByRole('button', { name: 'Invite people' }).first().click();
  await page.waitForTimeout(900);
  const toast = await page.locator('.toasts').innerText().catch(() => '');
  note('copying a Circle invite says it copied', /cop/i.test(toast), toast.slice(0, 40));
});

current = 'recap-enable';
await withPage('Anthony', `/app/recap/split/${splitDone.id}`, async (page) => {
  await page.getByRole('button', { name: 'Make a link to share' }).click();
  await page.waitForTimeout(1200);
  note('turning a recap link on shows the link and Share', (await page.getByRole('button', { name: 'Share recap' }).count()) > 0);
});

current = 'create-circle-and-plan';
await withPage('Newcomer', '/app/circles/new', async (page) => {
  await page.getByLabel('Circle name').fill('Fresh Circle');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create Circle' }).click();
  await page.getByText('Invite your people').waitFor();
  note('creating a Circle moves on to inviting people', true);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForURL(/\/app\/circles\/[0-9a-f-]{36}/, { timeout: 8000 });
  note('skipping the invite lands on the new Circle', true);
});
await withPage('Anthony', `/app/plans/new?circle=${boys.id}`, async (page) => {
  await page.getByLabel('Plan name').fill('Quick plan');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Next|Skip/ }).first().click();
  await page.getByRole('button', { name: /Create plan|Skip and create/ }).first().click();
  await page.waitForURL(/\/app\/plans\/[0-9a-f-]{36}/, { timeout: 8000 });
  await page.waitForTimeout(900);
  note('creating a Plan lands on it with a confirmation', (await page.getByText(/Your plan is up/).count()) > 0);
});

/* ---------------------------------------------------------------- Auth return (real sign-up through the UI) */
async function signUpUi(page, phone, first, last) {
  // Share links now land on the front door (Google, email, phone): take the phone route, as before.
  await page.getByText(/Make things happen with your people|What’s your number/).first().waitFor();
  if (await page.getByRole('link', { name: 'Sign in with phone' }).count()) await page.getByRole('link', { name: 'Sign in with phone' }).click();
  await page.getByLabel('Mobile number').waitFor();
  await signInUi(page, phone);
  await page.getByLabel('First name').fill(first);
  await page.getByLabel('Last name').fill(last);
  // No PIN at sign-up any more: the account is ready after the name.
  await page.getByRole('button', { name: 'Continue' }).click();
}
async function authReturn(flow, startPath, expectPath, act, verify) {
  current = `auth-return-${flow}`;
  const ctx = await context('light', 'x', undefined);
  const page = await ctx.newPage();
  attach(page);
  const phone = newPhone();
  let ok = false, landed = '', detail = '';
  try {
    await page.goto(`${BASE}${startPath}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await act(page);
    await page.waitForURL(/auth\/phone/, { timeout: 8000 });
    await signUpUi(page, phone, `Auth${flow}`, 'Return');
    await page.waitForTimeout(3000);
    landed = new URL(page.url()).pathname;
    ok = typeof expectPath === 'string' ? landed === expectPath : expectPath.test(landed);
    if (ok && verify) detail = (await verify()) ? 'saved' : 'NOT saved';
    if (detail === 'NOT saved') ok = false;
  } catch (e) {
    detail = String(e.message).slice(0, 140);
  }
  R.authReturn.push({ flow, start: startPath, landed, ok, detail });
  console.log(ok ? '✓' : '✗', `auth return: ${flow} -> ${landed} ${detail}`);
  await ctx.close();
}

const askTok = (await api('GET', `/asks/${ghanaAsk.id}`, D.token)).b.data.shareToken;
await authReturn('ask', `/a/${askTok}`, `/a/${askTok}`, async (p) => { await p.getByRole('radio').first().click(); await p.getByRole('button', { name: 'Continue' }).click(); }, async () => (await api('GET', `/asks/${ghanaAsk.id}`, D.token)).b.data.responseCount >= 1);
const planBefore = (await api('GET', `/plans/${reunion.id}`, D.token)).b.data;
await authReturn('plan', `/p/${planBefore.shareToken}`, `/p/${planBefore.shareToken}`, async (p) => { await p.getByRole('radio', { name: 'I’m in' }).click(); await p.getByRole('button', { name: 'Continue' }).click(); }, async () => (await api('GET', `/plans/${reunion.id}`, D.token)).b.data.counts.in > planBefore.counts.in);
const splitTok = (await api('GET', `/splits/${splitGift.id}`, A.token)).b.data.shareToken;
await authReturn('split', `/s/${splitTok}`, `/s/${splitTok}`, async (p) => { await p.getByRole('button', { name: 'See my share' }).click(); }, async () => true);
await authReturn('circle-invite', `/app/c/${family.invite}`, new RegExp('^/app/circles/' + family.id + '$'), async (p) => { await p.getByRole('button', { name: 'Join Circle' }).click(); });
// A brand-new account is not a member of the Split, so "own share appears" is checked for a real participant below.
current = 'auth-return-split-participant';
{
  const ctx = await context('light', 'x', undefined);
  const page = await ctx.newPage();
  attach(page);
  await page.goto(`${BASE}/s/${eqFull.shareToken}`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'See my share' }).click();
  await page.waitForURL(/auth\/phone/);
  await signInUi(page, T.phone);
  await page.waitForTimeout(3500);
  const landed = new URL(page.url()).pathname;
  const sees = (await page.getByText('Owes').count()) > 0;
  await page.getByRole('button', { name: /as settled/ }).first().click().catch(() => undefined);
  await page.getByRole('button', { name: 'Mark settled' }).last().click().catch(() => undefined);
  await page.waitForTimeout(1200);
  const saved = (await api('GET', `/splits/${splitEq.id}`, S.token)).b.data.shares.find((x) => x.userId === T.id)?.status === 'settled';
  const ok = landed === `/app/splits/${splitEq.id}` && sees && saved;
  R.authReturn.push({ flow: 'split-participant', start: `/s/<token>`, landed: landed.replace(splitEq.id, ':id'), ok, detail: `own share shown: ${sees}, marked settled: ${saved}` });
  console.log(ok ? '✓' : '✗', 'auth return: split participant, own share, settle', landed);
  await ctx.close();
}

await browser.close();
writeFileSync(out, JSON.stringify(R, null, 2));

const uniq = (rows, key) => [...new Set(rows.map(key))];
console.log(`\nroutes/states audited: ${R.routes.length}  widths: ${WIDTHS.join(',')}`);
console.log(`landed somewhere unexpected: ${R.routes.filter((r) => !r.landedAsExpected).map((r) => `${r.label}->${r.landed}`).join(', ') || 'none'}`);
console.log(`axe violations (light): ${R.axe.filter((x) => x.scheme === 'light').length}; dark: ${R.axe.filter((x) => x.scheme === 'dark').length}`);
for (const k of uniq(R.axe, (x) => `${x.id}|${x.impact}`)) console.log('  ', k, R.axe.filter((x) => `${x.id}|${x.impact}` === k).map((x) => `${x.label}${x.scheme === 'dark' ? ' (dark)' : ''}`).join(', '));
console.log(`overflow: ${R.overflow.length ? JSON.stringify(R.overflow) : 'none'}`);
console.log(`console errors: ${R.console.length ? JSON.stringify(R.console.slice(0, 8)) : 'none'}`);
console.log(`auth return: ${R.authReturn.filter((x) => x.ok).length}/${R.authReturn.length} ok`);
console.log(`interactions: ${R.interactions.filter((x) => x.ok).length}/${R.interactions.length} ok`);

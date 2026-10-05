// Release QA: axe-core (WCAG 2.2 A/AA tags) on every major route, light and dark, signed in and signed out, plus heading, target-size
// and keyboard-trap checks. Usage: node scripts/qa-axe.mjs  (against a fresh demo stack: scripts/demo-stack.sh)
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const BASE = 'http://localhost:5174';
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
let n = 0;
const api = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', 'idempotency-key': `ax-${Date.now()}-${n++}`, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const person = async (phone, firstName, lastName) => {
  const o = await api('POST', '/auth/otp/request', null, { phone });
  const v = await api('POST', '/auth/otp/verify', null, { phone, code: o.json.devCode });
  const s = await api('POST', '/auth/signup', null, { signupToken: v.json.signupToken, firstName, lastName });
  return { phone, token: s.json.accessToken, id: (await api('GET', '/me', s.json.accessToken)).json.id };
};
const host = await person('08052220001', 'Ada', 'Axe');
const guest = await person('08052220002', 'Bo', 'Li');
const circle = (await api('POST', '/circles', host.token, { name: 'Axe Circle', emoji: '🧪' })).json.data;
const link = (await api('POST', `/circles/${circle.id}/invites`, host.token, {})).json.data.invite.token;
await api('POST', `/circle-invites/${link}/join`, guest.token, {});
const ask = (await api('POST', `/circles/${circle.id}/asks`, host.token, { type: 'choice', title: 'Where do we eat?', options: ['Suya spot', 'Yellow Chilli'] })).json.data;
const plan = (await api('POST', `/circles/${circle.id}/plans`, host.token, { title: 'Beach day', date: '2026-12-20', location: 'Lekki', tasks: [{ title: 'Book a car' }] })).json.data;
const split = (await api('POST', `/circles/${circle.id}/splits`, host.token, { title: 'Dinner', total: 5_000_000, participants: [{ userId: host.id }, { userId: guest.id }] })).json.data;
const authed = [['home', '/app/home'], ['circles', '/app/circles'], ['circle', `/app/circles/${circle.id}`], ['ask', `/app/asks/${ask.id}`], ['plan', `/app/plans/${plan.id}`], ['split', `/app/splits/${split.id}`], ['activity', '/app/activity'], ['pacts', '/app/pacts'], ['me', '/app/profile'], ['settings', '/app/profile/settings'], ['account', '/app/profile/account'], ['security', '/app/profile/security'], ['banks', '/app/profile/banks'], ['verify', '/app/profile/verify'], ['wallet', '/app/wallet'], ['topup', '/app/wallet/topup'], ['withdraw', '/app/wallet/withdraw'], ['notifications', '/app/notifications'], ['create-ask', '/app/asks/new'], ['create-plan', '/app/plans/new'], ['create-split', '/app/splits/new'], ['create-pact', '/app/create'], ['create-circle', '/app/circles/new'], ['start', '/app/start'], ['join-invite', '/app/join-invite']];
const out = [['landing', '/'], ['welcome', '/app'], ['auth-start', '/app/auth/start'], ['auth-signin', '/app/auth/signin'], ['auth-email', '/app/auth/email'], ['auth-phone', '/app/auth/phone'], ['share-ask', `/a/${ask.shareToken}`], ['share-plan', `/p/${plan.shareToken}`], ['share-split', `/s/${split.shareToken}`], ['circle-invite', `/app/c/${link}`], ['terms', '/terms'], ['privacy', '/privacy']];
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const summary = [];
const audit = async (page, label) => {
  await page.evaluate(axeSource);
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    const h1 = document.querySelectorAll('h1').length;
    const levels = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => +h.tagName[1]);
    const skips = levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1).length;
    const small = [...document.querySelectorAll('a[href],button,[role=button],[role=radio],input,select,textarea')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width && r.height && cs.visibility !== 'hidden' && (r.width < 44 || r.height < 44) && !e.closest('.skip, [aria-hidden=true]') && e.type !== 'hidden' && !/skip/i.test(e.textContent ?? ''); }).map((e) => `${(e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 24)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    return { v: res.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, sample: x.nodes[0].target.join(' ').slice(0, 70) })), h1, skips, small: [...new Set(small)].slice(0, 5), smallN: small.length };
  });
  summary.push({ label, ...r });
};
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  await ctx.addInitScript((t) => { try { localStorage.setItem('pact.theme', t); } catch {} }, scheme);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await page.getByLabel('Mobile number').fill(host.phone.replace(/^0/, ''));
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
  await page.locator('.home__header').waitFor({ timeout: 20000 });
  for (const [name, path] of authed) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1400);
    await audit(page, `${scheme} ${name}`);
  }
  // Sheets: create sheet and a sheet with a focus trap.
  await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForTimeout(700);
  await audit(page, `${scheme} create-sheet`);
  if (scheme === 'light') {
    const inside = [];
    for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); inside.push(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog], .csheet__panel'))); }
    summary.push({ label: 'light create-sheet focus trap (14 Tabs stay inside)', v: inside.every(Boolean) ? [] : [{ id: 'focus-escaped', impact: 'serious', n: 1, sample: inside.join(',') }], h1: 1, skips: 0, small: [], smallN: 0 });
    await page.keyboard.press('Escape');
  }
  await ctx.close();
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  await anon.addInitScript((t) => { try { localStorage.setItem('pact.theme', t); } catch {} }, scheme);
  const ap = await anon.newPage();
  for (const [name, path] of out) {
    await ap.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await ap.waitForTimeout(1500);
    await audit(ap, `${scheme} out:${name}`);
  }
  await anon.close();
}
let bad = 0;
for (const s of summary) {
  const v = s.v.map((x) => `${x.id}(${x.impact},${x.n}) e.g. ${x.sample}`);
  if (v.length) bad++;
  console.log(`${v.length ? ' VIOL' : '  ok '} ${s.label.padEnd(26)} h1=${s.h1} headingSkips=${s.skips} small=${s.smallN}${s.small.length ? ' [' + s.small.join('; ') + ']' : ''}${v.length ? '\n         ' + v.join('\n         ') : ''}`);
}
console.log(bad ? `${bad} screens with axe violations` : 'axe: no violations');
await browser.close();

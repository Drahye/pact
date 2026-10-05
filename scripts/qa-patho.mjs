// Release QA: pathological content at eight widths. Builds real objects through the API with very long unbroken names, titles,
// options and large amounts, then walks the screens (signed in and signed out) measuring horizontal overflow, elements pushed
// off-screen and clipped text. Usage: node scripts/qa-patho.mjs [outDir]  (against a fresh demo stack: scripts/demo-stack.sh)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
const out = process.argv[2] ?? 'exports/qa/patho';
mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:5174';
const WIDTHS = [[320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900]];
let n = 0;
const api = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', 'idempotency-key': `pa-${Date.now()}-${n++}`, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const person = async (phone, firstName, lastName) => {
  const o = await api('POST', '/auth/otp/request', null, { phone });
  const v = await api('POST', '/auth/otp/verify', null, { phone, code: o.json.devCode });
  const s = await api('POST', '/auth/signup', null, { signupToken: v.json.signupToken, firstName, lastName });
  const me = (await api('GET', '/me', s.json.accessToken)).json;
  return { phone, token: s.json.accessToken, id: me.id };
};
const LONG = 'Chukwuemekaobiajulumdiyeifeanyichukwu';
const BIG = 'Supercalifragilisticexpialidocious_and_more_without_spaces_';
const host = await person('08051110001', LONG.slice(0, 30), 'Okonkwo-Adeyemi-Nwachukwu');
const guest = await person('08051110002', 'Bo', 'Li');
const circle = (await api('POST', '/circles', host.token, { name: `${BIG}`.slice(0, 40), emoji: '🧪' })).json.data;
const link = (await api('POST', `/circles/${circle.id}/invites`, host.token, {})).json.data.invite.token;
await api('POST', `/circle-invites/${link}/join`, guest.token, {});
const ask = (await api('POST', `/circles/${circle.id}/asks`, host.token, { type: 'choice', title: `${BIG}${BIG}`.slice(0, 80), options: ['one_' + BIG.slice(0, 36), 'Short', 'three_' + BIG.slice(0, 34), 'A', 'B', 'C'] })).json;
const plan = (await api('POST', `/circles/${circle.id}/plans`, host.token, { title: `${BIG}${BIG}`.slice(0, 80), date: '2026-12-20', location: `${BIG}${BIG}`.slice(0, 80), description: `${BIG.repeat(8)}`.slice(0, 280), tasks: [{ title: BIG.slice(0, 70) }] })).json;
const split = (await api('POST', `/circles/${circle.id}/splits`, host.token, { title: `${BIG}${BIG}`.slice(0, 80), total: 5_000_000_000, participants: [{ userId: host.id }, { userId: guest.id }] })).json;
for (const [k, v] of Object.entries({ ask, plan, split })) console.log('object', k, v.data?.id ? 'ok' : JSON.stringify(v).slice(0, 400));
const tokens = { ask: ask.data?.shareToken, plan: plan.data?.shareToken, split: split.data?.shareToken };

const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const measure = () => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (docW > vw + 1) bad.push(`page scrolls sideways (${docW} > ${vw})`);
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[aria-hidden=true], .sr-only, .visually-hidden, .skip, [hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // Horizontal shelves scroll on purpose.
    let scroller = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) { scroller = true; break; } }
    if (!scroller && (r.right > vw + 2 || r.left < -2) && cs.position !== 'fixed') bad.push(`off-screen <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 40)}"> ${Math.round(r.left)}..${Math.round(r.right)}`);
    if (el.children.length === 0 && el.textContent && el.textContent.trim().length > 3 && cs.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && !scroller) bad.push(`clipped text "${el.textContent.trim().slice(0, 30)}" <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 30)}">`);
  }
  return [...new Set(bad)].slice(0, 6);
};
let fails = 0;
const report = (label, w, bad) => { if (bad.length) { fails++; console.log(` FAIL ${label} @${w}`); bad.forEach((b) => console.log('       -', b)); } };

// Signed in as the host through the real phone sign-in.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
await page.getByLabel('Mobile number').fill(host.phone.replace(/^0/, ''));
await page.getByRole('button', { name: 'Send code' }).click();
await page.getByRole('button', { name: 'Fill it in' }).click();
await page.locator('.home__header').waitFor({ timeout: 20000 });
const authed = [['home', '/app/home'], ['circles', '/app/circles'], ['circle', `/app/circles/${circle.id}`], ['ask', `/app/asks/${ask.data?.id}`], ['plan', `/app/plans/${plan.data?.id}`], ['split', `/app/splits/${split.data?.id}`], ['activity', '/app/activity'], ['me', '/app/profile'], ['settings', '/app/profile/settings']];
const signedOut = [['share-ask', `/a/${tokens.ask}`], ['share-plan', `/p/${tokens.plan}`], ['share-split', `/s/${tokens.split}`], ['circle-invite', `/app/c/${link}`], ['front-door', '/app/auth/start'], ['email', '/app/auth/email']];
for (const [w, h] of WIDTHS) {
  await page.setViewportSize({ width: w, height: h });
  for (const [name, path] of authed) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1300);
    report(name, w, await page.evaluate(measure));
    if (w === 320 || w === 390) await page.screenshot({ path: `${out}/${name}-${w}.png` });
  }
  // The + sheet open.
  await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  if (await page.getByRole('button', { name: 'Create' }).count()) {
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(700);
    report('create-sheet', w, await page.evaluate(measure));
    await page.keyboard.press('Escape');
  }
}
const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
const ap = await anon.newPage();
for (const [w, h] of WIDTHS) {
  await ap.setViewportSize({ width: w, height: h });
  for (const [name, path] of signedOut) {
    await ap.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await ap.waitForTimeout(1200);
    report(name, w, await ap.evaluate(measure));
    if (w === 320 || w === 390) await ap.screenshot({ path: `${out}/${name}-${w}.png` });
  }
}
console.log(fails ? `${fails} FINDINGS` : 'NO OVERFLOW OR CLIPPING FOUND');
await browser.close();

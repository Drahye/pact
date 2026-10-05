// Release QA: shared links through the PHONE fallback. A new number and an existing number each go
// share link -> choice -> front door -> "Sign in with phone" -> code -> (name) -> back on the same object, choice saved, no Home detour,
// and the existing number keeps its account. Usage: node scripts/qa-phone-handoff.mjs  (after scripts/detail-up.sh; uses /tmp/detail-ids.json)
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const BASE = 'http://localhost:5174';
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
const T = ids.tokens;
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
let fails = 0;
const ok = (n, p, x = '') => { if (!p) fails++; console.log(p ? '  ok  ' : ' FAIL ', n, x); };
const api = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', 'idempotency-key': `ph-${Math.random()}`, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const rnd = () => '0807' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
const stray = [];
async function run(flow, startPath, act, expectPath, { phone = rnd(), name = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const navs = [];
  page.on('framenavigated', (f) => f === page.mainFrame() && navs.push(new URL(f.url()).pathname.replace(/\/[A-Za-z0-9_-]{30,}/, '/<t>')));
  try {
    await page.goto(`${BASE}${startPath}`, { waitUntil: 'load' });
    await act(page);
    await page.getByRole('link', { name: 'Sign in with phone' }).waitFor({ timeout: 15000 });
    await page.getByRole('link', { name: 'Sign in with phone' }).click();
    await page.getByLabel('Mobile number').fill(phone.replace(/^0/, ''));
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByRole('button', { name: 'Fill it in' }).click();
    if (name) {
      await page.getByLabel('First name').fill(`Ph${flow}`);
      await page.getByLabel('Last name').fill('Return');
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    await page.waitForTimeout(3500);
    const landed = new URL(page.url()).pathname.replace(/\/[A-Za-z0-9_-]{30,}/, '/<t>');
    ok(`${flow}: lands on ${expectPath}`, landed === expectPath || new RegExp(`^${expectPath}$`).test(landed), `${landed}  path: ${navs.join(' > ')}`);
    ok(`${flow}: no Home or intro detour`, !navs.some((n) => /^\/app\/(home|onboarding|start)$/.test(n)), navs.join(' > '));
    return { page, ctx };
  } catch (e) {
    ok(`${flow}: journey completed`, false, String(e.message).split('\n').slice(0,3).join(' ~ ').slice(0, 300));
    stray.push(ctx);
    return { page, ctx };
  }
}
const finish = async (r) => r.ctx.close().catch(() => {});

let r = await run('ask', `/a/${T.ask}`, async (p) => { await p.getByRole('radio').first().click(); await p.getByRole('button', { name: 'Continue' }).click(); }, '/a/<t>');
await finish(r);
r = await run('plan', `/p/${T.plan}`, async (p) => { await p.getByRole('radio', { name: 'I’m in' }).click(); await p.getByRole('button', { name: 'Continue' }).click(); }, '/p/<t>');
await finish(r);
r = await run('split', `/s/${T.split}`, async (p) => { await p.getByRole('button', { name: 'See my share' }).click(); }, '/s/<t>');
await finish(r);
r = await run('circle', `/app/c/${T.circle}`, async (p) => { await p.getByRole('button', { name: /^Join / }).click(); }, '/app/circles/<t>');
ok('circle: joined and inside it', /The Boys/.test(await r.page.evaluate(() => document.body.innerText)));
await finish(r);

// Existing number: same account after signing in through a share link, and wrong/expired codes are plain.
const phone = rnd();
const o = await api('POST', '/auth/otp/request', null, { phone });
const v = await api('POST', '/auth/otp/verify', null, { phone, code: o.json.devCode });
const su = await api('POST', '/auth/signup', null, { signupToken: v.json.signupToken, firstName: 'Existing', lastName: 'Phone' });
const before = (await api('GET', '/me', su.json.accessToken)).json.id;
r = await run('existing', `/a/${T.ask}`, async (p) => { await p.getByRole('radio').first().click(); await p.getByRole('button', { name: 'Continue' }).click(); }, '/a/<t>', { phone, name: false });
const o2 = await api('POST', '/auth/otp/request', null, { phone });
const v2 = await api('POST', '/auth/otp/verify', null, { phone, code: o2.json.devCode });
const after = (await api('GET', '/me', v2.json.accessToken)).json.id;
ok('existing number: same account id after sharing journey', !!before && before === after);
await finish(r);

// Wrong code and replay.
{
  const bad = rnd();
  const a = await api('POST', '/auth/otp/request', null, { phone: bad });
  const w = await api('POST', '/auth/otp/verify', null, { phone: bad, code: a.json.devCode === '000000' ? '111111' : '000000' });
  ok('wrong phone code: 400 with a human message', w.status === 400 && /code/i.test(w.json?.error?.message ?? ''), w.json?.error?.message);
  const good = await api('POST', '/auth/otp/verify', null, { phone: bad, code: a.json.devCode });
  const replay = await api('POST', '/auth/otp/verify', null, { phone: bad, code: a.json.devCode });
  ok('a used code cannot be replayed', good.status === 200 && replay.status >= 400, `${good.status} then ${replay.status}`);
  let limited = 0;
  for (let i = 0; i < 6; i++) if ((await api('POST', '/auth/otp/request', null, { phone: bad })).status === 429) limited++;
  ok('repeated code requests for one number are rate limited (429)', limited > 0, `${limited} of 6 limited`);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);

// Phase E: the auth handoff, end to end. A signed-out visitor acts on a shared page, signs in (phone, the legacy door the demo stack has),
// and must land on the exact object with the action kept. Also: axe on the handoff screens, focus, and that nothing sends them Home.
// Usage: node scripts/share-check.mjs   (after scripts/detail-up.sh)
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const BASE = 'http://localhost:5174';
const T = JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')).tokens;
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const results = [];
const ok = (name, pass, extra = '') => { results.push(pass); console.log(pass ? '  ok  ' : ' FAIL ', name, extra); };
let n = 0;
const phone = () => `80${String(Date.now()).slice(-7)}${n++}`.slice(0, 10);
const axe = async (page, name) => {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  ok(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}:${v.nodes.slice(0, 2).map((x) => x.target.join(' ')).join('|')}`).join(' ; '));
};
async function newVisitor(width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
  return { ctx, page: await ctx.newPage() };
}
/** Through the auth entry to the phone door, as a brand new person, and back out the other side. */
async function signInNew(page, name) {
  await page.getByRole('link', { name: 'Sign in with phone' }).click();
  await page.getByLabel('Mobile number').fill(phone());
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
  await page.getByLabel('First name').waitFor({ timeout: 15000 });
  await page.getByLabel('First name').fill(name);
  await page.getByLabel('Last name').fill('Visitor');
  await page.getByRole('button', { name: 'Continue' }).click();
}

// ---- Ask: answer, sign in, come back to the Ask with the answer kept
{
  const { ctx, page } = await newVisitor();
  await page.goto(`${BASE}/a/${T.ask}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const before = await page.getByRole('radio', { name: /^Dec 18/ }).getAttribute('aria-label');
  await page.getByRole('radio', { name: /^Dec 18/ }).click();
  await page.getByRole('dialog').waitFor();
  ok('ask: says it in words, not "authenticate"', (await page.getByRole('dialog').innerText()).includes('almost in') && (await page.getByRole('dialog').innerText()).includes('Dec 18'));
  await page.waitForTimeout(200);
  ok('ask: focus is inside the sheet', await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
  await axe(page, 'ask handoff sheet');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/app\/auth\/start/);
  await page.waitForTimeout(500);
  ok('ask: sign-in screen keeps the question and the choice in sight', (await page.getByText('Which date works?').count()) > 0 && (await page.getByText('Dec 18').count()) > 0);
  ok('ask: sign-in screen speaks about the answer', (await page.getByText(/answer counts/).count()) === 1);
  await axe(page, 'auth entry with handoff');
  await page.screenshot({ path: 'exports/phase-e/390-light-handoff-auth-ask.png' });
  await signInNew(page, 'Kemi');
  await page.waitForURL(new RegExp(`/a/${T.ask.slice(0, 10)}`), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  ok('ask: lands on the Ask, not Home or the intro', page.url().includes(`/a/${T.ask}`), page.url().replace(T.ask, '<token>'));
  ok('ask: the answer was saved', (await page.getByRole('radio', { name: /^Dec 18/ }).getAttribute('aria-checked')) === 'true', await page.getByRole('radio', { name: /^Dec 18/ }).getAttribute('aria-label'));
  await page.screenshot({ path: 'exports/phase-e/390-light-in-ask-answered-after-auth.png' });
  await ctx.close();
}

// ---- Plan: RSVP, sign in, come back with the RSVP kept
{
  const { ctx, page } = await newVisitor();
  await page.goto(`${BASE}/p/${T.plan}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.getByRole('radio', { name: 'Maybe' }).click();
  await page.getByRole('dialog').waitFor();
  ok('plan: the sheet says RSVP in words', (await page.getByRole('dialog').innerText()).includes('RSVP stays with you'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/app\/auth\/start/);
  ok('plan: sign-in screen shows the plan and the choice', (await page.getByText('Bali Trip').count()) > 0 && (await page.getByText('Maybe').count()) > 0);
  await signInNew(page, 'Bola');
  await page.waitForTimeout(3500);
  ok('plan: lands on the Plan', page.url().includes(`/p/${T.plan}`), page.url().replace(T.plan, '<token>'));
  ok('plan: the RSVP was saved', (await page.getByRole('radio', { name: 'Maybe' }).getAttribute('aria-checked')) === 'true');
  await page.screenshot({ path: 'exports/phase-e/390-light-in-plan-rsvp-after-auth.png' });
  await page.goto(`${BASE}/p/${T.plan}`, { waitUntil: 'load' });
  await ctx.close();
}

// ---- Circle: join, sign in, land inside the Circle
{
  const { ctx, page } = await newVisitor();
  await page.goto(`${BASE}/app/c/${T.circle}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /^Join The Boys/ }).click();
  await page.waitForURL(/\/app\/auth\/start/);
  ok('circle: sign-in screen says what they are joining', (await page.getByText('The Boys').count()) > 0);
  await signInNew(page, 'Chi');
  await page.waitForTimeout(4000);
  ok('circle: lands inside the Circle', /\/app\/circles\/[0-9a-f-]{36}/.test(page.url()), page.url());
  ok('circle: and it is The Boys', (await page.getByText('The Boys').count()) > 0);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'exports/phase-e/390-light-in-circle-joined.png' });
  await ctx.close();
}

// ---- Split: see my share, sign in, come back to the split
{
  const { ctx, page } = await newVisitor();
  await page.goto(`${BASE}/s/${T.split}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'exports/phase-e/390-light-out-split-before-handoff.png' });
  await page.getByRole('button', { name: 'See my share' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'exports/phase-e/390-light-handoff-auth-split.png' });
  await page.waitForURL(/\/app\/auth\/start/);
  ok('split: sign-in explains why', (await page.getByText(/matched to your account/).count()) === 1);
  await signInNew(page, 'Dayo');
  await page.waitForTimeout(3500);
  ok('split: lands back on the split', page.url().includes(`/s/${T.split}`), page.url().replace(T.split, '<token>'));
  await ctx.close();
}

// ---- Public pages never expose what they should not
{
  const { ctx, page } = await newVisitor();
  const bodies = [];
  page.on('response', async (r) => { if (/\/api\/(ask|plan|split|recap)-links\/|\/api\/circle-invites\//.test(r.url()) && r.request().method() === 'GET') bodies.push(await r.text().catch(() => '')); });
  for (const p of [`/a/${T.ask}`, `/p/${T.plan}`, `/s/${T.split}`, `/r/${T.recapPact}`, `/app/c/${T.circle}`]) { await page.goto(`${BASE}${p}`, { waitUntil: 'load' }); await page.waitForTimeout(900); }
  const all = bodies.join('\n');
  ok('public responses carry no email, phone number or last name', !/@[\w-]+\.\w+|\b0?[789][01]\d{8}\b|Okafor|Adeyemi|Martins|Bello/.test(all));
  await ctx.close();
}
console.log(results.every(Boolean) ? 'ALL PASS' : `${results.filter((x) => !x).length} FAILED`);
await browser.close();

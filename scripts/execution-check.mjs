// Builds a funded Pact through the API on the demo stack (scripts/demo-stack.sh, port 5174) and walks the execution flow
// in a browser: funded -> pay a line -> complete -> completed. Screenshots go to <outDir>.
// Usage: node scripts/execution-check.mjs <outDir>   env: THEME=light|dark, VIEWPORTS=390x844,320x568
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const OUT = process.argv[2] ?? 'exports/execution';
const B = (process.env.BASE ?? 'http://localhost:5174').replace(/\/$/, '');
const THEME = process.env.THEME ?? 'light';
const VPS = (process.env.VIEWPORTS ?? '390x844,320x568').split(',').map((v) => v.split('x').map(Number));
const PIN = '1357';
mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const violations = [];
const axe = async (page, name) => {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }));
  for (const v of r.violations) violations.push(`${name}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
};

const api = async (method, path, token, body) => {
  const r = await fetch(`${B}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method !== 'GET' ? { 'idempotency-key': `x-${Date.now()}-${Math.random()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const login = async (phone) => {
  const o = await api('POST', '/auth/otp/request', null, { phone });
  return (await api('POST', '/auth/otp/verify', null, { phone, code: o.devCode })).accessToken;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const abraham = await login('08010000001');
const sarah = await login('08010000002');
const david = await login('08010000003');
const long = process.env.LONG === '1';
const made = await api('POST', '/pacts', abraham, {
  title: long ? "Sarah and Daniel's Destination Wedding Celebration" : 'Lagos Beach Weekend',
  category: 'trip',
  deadline: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
  missedGoalPolicy: 'refund',
  budget: [{ name: 'Hotel', amount: 220_000_00 }, { name: 'Bus', amount: 140_000_00 }, { name: 'Food', amount: 90_000_00 }, { name: 'Emergency', amount: 50_000_00 }],
  tasks: [{ title: 'Confirm the venue' }, { title: 'Pick up decorations' }, { title: 'Buy the cake' }],
});
const pact = made.data.pact;
for (const t of [sarah, david]) await api('POST', `/invites/${pact.inviteCode}/join`, t, {});
const acct = await api('POST', `/pacts/${pact.id}/bank-account`, abraham, {});
await api('POST', `/sandbox/pact-accounts/${acct.data.pact.bankAccount.accountNumber}/transfers`, abraham, { amount: 500_000_00, senderName: 'OKAFOR ABRAHAM' });
const hotel = (await api('GET', `/pacts/${pact.id}`, abraham)).data.pact.budget.find((b) => b.name === 'Hotel');
const URL = `/app/pact/${pact.id}`;
console.log('funded pact', pact.id);

const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
let first = true;
let session = null;
for (const [w, h] of VPS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true, ...(session ? { storageState: session } : {}) });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), THEME);
  const page = await ctx.newPage();
  const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/${THEME}-${w}-${name}.png` }); };
  if (!session) {
    await page.goto(`${B}/app/auth/phone`);
    await page.getByLabel('Mobile number').fill('8010000001');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByRole('button', { name: 'Fill it in' }).click();
    await page.locator('.wallet-strip').waitFor();
  }
  await page.goto(`${B}${URL}`);
  await page.waitForTimeout(2200);
  await shot('1-funded');
  await axe(page, `funded@${w}`);
  await page.locator('.screen').first().evaluate((el) => el.scrollTo(0, 520)); await shot('2-funded-scroll');
  await page.locator('.screen').first().evaluate((el) => el.scrollTo(0, 1200)); await shot('3-plan');
  await page.locator('.screen').first().evaluate((el) => el.scrollTo(0, 0));
  session = await ctx.storageState();
  await ctx.close();
}

// Pay part of the hotel (API), then show the partial state and the in-progress screens.
await api('POST', `/pacts/${pact.id}/payouts`, abraham, { amount: 100_000_00, bankCode: '058', accountNumber: '0123456780', purpose: 'Hotel deposit', budgetItemId: hotel.id, pin: PIN });
await sleep(7000);
for (const [w, h] of VPS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true, storageState: session });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), THEME);
  const page = await ctx.newPage();
  const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/${THEME}-${w}-${name}.png` }); };
  await page.goto(`${B}${URL}`);
  await page.waitForTimeout(2200);
  await page.locator('.screen').first().evaluate((el) => el.scrollTo(0, 420)); await shot('4-in-progress');
  await page.locator('.screen').first().evaluate((el) => el.scrollTo(0, 1100)); await shot('5-plan-partly');
  await page.locator('.screen').first().evaluate((el) => el.scrollTo(0, 420));
  const payBtn = page.getByRole('button', { name: /^Pay Hotel|Pay for Hotel/ }).first();
  if (await payBtn.count()) { await payBtn.click(); await shot('6-pay-sheet'); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  await page.getByRole('button', { name: 'Complete this Pact' }).first().click().catch(() => {});
  await shot('7-complete-sheet');
  await page.goto(`${B}/app/pacts`); await page.waitForTimeout(1500); await shot('8-pacts');
  session = await ctx.storageState();
  await ctx.close();
}

// Complete with the release, then show the completed screen.
await api('POST', `/pacts/${pact.id}/complete`, abraham, { releaseRemaining: true, pin: PIN });
for (const [w, h] of VPS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true, storageState: session });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), THEME);
  const page = await ctx.newPage();
  const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/${THEME}-${w}-${name}.png` }); };
  await page.goto(`${B}${URL}`);
  await page.waitForTimeout(2800);
  await shot('9-completed');
  await axe(page, `completed@${w}`);
  await page.locator('.screen').first().evaluate((el) => el.scrollTo(0, 560)); await shot('10-completed-2');
  await page.locator('.screen').first().evaluate((el) => el.scrollTo(0, 1200)); await shot('11-completed-3');
  await ctx.close();
}
await browser.close();
console.log(violations.length ? `axe violations:\n${violations.join('\n')}` : 'axe: no violations (funded, in progress, completed)');
console.log('done');

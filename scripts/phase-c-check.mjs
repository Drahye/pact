// Behaviour checks for the phase C screens: settling a share, answering an Ask, answering a Plan, the Circle's sections.
// Usage: node scripts/phase-c-check.mjs [base]   (fresh demo stack + home-fixture + phase-c-fixture first)
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const BASE = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const ids = JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8'));
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const results = [];
const check = (name, ok, detail = '') => (results.push(ok), console.log(ok ? '✓' : '✗', name, detail));
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
await page.getByLabel('Mobile number').fill('8010000001');
await page.getByRole('button', { name: 'Send code' }).click();
await page.getByRole('button', { name: 'Fill it in' }).click();
await page.locator('.home__header').waitFor({ timeout: 15000 });

// Circle: sections in order, earlier things folded away
await page.goto(`${BASE}/app/circles/${ids.boys}`, { waitUntil: 'load' });
await page.locator('.ch').waitFor();
const heads = await page.locator('.screen-section > .section-heading h2, .screen-section > div h2').allInnerTexts();
check('Circle shows Current, then Upcoming', heads.indexOf('Current') >= 0 && heads.indexOf('Upcoming') > heads.indexOf('Current'), JSON.stringify(heads));
check('settled and closed things are folded under Earlier', (await page.locator('details.ch-earlier').count()) === 1);
check('a signal says what is waiting on me', /need you|Nothing waiting/.test(await page.locator('.ch__signal').innerText()));
check('Circle objects have their own shapes', (await page.locator('.or-ask').count()) > 0 && (await page.locator('.or-split').count()) > 0 && (await page.locator('.or-plan').count()) > 0);

// Ask: answer, selected immediately, count moves
await page.goto(`${BASE}/app/asks/${ids.askOpen}`, { waitUntil: 'load' });
await page.getByRole('radio', { name: /Dec 18/ }).waitFor();
await page.getByRole('radio', { name: /Dec 18/ }).click();
await page.waitForTimeout(500);
check('Ask: the chosen option is selected', (await page.getByRole('radio', { name: /Dec 18/ }).getAttribute('aria-checked')) === 'true');
check('Ask: the group’s lead is said out loud', (await page.locator('.ask__reward').count()) === 1);

// Plan: change the answer in one tap, the heading follows
await page.goto(`${BASE}/app/plans/${ids.planOpen}`, { waitUntil: 'load' });
await page.getByRole('radio', { name: 'Maybe' }).click();
await page.waitForTimeout(600);
check('Plan: one tap changes the answer', /maybe/i.test(await page.locator('#rsvp-h').innerText()));
check('Plan: the date leads the hero', (await page.locator('.plan-hero__date').count()) === 1);
await page.goto(`${BASE}/app/plans/${ids.planConverted}`, { waitUntil: 'load' });
await page.locator('.plan-hero').waitFor();
check('Converted Plan: points to the Pact and stops offering edits', (await page.locator('.plan-pact.is-done').count()) === 1 && (await page.getByText('Ask the group').count()) === 0 && (await page.locator('.plan-add').count()) === 0);

// Split: settling a share
await page.goto(`${BASE}/app/splits/${ids.splitOpen}`, { waitUntil: 'load' });
await page.locator('.split-hero').waitFor();
const before = await page.locator('.split-bar i.is-on').count();
await page.getByRole('button', { name: /Mark Tolu/ }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Mark settled' }).click();
await page.locator('.split-row.is-fresh').waitFor({ timeout: 6000 });
check('Split: the settled row is highlighted for a moment', true);
check('Split: the bar fills one more segment', (await page.locator('.split-bar i.is-on').count()) === before + 1);
await page.getByRole('button', { name: /Mark David/ }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Mark settled' }).click();
await page.locator('.done').waitFor({ timeout: 6000 });
check('Split: fully settled becomes a completion moment with faces', (await page.locator('.done .avatar').count()) >= 3);

// Reduced motion and overflow at 320
const small = await browser.newContext({ viewport: { width: 320, height: 700 }, reducedMotion: 'reduce', storageState: await ctx.storageState() });
const p2 = await small.newPage();
for (const path of [`/app/circles/${ids.boys}`, `/app/asks/${ids.askOpen}`, `/app/plans/${ids.planOpen}`, `/app/splits/${ids.splitOpen}`]) {
  await p2.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await p2.waitForTimeout(900);
  const over = await p2.evaluate(() => { const el = document.querySelector('.screen'); return el ? el.scrollWidth - el.clientWidth : 0; });
  check(`320px: no horizontal overflow on ${path.split('/')[2]}`, over <= 0, `(${over}px)`);
}
check('no page errors', errors.length === 0, errors[0] ?? '');
await browser.close();
console.log(results.every(Boolean) ? 'all phase C checks passed' : 'SOME CHECKS FAILED');
process.exit(results.every(Boolean) ? 0 : 1);

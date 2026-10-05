// Phase E: signed-out share pages. Each leads with a person, shows the thing, keeps one clear action and keeps the way back.
// Usage: node scripts/phase-e-check.mjs [base]   (fresh demo stack + home-fixture + phase-e-fixture first)
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const BASE = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const t = JSON.parse(readFileSync('/tmp/phase-e-tokens.json', 'utf8'));
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const results = [];
const check = (name, ok, detail = '') => (results.push(ok), console.log(ok ? '✓' : '✗', name, detail));
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const returnTo = () => page.evaluate(() => sessionStorage.getItem('pact.returnTo'));

// Ask
await page.goto(`${BASE}/a/${t.ask}`, { waitUntil: 'load' });
await page.locator('.sh__from').waitFor();
check('Ask: introduced by the person who asked', /David/.test(await page.locator('.sh__from').innerText()));
await page.getByRole('radio', { name: /Nov 14/ }).first().waitFor({ timeout: 8000 }).catch(() => undefined);
check('Ask: the answer can be chosen before signing in', (await page.getByRole('radio', { name: /Nov 14/ }).count()) === 1, String(await page.getByRole('radio').count()));
await page.getByRole('radio', { name: /Nov 14/ }).click();
await page.getByRole('dialog').waitFor();
await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
await page.waitForURL(/\/app\/auth\/start/);
check('Ask: sign-in goes to the way in, and remembers the link', (await returnTo()) === `/a/${t.ask}`, String(await returnTo()));

// Plan
await page.evaluate(() => sessionStorage.clear());
await page.goto(`${BASE}/p/${t.plan}`, { waitUntil: 'load' });
await page.locator('.plan-hero').waitFor();
check('Plan: the date leads, with who is going', (await page.locator('.plan-hero__date').count()) === 1 && /in/.test(await page.locator('.plan-hero__going').innerText()));
await page.getByRole('radio', { name: 'I’m in' }).click();
await page.getByRole('dialog').waitFor();
await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
await page.waitForURL(/\/app\/auth\/start/);
check('Plan: the way back is remembered', (await returnTo()) === `/p/${t.plan}`, String(await returnTo()));

// Split
await page.evaluate(() => sessionStorage.clear());
await page.goto(`${BASE}/s/${t.split}`, { waitUntil: 'load' });
await page.locator('.split-hero').waitFor();
check('Split: amount, payer and progress before anything is asked', (await page.locator('.split-hero__total').count()) === 1 && (await page.locator('.split-bar i').count()) >= 2 && /Sarah/.test(await page.locator('.sh__from').innerText()), `${await page.locator('.split-bar i').count()} segments`);
await page.getByRole('button', { name: 'See my share' }).click();
await page.waitForURL(/\/app\/auth\/start/);
check('Split: the way back is remembered', (await returnTo()) === `/s/${t.split}`, String(await returnTo()));

// Circle invite
await page.evaluate(() => sessionStorage.clear());
await page.goto(`${BASE}/app/c/${t.circle}`, { waitUntil: 'load' });
await page.locator('.ci__card').waitFor();
const inviteText = await page.locator('.ci').innerText();
check('Circle invite: the inviter, the Circle, and what happens there', /Abraham/.test(inviteText) && /5 people/.test(inviteText) && (await page.locator('.ci__does li').count()) === 3);
check('Circle invite: no stale phone-number wording', !/phone number/.test(inviteText));
await page.getByRole('button', { name: /Join The Boys/ }).click();
await page.waitForURL(/\/app\/auth\/start/);
check('Circle invite: the way back is remembered', (await returnTo()) === `/app/c/${t.circle}`, String(await returnTo()));

// Recap: no names, one clear next step
await page.goto(`${BASE}/r/${t.recap}`, { waitUntil: 'load' });
await page.locator('.recap').waitFor();
const recap = await page.locator('main, body').first().innerText();
check('Recap: celebratory, with no people named', /made it happen/i.test(recap) && !/Abraham|Sarah|David|Maya/.test(recap));
check('Recap: a clear next step', (await page.getByRole('link', { name: /Start something with your people/ }).count()) === 1);

// 320px, reduced motion: no horizontal overflow on any of them
const small = await browser.newContext({ viewport: { width: 320, height: 700 }, reducedMotion: 'reduce' });
const p2 = await small.newPage();
for (const [name, path] of [['ask', `/a/${t.ask}`], ['plan', `/p/${t.plan}`], ['split', `/s/${t.split}`], ['circle invite', `/app/c/${t.circle}`], ['recap', `/r/${t.recap}`], ['pact invite', `/app/join/${t.pactCode}`]]) {
  await p2.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await p2.waitForTimeout(900);
  const over = await p2.evaluate(() => { const el = document.querySelector('.screen'); return el ? el.scrollWidth - el.clientWidth : document.documentElement.scrollWidth - innerWidth; });
  check(`320px: no horizontal overflow on ${name}`, over <= 0, `(${over}px)`);
}
check('no page errors', errors.length === 0, errors[0] ?? '');
await browser.close();
console.log(results.every(Boolean) ? 'all phase E checks passed' : 'SOME CHECKS FAILED');
process.exit(results.every(Boolean) ? 0 : 1);

// Phase D: the create sheet's morph out of the + button, and the lighter create flows end to end, with screenshots.
// Usage: node scripts/phase-d-check.mjs <outDir> [base]   (fresh demo stack + home-fixture first)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'exports/phase-d';
const BASE = (process.argv[3] ?? 'http://localhost:5174').replace(/\/$/, '');
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const results = [];
const check = (name, ok, detail = '') => (results.push(ok), console.log(ok ? '✓' : '✗', name, detail));

async function signIn(page) {
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await page.getByLabel('Mobile number').fill('8010000001');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
  await page.locator('.home__header').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
}

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await signIn(page);

/* ---- the morph ---- */
const create = page.getByRole('button', { name: 'Create' });
await create.click();
await page.waitForTimeout(30);
const early = await page.evaluate(() => { const p = document.querySelector('.csheet__panel'); return p ? getComputedStyle(p).clipPath : null; });
// Scrub the animation by hand so each frame is exactly where it should be, whatever the screenshot latency.
for (const t of [0, 90, 170, 250]) {
  await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), t);
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${out}/morph-${String(t).padStart(3, '0')}ms.png` });
}
await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
await page.waitForTimeout(700);
const late = await page.evaluate(() => { const p = document.querySelector('.csheet__panel'); return p ? getComputedStyle(p).clipPath : null; });
await page.screenshot({ path: `${out}/create-sheet.png` });
check('the sheet starts clipped to a small shape (the button)', !!early && /^inset\(/.test(early) && !/inset\(0px 0px 0px 0px/.test(early), early ?? 'none');
check('and settles to an ordinary, unclipped sheet', late === 'none', String(late));
check('four kinds, each with its own tint', (await page.locator('.create-sheet__option').count()) === 4 && (await page.locator('.create-sheet__option.tint--sky, .create-sheet__option.tint--sun, .create-sheet__option.tint--lilac, .create-sheet__option.tint--mint').count()) === 4);
check('the button reports it opened the dialog', (await create.getAttribute('aria-expanded')) === 'true');
check('focus moved into the sheet', await page.evaluate(() => !!document.activeElement?.closest('.csheet__panel')));
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
check('it is still there while it folds back into the button', (await page.locator('.csheet__panel').count()) === 1);
await page.waitForTimeout(450);
check('Escape closes it', (await page.locator('.csheet__panel').count()) === 0 && (await create.getAttribute('aria-expanded')) === 'false');
check('focus returns to the button', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Create'));

/* ---- Ask: two steps for who's in, three for a choice ---- */
await create.click();
await page.getByRole('button', { name: /Ask the group/ }).click();
await page.locator('.cf__kind').waitFor();
check('Ask flow shows its kind and a progress track', /New ask/i.test(await page.locator('.cf__kind').innerText()) && (await page.locator('.cf__progress li').count()) >= 2);
await page.getByLabel('Your question').fill('Who’s free this weekend?');
check('the words of the question pick "Who’s in?" by default', (await page.getByRole('radio', { name: /Who’s in/ }).getAttribute('aria-checked')) === 'true');
check('which makes it a shorter flow (no options step)', (await page.locator('.cf__progress li').count()) === 2);
await page.getByRole('radio', { name: /Pick one/ }).click();
check('and the person can override it', (await page.getByRole('radio', { name: /Pick one/ }).getAttribute('aria-checked')) === 'true' && (await page.locator('.cf__progress li').count()) === 3);
await page.screenshot({ path: `${out}/ask-1-question.png` });
await page.getByRole('button', { name: 'Next' }).click();
await page.getByLabel('Option 1').fill('Saturday');
await page.getByLabel('Option 2').fill('Sunday');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/ask-2-options.png` });
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('radio', { name: /The Boys/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ask-3-circle.png` });
await page.getByRole('button', { name: 'Create and share' }).click();
await page.waitForURL(/\/app\/asks\/[0-9a-f-]{36}/, { timeout: 8000 });
check('the Ask is created and opens', true);

/* ---- Plan: title, then when and where together ---- */
await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Create' }).click();
await page.getByRole('button', { name: /Make a plan/ }).click();
await page.getByLabel('Plan name').fill('Beach day');
await page.screenshot({ path: `${out}/plan-1-title.png` });
await page.getByRole('button', { name: 'Next' }).click();
await page.getByLabel('Where').fill('Landmark');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/plan-2-when.png` });
check('Plan: when, where and budget are one optional step', (await page.getByLabel('Starts').count()) === 1 && (await page.getByLabel('Where').count()) === 1 && (await page.getByText('Add a rough budget').count()) === 1);
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('radio', { name: /The Boys/ }).click();
await page.getByRole('button', { name: 'Create plan' }).click();
await page.waitForURL(/\/app\/plans\/[0-9a-f-]{36}/, { timeout: 8000 });
check('the Plan is created and opens', true);

/* ---- Split: what and how much together ---- */
await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Create' }).click();
await page.getByRole('button', { name: /Split an expense/ }).click();
await page.getByLabel('What was it for?').fill('Taxi');
await page.getByLabel('Total amount').fill('12000');
await page.screenshot({ path: `${out}/split-1-what.png` });
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('radio', { name: /The Boys/ }).click();
await page.getByRole('button', { name: 'Next' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/split-2-who.png` });
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Create split' }).click();
await page.waitForURL(/\/app\/splits\/[0-9a-f-]{36}/, { timeout: 8000 });
check('the Split is created and opens', true);

/* ---- Reduced motion: no clip, a plain fade ---- */
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', storageState: await ctx.storageState() });
const p2 = await rm.newPage();
await p2.goto(`${BASE}/app/home`, { waitUntil: 'load' });
await p2.getByRole('button', { name: 'Create' }).click();
await p2.waitForTimeout(30);
const rmClip = await p2.evaluate(() => getComputedStyle(document.querySelector('.csheet__panel')).clipPath);
check('reduced motion: no clip morph, only a fade', rmClip === 'none', rmClip);
await p2.keyboard.press('Escape');
await p2.waitForTimeout(300);
check('reduced motion: it still closes', (await p2.locator('.csheet__panel').count()) === 0);
check('no page errors', errors.length === 0, errors[0] ?? '');
await browser.close();
console.log(results.every(Boolean) ? 'all phase D checks passed' : 'SOME CHECKS FAILED');
process.exit(results.every(Boolean) ? 0 : 1);

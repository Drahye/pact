// Release QA: real journeys through the UI in dark mode with prefers-reduced-motion: reduce, fresh sign-in through the phone fallback.
// Usage: node scripts/qa-journeys.mjs [outDir] [--scheme=dark|light] [--motion=reduce|no-preference]  (after scripts/detail-up.sh)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'exports/qa/journeys';
const flag = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const scheme = flag('scheme', 'dark'), motion = flag('motion', 'reduce'), phone = flag('phone', '8010000002');
mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:5174';
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const useState = process.argv.includes('--state');
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, reducedMotion: motion, ...(useState ? { storageState: '/tmp/detail-state.json' } : {}) });
await ctx.addInitScript((t) => { try { localStorage.setItem('pact.theme', t); } catch {} }, scheme);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 160)));
let fails = 0;
const ok = (name, pass, extra = '') => { if (!pass) fails++; console.log(pass ? '  ok  ' : ' FAIL ', name, extra); };
const snap = (n) => page.screenshot({ path: `${out}/${scheme}-${motion}-${n}.png` });

// Phone fallback sign-in, existing account.
if (useState) await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
else {
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
}
await page.locator('.home__header').waitFor({ timeout: 20000 });
ok('phone sign-in lands on Home for the existing account', /\/app\/home/.test(page.url()));
const theme = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok('dark theme is applied and not pure black', scheme !== 'dark' || (theme !== 'rgb(0, 0, 0)' && theme !== 'rgb(246, 244, 239)'), theme);
await snap('home');

// The + morph with reduced motion: the sheet is simply there, unclipped, focused.
const create = page.getByRole('button', { name: 'Create' });
await create.click();
await page.waitForTimeout(120);
const clip = await page.evaluate(() => { const p = document.querySelector('.csheet__panel'); return p ? getComputedStyle(p).clipPath : 'missing'; });
ok('create sheet is open and unclipped straight away', clip === 'none', clip);
ok('four kinds are offered', (await page.locator('.create-sheet__option').count()) === 4);
await snap('create-sheet');
// Ask through the real create flow.
await page.locator('.create-sheet__option', { hasText: 'Ask' }).first().click();
await page.locator('.cf__kind').waitFor();
await page.getByLabel('Your question').fill('Where do we eat on Friday?');
await page.getByRole('radio', { name: /Pick one/ }).click();
await page.getByRole('button', { name: 'Next' }).click();
await page.getByLabel('Option 1').fill('Suya spot');
await page.getByLabel('Option 2').fill('Yellow Chilli');
await snap('ask-options');
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('heading', { name: 'Which Circle?' }).waitFor();
await page.getByRole('radio').first().click();
await snap('ask-step3');
await page.getByRole('button', { name: 'Ask the group' }).click();
await page.waitForURL(/\/app\/asks\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {});
ok('a new Ask was created and opened', /\/app\/asks\/[0-9a-f-]{36}/.test(page.url()), page.url().replace(BASE, ''));
await snap('ask-created');

// Vote.
await page.goto(`${BASE}/app/asks/${ids.askOpen}`, { waitUntil: 'load' });
await page.getByRole('radio').first().waitFor();
await page.getByRole('radio').first().click();
await page.waitForTimeout(600);
ok('vote: selected', (await page.getByRole('radio').first().getAttribute('aria-checked')) === 'true');
await snap('ask-voted');
// RSVP.
await page.goto(`${BASE}/app/plans/${ids.planOpen}`, { waitUntil: 'load' });
await page.getByRole('radio', { name: 'Maybe' }).waitFor();
await page.getByRole('radio', { name: 'Maybe' }).click();
await page.waitForTimeout(600);
ok('RSVP: Maybe selected', (await page.getByRole('radio', { name: 'Maybe' }).getAttribute('aria-checked')) === 'true');
await snap('plan-rsvp');
// Settlement through the confirm sheet.
await page.goto(`${BASE}/app/splits/${ids.splitPartial}`, { waitUntil: 'load' });
const mark = page.getByRole('button', { name: /Mark .* as settled/ }).first();
await mark.waitFor();
await mark.click();
await snap('split-confirm');
await page.getByRole('dialog').getByRole('button', { name: 'Mark settled' }).click();
await page.waitForTimeout(800);
ok('settlement recorded', (await page.getByText('Settled').count()) > 0);
await snap('split-settled');
// Completion screen content with no animation.
await page.goto(`${BASE}/app/pact/${ids.pactCompleted}`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const body = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
ok('completed Pact renders its content', /made it happen|completed|Done/i.test(body) && !/Get started/.test(body), body.slice(0, 120));
await snap('pact-completed');
for (const [n, p] of [['circle', `/app/circles/${ids.boys}`], ['activity', '/app/activity'], ['me', '/app/profile'], ['settings', '/app/profile/settings'], ['recap', `/app/recap/pact/${ids.pactCompleted}`], ['wallet', '/app/wallet'], ['banks', '/app/profile/banks'], ['security', '/app/profile/security'], ['notifications', '/app/notifications']]) {
  await page.goto(`${BASE}${p}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const t = (await page.evaluate(() => document.body.innerText)).trim();
  ok(`${n} renders (not blank, not signed out)`, t.length > 40 && !/Get started/.test(t));
  await snap(n);
}
// Shared link signed out, dark.
const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, reducedMotion: motion });
await anon.addInitScript((t) => { try { localStorage.setItem('pact.theme', t); } catch {} }, scheme);
const ap = await anon.newPage();
for (const [n, p] of [['share-ask', `/a/${ids.tokens.ask}`], ['share-plan', `/p/${ids.tokens.plan}`], ['share-split', `/s/${ids.tokens.split}`], ['share-circle', `/app/c/${ids.tokens.circle}`], ['auth-start', '/app/auth/start'], ['auth-signin', '/app/auth/signin']]) {
  await ap.goto(`${BASE}${p}`, { waitUntil: 'load' });
  await ap.waitForTimeout(1500);
  const bg = await ap.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = scheme === 'dark' && /^\/app\//.test(p);
  ok(`${n} renders; ${dark ? 'dark and ' : ''}background not pure black/white`, (await ap.evaluate(() => document.body.innerText.length)) > 40 && !['rgb(0, 0, 0)', 'rgb(255, 255, 255)'].includes(bg) && (!dark || bg !== 'rgb(246, 244, 239)'), `${bg} (${p.split('/')[1]})`);
  await ap.screenshot({ path: `${out}/${scheme}-${motion}-${n}.png` });
}
ok('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);

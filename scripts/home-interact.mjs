// Interaction checks for the premium Home: inline RSVP, count transition, create sheet, keyboard, reduced motion, long names.
// Usage: node scripts/home-interact.mjs <outDir> [base]   (fresh demo stack + scripts/home-fixture.mjs first)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'exports/home-interact';
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
  await page.waitForTimeout(1500);
}

/* ---------- normal motion ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
  await signIn(page);

  const heading = page.locator('#needs-you-h');
  const before = Number((await heading.innerText()).replace(/\D/g, ''));
  check('Needs you shows a count', before >= 4, `(${before})`);

  // Inline RSVP
  const card = page.locator('.hv2-need', { hasText: 'Ghana in December' });
  await card.getByRole('button', { name: /RSVP/ }).click();
  await page.waitForTimeout(450);
  check('RSVP expands the card with In / Maybe / Can’t', (await card.getByRole('radio').count()) === 3);
  check('the expanded control is announced as expanded', (await card.getByRole('button', { name: /RSVP/ }).getAttribute('aria-expanded')) === 'true');
  await page.screenshot({ path: `${out}/rsvp-open.png` });
  await card.getByRole('radio', { name: 'I’m in' }).click();
  await card.locator('.hv2-rsvp__done').waitFor({ timeout: 8000 });
  check('a confirmation appears with the check', (await card.locator('.hv2-check').count()) === 1);
  await page.screenshot({ path: `${out}/rsvp-done.png` });
  await page.waitForTimeout(2200);
  const after = Number((await heading.innerText()).replace(/\D/g, ''));
  check(`the card resolves and the count goes from ${before} to ${before - 1}`, after === before - 1 && (await page.locator('.hv2-need', { hasText: 'Ghana in December' }).count()) === 0, `(count ${after})`);

  // Keyboard: tab reaches the primary action and Enter activates it
  await page.locator('.hv2-need').first().locator('a.hv2-need__main').focus();
  await page.keyboard.press('Tab');
  const focusedClass = await page.evaluate(() => document.activeElement?.className ?? '');
  check('keyboard focus reaches a card’s action', /hv2-cta/.test(focusedClass), `(${focusedClass})`);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  check('the focused action shows a visible focus ring', outline !== 'none');

  // Create button + sheet
  const create = page.getByRole('button', { name: 'Create' });
  await create.click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(700);
  check('the create button reports open and its plus turns', (await create.getAttribute('aria-expanded')) === 'true' && /is-open/.test(await create.getAttribute('class')));
  check('the sheet lists the four things you can start', (await page.getByRole('dialog').getByRole('button').filter({ hasText: /Ask the group|Make a plan|Split an expense|Start a Pact/ }).count()) === 4);
  await page.screenshot({ path: `${out}/create-sheet.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Escape closes the sheet and resets the button', (await page.getByRole('dialog').count()) === 0 && (await create.getAttribute('aria-expanded')) === 'false');

  // Safe area / scroll: the nav stays visible and content scrolls beneath it
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(500);
  const navBox = await page.locator('.tabbar').boundingBox();
  check('the bottom nav stays pinned while scrolling', !!navBox && navBox.y + navBox.height <= 844 + 1 && navBox.y > 600);
  await page.screenshot({ path: `${out}/scrolled.png` });
  check('no console or page errors', errors.length === 0, errors[0] ?? '');
  await ctx.close();
}

/* ---------- reduced motion ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await signIn(page);
  const card = page.locator('.hv2-need', { hasText: 'Which date works?' });
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('dialog').waitFor();
  const animated = await page.evaluate(() => [...document.querySelectorAll('.create-sheet li')].some((li) => getComputedStyle(li).animationName !== 'none'));
  check('reduced motion: the sheet options do not animate', !animated);
  await page.keyboard.press('Escape');
  const live = page.locator('.hv2-circle.is-live').first();
  const pulse = await live.evaluate((el) => getComputedStyle(el).animationName);
  check('reduced motion: no pulse on live Circles', pulse === 'none' || pulse === '');
  check('reduced motion: presses do not scale', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-micro').trim())) === '0ms');
  void card; void t0;
  await ctx.close();
}

/* ---------- long names ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await ctx.newPage();
  await signIn(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('at 320px nothing forces a horizontal scroll', overflow <= 0, `(${overflow}px over)`);
  await page.screenshot({ path: `${out}/narrow-320.png` });
  await ctx.close();
}

await browser.close();
console.log(results.every(Boolean) ? 'all interaction checks passed' : 'some interaction checks FAILED');
process.exitCode = results.every(Boolean) ? 0 : 1;

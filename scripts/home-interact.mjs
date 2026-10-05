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

  // First screen (390 x 844): personal, social, something may need me
  const needsTop = (await heading.boundingBox()).y;
  check('Needs you begins early on the first screen', needsTop < 300, `(${Math.round(needsTop)}px from the top)`);
  const orderOk = await page.evaluate(() => { const ids = ['needs-you-h', 'hv2-circles-h', 'hv2-soon-h', 'hv2-recent-h', 'hv2-recap-h'].map((id) => document.getElementById(id)).filter(Boolean); return ids.every((el, i) => i === 0 || (ids[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)); });
  check('sections run Needs you, Circles, Coming up, Recent, Made it happen', orderOk);
  const prompt = await page.locator('.strip').first().boundingBox();
  check('prompts sit below what needs you, not above it', !prompt || prompt.y > needsTop);
  check('no old card families are left on Home', (await page.locator('.nd-plan, .nd-ask, .nd-split, .nd-pact, .hv3-task, .hv3-object, .hv3-circle, .hv2-need').count()) === 0);
  check('each kind of thing is its own object', (await page.locator('.ox-plan, .ox-ask, .ox-split, .ox-pact').count()) >= 3);

  // Inline RSVP: the pill moves, the card holds a beat, then leaves
  const card = page.locator('.ox-plan', { hasText: 'Ghana in December' });
  check('the RSVP is right there, no extra tap', (await card.getByRole('radio').count()) === 3);
  await page.screenshot({ path: `${out}/rsvp-open.png` });
  await card.getByRole('radio', { name: 'I’m in' }).click();
  await page.waitForTimeout(450);
  check('the answer is selected at once and the pill follows', (await card.getByRole('radio', { name: 'I’m in' }).getAttribute('aria-checked')) === 'true' && (await card.locator('.ox-rsvp__pill').count()) === 1);
  await page.screenshot({ path: `${out}/rsvp-done.png` });
  await page.waitForTimeout(2200);
  const after = Number((await heading.innerText()).replace(/\D/g, ''));
  check(`the card resolves and the count goes from ${before} to ${before - 1}`, after === before - 1 && (await page.locator('.ox-plan', { hasText: 'Ghana in December' }).count()) === 0, `(count ${after})`);

  const more = page.getByRole('button', { name: /Show \d+ more/ });
  if (await more.count()) await more.click();
  await page.waitForTimeout(400);

  // Inline vote on an Ask: counted at once, the card holds a beat, then leaves
  const ask = page.locator('.ox-ask', { hasText: 'Which date works?' });
  const before20 = Number((await ask.getByRole('radio', { name: /Dec 20/ }).locator('.ox-opt__n').innerText()).trim());
  await ask.getByRole('radio', { name: /Dec 18/ }).click();
  await page.waitForTimeout(450);
  check('the vote is selected immediately', (await ask.getByRole('radio', { name: /Dec 18/ }).getAttribute('aria-checked')) === 'true');
  check('the card says it was counted', /Counted/.test(await ask.innerText()));
  check('the other options stay unchanged', Number((await ask.getByRole('radio', { name: /Dec 20/ }).locator('.ox-opt__n').innerText()).trim()) === before20);
  await page.screenshot({ path: `${out}/ask-counted.png` });
  await page.waitForTimeout(2200);
  check('the answered Ask leaves Needs you after a beat', (await page.locator('.ox-ask', { hasText: 'Which date works?' }).count()) === 0);

  // Keyboard: the object's own control is reachable and shows a focus ring
  await page.locator('.ox-plan').first().locator('a.ox-plan__top').focus();
  await page.keyboard.press('Tab');
  const focusedClass = await page.evaluate(() => document.activeElement?.className ?? '');
  check('keyboard focus reaches an object’s control', /ox-rsvp__btn|act/.test(focusedClass), `(${focusedClass})`);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  check('the focused control shows a visible focus ring', outline !== 'none');
  const headings = await page.evaluate(() => [...document.querySelectorAll('.screen__content h1, .screen__content h2')].map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 20)));
  check('one h1, then a heading per section', headings.filter((h) => h.startsWith('H1')).length === 1 && headings.filter((h) => h.startsWith('H2')).length >= 4, JSON.stringify(headings));

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
    await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('dialog').waitFor();
  const animated = await page.evaluate(() => [...document.querySelectorAll('.create-sheet li')].some((li) => getComputedStyle(li).animationName !== 'none'));
  check('reduced motion: the sheet options do not animate', !animated);
  await page.keyboard.press('Escape');
  const live = page.locator('.ox-circle.is-live').first();
  const pulse = await live.evaluate((el) => getComputedStyle(el).animationName);
  check('reduced motion: no pulse on live Circles', pulse === 'none' || pulse === '');
  check('reduced motion: presses do not scale', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-micro').trim())) === '0ms');
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

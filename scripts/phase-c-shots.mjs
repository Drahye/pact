// Phase C screenshots: Circle, Ask, Plan, Split, Pact and the create sheet at 390, 430, 768 and 1440.
// Usage: node scripts/phase-c-shots.mjs <outDir> [base] [widths...]   (demo stack + home-fixture + phase-c-fixture first)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'exports/phase-c';
const BASE = (process.argv[3] ?? 'http://localhost:5174').replace(/\/$/, '');
const widths = process.argv.slice(4).map(Number).filter(Boolean);
const WIDTHS = widths.length ? widths : [390, 430, 768, 1440];
const ids = JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8'));
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});

// Sign in once; every size reuses the session.
const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p0 = await first.newPage();
await p0.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
await p0.getByLabel('Mobile number').fill('8010000001');
await p0.getByRole('button', { name: 'Send code' }).click();
await p0.getByRole('button', { name: 'Fill it in' }).click();
await p0.locator('.home__header').waitFor({ timeout: 15000 });
let state = await first.storageState();
await first.close();

const screens = [
  ['circle', `/app/circles/${ids.boys}`],
  ['ask-unanswered', `/app/asks/${ids.askOpen}`],
  ['ask-answered', `/app/asks/${ids.askAnswered}`],
  ['plan-open', `/app/plans/${ids.planOpen}`],
  ['plan-converted', `/app/plans/${ids.planConverted}`],
  ['split-unsettled', `/app/splits/${ids.splitOpen}`],
  ['split-settled', `/app/splits/${ids.splitSettled}`],
  ['pact-active', `/app/pact/${ids.pactActive}`],
  ['pact-from-plan', `/app/pact/${ids.pactFromPlan}`],
  ['pact-completed-demo', `/app/demo/sarahs_birthday`],
];
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, deviceScaleFactor: width >= 768 ? 1 : 2, storageState: state });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [name, path] of screens) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${width}-${name}.png`, fullPage: true });
    if (width >= 600) {
      // Framed on larger screens: the phone screen scrolls inside, so take a second frame lower down.
      const moved = await page.evaluate(() => { const el = document.querySelector('.screen'); if (!el || el.scrollHeight <= el.clientHeight + 40) return false; el.scrollTop = Math.min(el.scrollHeight, el.clientHeight * 0.85); return true; });
      if (moved) { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${width}-${name}-b.png` }); }
    }
  }
  // The create sheet from the + button
  await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  try {
    await page.getByRole('button', { name: 'Create' }).first().click({ timeout: 8000 });
    await page.getByRole('dialog').waitFor({ timeout: 8000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${width}-create-sheet.png` });
  } catch (e) { console.log('create sheet not captured at', width); }
  console.log('✓', width, errors.length ? `(${errors.length} page errors: ${errors[0]})` : '');
  state = await ctx.storageState();
  await ctx.close();
}
await browser.close();

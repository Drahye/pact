// Phase C detail captures. Usage: node scripts/detail-shots.mjs <outDir> [--w=390,430] [--theme=light,dark] [--only=ask,split] [--full]
// Needs the demo stack + home-fixture + phase-c-fixture (ids in /tmp/phase-c-ids.json, plus /tmp/detail-ids.json from detail-fixture.mjs).
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const out = process.argv[2] ?? 'exports/phase-c';
const BASE = 'http://localhost:5174';
const widths = arg('w', '390').split(',').map(Number);
const themes = arg('theme', 'light').split(',');
const only = arg('only', '').split(',').filter(Boolean);
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...(existsSync('/tmp/detail-ids.json') ? JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) : {}) };
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
// One sign-in per demo stack: the session is kept in /tmp/detail-state.json (delete it, or restart the stack, to sign in again).
let state;
if (existsSync('/tmp/detail-state.json') && process.argv.includes('--reuse')) state = JSON.parse(readFileSync('/tmp/detail-state.json', 'utf8'));
else {
  const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p0 = await first.newPage();
  await p0.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await p0.getByLabel('Mobile number').fill('8010000001');
  await p0.getByRole('button', { name: 'Send code' }).click();
  await p0.getByRole('button', { name: 'Fill it in' }).click();
  await p0.locator('.home__header').waitFor({ timeout: 15000 });
  state = await first.storageState();
  writeFileSync('/tmp/detail-state.json', JSON.stringify(state));
  await first.close();
}
const screens = [
  ['circle', `/app/circles/${ids.boys}`],
  ['circle-quiet', ids.circleQuiet && `/app/circles/${ids.circleQuiet}`],
  ['ask-unanswered', `/app/asks/${ids.askOpen}`],
  ['ask-answered', `/app/asks/${ids.askAnswered}`],
  ['plan-open', `/app/plans/${ids.planOpen}`],
  ['plan-converted', `/app/plans/${ids.planConverted}`],
  ['split-unsettled', `/app/splits/${ids.splitOpen}`],
  ['split-partial', ids.splitPartial && `/app/splits/${ids.splitPartial}`],
  ['split-settled', `/app/splits/${ids.splitSettled}`],
  ['pact-active', `/app/pact/${ids.pactActive}`],
  ['pact-progress', ids.pactProgress && `/app/pact/${ids.pactProgress}`],
  ['pact-completed', ids.pactCompleted && `/app/pact/${ids.pactCompleted}`],
  ['pact-from-plan', `/app/pact/${ids.pactFromPlan}`],
].filter(([n, p]) => p && (!only.length || only.some((o) => n.startsWith(o))));
for (const theme of themes) for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, deviceScaleFactor: width >= 768 ? 1 : 2, colorScheme: theme, storageState: state });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (const [name, path] of screens) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1700);
    const tag = `${out}/${width}-${theme}-${name}`;
    await page.screenshot({ path: `${tag}.png` });
    if (width < 600) {
      // The page scrolls inside .screen, so a tall window is the way to see all of it.
      await page.setViewportSize({ width, height: Number(arg('tall', 2600)) });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${tag}-full.png` });
      await page.setViewportSize({ width, height: 844 });
    }
    if (width >= 600) {
      const moved = await page.evaluate(() => { const el = document.querySelector('.screen'); if (!el || el.scrollHeight <= el.clientHeight + 40) return false; el.scrollTop = el.clientHeight * 0.85; return true; });
      if (moved) { await page.waitForTimeout(500); await page.screenshot({ path: `${tag}-b.png` }); }
    }
  }
  state = await ctx.storageState();
  writeFileSync('/tmp/detail-state.json', JSON.stringify(state));
  console.log('✓', width, theme, errors.length ? `${errors.length} errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}` : 'no errors');
  await ctx.close();
}
await browser.close();

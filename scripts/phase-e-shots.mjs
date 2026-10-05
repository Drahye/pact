// Signed-out share pages at 390, 430, 768 and 1440. Usage: node scripts/phase-e-shots.mjs <outDir> [base] [widths...]
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const out = process.argv[2] ?? 'exports/phase-e';
const BASE = (process.argv[3] ?? 'http://localhost:5174').replace(/\/$/, '');
const widths = process.argv.slice(4).map(Number).filter(Boolean);
const t = JSON.parse(readFileSync('/tmp/phase-e-tokens.json', 'utf8'));
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const pages = [['ask', `/a/${t.ask}`], ['plan', `/p/${t.plan}`], ['split', `/s/${t.split}`], ['circle-invite', `/app/c/${t.circle}`], ['recap', `/r/${t.recap}`], ['pact-invite', `/app/join/${t.pactCode}`]];
for (const width of widths.length ? widths : [390, 430, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, deviceScaleFactor: width >= 768 ? 1 : 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [name, path] of pages) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${width}-${name}.png`, fullPage: width < 600 });
  }
  console.log('✓', width, errors.length ? `(${errors.length} page errors: ${errors[0]})` : '');
  await ctx.close();
}
await browser.close();

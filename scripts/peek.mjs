// Viewport screenshots at scroll targets, motion on. Usage:
// node scripts/peek.mjs <outDir> <width> <path> <target...>   target = number (px) or CSS selector
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const [out, w, path, ...targets] = process.argv.slice(2);
const width = Number(w);
mkdirSync(out, { recursive: true });
// Prefer the lightweight headless shell; fall back to full Chromium, then Playwright's default.
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const full = `${homedir()}/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium`;
const cached = existsSync(shell) ? shell : full;
const browser = await chromium.launch({ ...(existsSync(cached) ? { executablePath: cached } : {}), args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 200)));
console.log('launched');
await page.goto(`http://localhost:5173${path}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1500);
console.log('loaded');
let i = 0;
for (const t of targets.length ? targets : ['0']) {
  const [sel, extra] = t.split('+');
  if (/^\d+$/.test(sel)) {
    // scroll gradually so ScrollTriggers fire in order
    const cur = await page.evaluate(() => scrollY);
    for (let y = cur; y < Number(sel); y += 300) await page.evaluate((yy) => scrollTo(0, yy), y), await page.waitForTimeout(60);
    await page.evaluate((y) => scrollTo(0, y), Number(sel));
  } else {
    const y = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY, sel);
    const cur = await page.evaluate(() => scrollY);
    for (let yy = cur; yy < y; yy += 300) await page.evaluate((v) => scrollTo(0, v), yy), await page.waitForTimeout(60);
    await page.evaluate((v) => scrollTo(0, v), y + Number(extra ?? 0));
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/peek-${width}-${i++}.png` });
}
await browser.close();

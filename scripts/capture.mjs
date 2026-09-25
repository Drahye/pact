// QA + export helper: full-page captures of the site and prototype at each breakpoint.
// Usage: node scripts/capture.mjs [outDir] [--motion]
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { saveHtml } from './lib/html-snapshot.mjs';

const out = process.argv[2] ?? 'exports';
const motion = process.argv.includes('--motion');
const base = process.env.BASE_URL ?? 'http://localhost:5173';
const widths = (process.env.WIDTHS ?? '390,430,768,1024,1280,1440').split(',').map(Number);
mkdirSync(out, { recursive: true });

// Prefer the lightweight headless shell; fall back to full Chromium, then Playwright's default.
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const full = `${homedir()}/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium`;
const cached = existsSync(shell) ? shell : full;
const browser = await chromium.launch(existsSync(cached) ? { executablePath: cached } : {});

const htmlOut = process.env.HTML_OUT;
if (htmlOut) mkdirSync(htmlOut, { recursive: true });
for (const [route, name] of [['/', 'landing'], ['/download', 'download'], ['/styleguide', 'styleguide']])
for (const width of widths) {
  const page = await browser.newPage({
    viewport: { width, height: width < 768 ? 844 : 900 },
    deviceScaleFactor: process.env.CHECK_ONLY || width >= 1024 ? 1 : 2,
    reducedMotion: motion ? 'no-preference' : 'reduce',
  });
  await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  // walk the page so scroll-triggered content settles
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(motion ? 250 : 40);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} → ${Math.round(r.right)}`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, vw, bad: bad.slice(0, 8) };
  });
  console.log(name, width, overflow.scrollWidth === overflow.vw ? 'no overflow' : `OVERFLOW ${overflow.scrollWidth}`);
  // One responsive HTML file per page: its CSS carries every breakpoint.
  if (htmlOut && width === 1440) await saveHtml(page, `${htmlOut}/${name}.html`);
  if (!process.env.CHECK_ONLY) await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true, timeout: 180000 });
  await page.close();
}
await browser.close();

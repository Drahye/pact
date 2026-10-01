// Dark mode check: theme logic (default, persistence, System following the OS, no flash,
// marketing pages stay light) and axe colour-contrast on app screens in both themes.
// Usage: node scripts/theme-check.mjs <phone>   (needs `npm run dev`; signs in as a demo user)
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const phone = process.argv[2] ?? '08010000007';
const BASE = 'http://localhost:5173';
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true, colorScheme: 'dark' });
const page = await context.newPage();
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(ok ? '✓' : '✗', name, ok ? '' : extra);
  if (!ok) failed++;
};
const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
const stored = () => page.evaluate(() => localStorage.getItem('pact.theme'));

// 1. Default is System: dark OS gives dark, before React has rendered.
await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'commit' });
await page.waitForFunction(() => !!document.documentElement.dataset.theme);
check('no stored value: first paint follows a dark OS', (await theme()) === 'dark');
check('nothing written until the person chooses', (await stored()) === null);
check('marketing page stays light on a dark OS', await (async () => { await page.goto(`${BASE}/download`); await page.waitForTimeout(800); return (await theme()) === 'light'; })());

// 2. Sign in.
await page.goto(`${BASE}/app/auth/phone`);
await page.getByText('What’s your number?').waitFor();
await page.waitForTimeout(500);
await page.getByLabel('Mobile number').fill(phone.replace(/^0/, ''));
await page.getByRole('button', { name: 'Send code' }).click();
await page.getByRole('button', { name: 'Fill it in' }).click();
await page.locator('.wallet-strip').waitFor();

// 3. Appearance control.
await page.goto(`${BASE}/app/profile`);
await page.getByRole('radio', { name: 'System' }).waitFor();
check('System is selected by default', (await page.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')) === 'true');
await page.emulateMedia({ colorScheme: 'light' });
await page.waitForTimeout(200);
check('System follows the OS to light immediately', (await theme()) === 'light');
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(200);
check('System follows the OS back to dark immediately', (await theme()) === 'dark');

await page.getByRole('radio', { name: 'Light' }).click();
check('Light overrides a dark OS', (await theme()) === 'light' && (await stored()) === 'light');
await page.reload();
await page.waitForFunction(() => !!document.documentElement.dataset.theme);
check('Light persists across reload', (await theme()) === 'light');
await page.getByRole('radio', { name: 'Dark' }).click();
await page.emulateMedia({ colorScheme: 'light' });
await page.waitForTimeout(200);
check('Dark overrides a light OS', (await theme()) === 'dark' && (await stored()) === 'dark');
await page.reload();
await page.waitForFunction(() => !!document.documentElement.dataset.theme);
check('Dark persists across reload', (await theme()) === 'dark');
await page.evaluate(() => localStorage.setItem('pact.theme', 'bogus'));
await page.reload();
await page.waitForFunction(() => !!document.documentElement.dataset.theme);
check('an invalid stored value falls back to System (light OS here)', (await theme()) === 'light');
await page.evaluate(() => localStorage.removeItem('pact.theme'));

// 4. Contrast in both themes. axe cannot resolve backgrounds under the floating tab bar and page
// transitions, so measure directly: each visible text node's colour against the nearest ancestor
// background (alpha-flattened). Gradients and images are skipped (counted as unmeasured).
const measure = () =>
  page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/) ?? c.match(/color\(srgb ([^)]+)\)/);
      if (!m) return null;
      let p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      if (c.startsWith('color(')) p = [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1];
      return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
    };
    const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const lum = ({ r, g, b }) => {
      const ch = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const bgOf = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== 'none') return null;
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a === 1) break; }
      }
      let base = { r: 255, g: 255, b: 255, a: 1 };
      if (layers.length === 0 || layers[layers.length - 1].a < 1) base = parse(getComputedStyle(document.documentElement).backgroundColor ?? '') ?? base;
      if (base.a === 0) base = parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
      return layers.reverse().reduce((acc, l) => over(l, acc), base);
    };
    const out = [];
    let ok = 0, skipped = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const done = new Set();
    for (let n; (n = walker.nextNode()); ) {
      const el = n.parentElement;
      if (!n.textContent.trim() || done.has(el)) continue;
      done.add(el);
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0 || +cs.opacity === 0) continue;
      if (el.closest('[aria-hidden="true"], .visually-hidden, .skip-link, button:disabled, [disabled], .proto-panel, .is-active')) continue;
      const bg = bgOf(el);
      const fgRaw = parse(cs.color);
      if (!bg || !fgRaw) { skipped++; continue; }
      let eff = 1;
      for (let e = el; e; e = e.parentElement) eff *= +getComputedStyle(e).opacity;
      const fg = over({ ...fgRaw, a: fgRaw.a * eff }, bg);
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < need) out.push(`${(el.className?.baseVal ?? el.className) || el.tagName} "${n.textContent.trim().slice(0, 28)}" ${ratio.toFixed(2)}<${need}`);
      else ok++;
    }
    return { out, ok, skipped };
  });

const routes = ['/app/home', '/app/pacts', '/app/profile', '/app/wallet', '/app/create', '/app/activity', '/app/notifications', '/app/profile/verify', '/app/profile/security', '/app/wallet/topup', '/app/profile/banks', '/app/wallet/withdraw'];
const seen = new Map();
let checked = 0, unmeasured = 0;
const record = (scheme, name, r) => {
  checked += r.ok + r.out.length;
  unmeasured += r.skipped;
  for (const o of r.out) seen.set(`${scheme} ${name} ${o}`, true);
};
for (const scheme of ['light', 'dark']) {
  await page.emulateMedia({ colorScheme: scheme });
  for (const route of routes) {
    await page.goto(`${BASE}${route}`);
    await page.waitForTimeout(1300);
    record(scheme, route, await measure());
  }
  await page.goto(`${BASE}/app/pacts`);
  await page.waitForTimeout(1200);
  await page.locator('a[href*="/app/pact/"]').first().click();
  await page.waitForTimeout(1800);
  for (const y of [0, 700, 1400, 2100, 2800]) {
    await page.locator('.screen').first().evaluate((el, top) => el.scrollTo(0, top), y);
    await page.waitForTimeout(300);
    record(scheme, `detail@${y}`, await measure());
  }
}
check(`contrast: ${checked} text elements measured (${unmeasured} on gradients skipped), ${seen.size} below AA`, seen.size === 0 && checked > 300);
for (const k of seen.keys()) console.log('  ', k);
await browser.close();
process.exit(failed ? 1 : 0);

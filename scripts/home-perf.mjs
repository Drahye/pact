// Home load measurements: layout shift from skeleton to content, how much script the route loads, and long main-thread tasks.
// Usage: node scripts/home-perf.mjs [base]   (demo stack + home-fixture first)
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
const BASE = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p0 = await ctx.newPage();
await p0.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
await p0.getByLabel('Mobile number').fill('8010000001');
await p0.getByRole('button', { name: 'Send code' }).click();
await p0.getByRole('button', { name: 'Fill it in' }).click();
await p0.locator('.home__header').waitFor({ timeout: 15000 });
await p0.close();

for (const [label, slow] of [['normal', false], ['slow 4G + 4x CPU', true]]) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (slow) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.addInitScript(() => {
    window.__cls = 0; window.__shifts = []; window.__long = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: (e.sources ?? []).map((s) => (s.node?.className ?? s.node?.nodeName ?? '').toString().slice(0, 40)) }); } }).observe({ type: 'layout-shift', buffered: true });
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long += e.duration; }).observe({ type: 'longtask', buffered: true }); } catch {}
  });
  await page.goto(`${BASE}/app/home`, { waitUntil: 'commit' });
  await page.locator('#needs-you-h').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => ({
    cls: window.__cls, shifts: window.__shifts, longMs: Math.round(window.__long),
    js: performance.getEntriesByType('resource').filter((e) => /\.(js|tsx?|mjs)(\?|$)/.test(e.name) || e.initiatorType === 'script').length,
    avatars: performance.getEntriesByType('resource').filter((e) => /avatars\//.test(e.name)).length,
    avatarKB: Math.round(performance.getEntriesByType('resource').filter((e) => /avatars\//.test(e.name)).reduce((t, e) => t + (e.transferSize || e.encodedBodySize || 0), 0) / 1024),
    ready: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
  }));
  console.log(`[${label}] layout shift total ${r.cls.toFixed(4)} (${r.shifts.length} shifts), long tasks ${r.longMs}ms, FCP ${r.ready}ms, avatar images ${r.avatars} (${r.avatarKB}KB)`);
  for (const s of r.shifts.slice(0, 5)) console.log('   shift', s.v, 'at', s.t + 'ms', JSON.stringify(s.src));
  await page.close();
}
await browser.close();

// Release QA against the PRODUCTION BUILD (npm run build, then the server with SERVE_STATIC=true on PORT=8790):
// cost of the first load on a slow network (signed out, a shared Ask link, the sign-in screen), what an offline mutation does,
// response headers, and cookie flags. Usage: node scripts/qa-prod.mjs [base]
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
const BASE = (process.argv[2] ?? 'http://localhost:8790').replace(/\/$/, '');
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
let n = 0;
const api = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'idempotency-key': `qa-${Date.now()}-${n++}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) };
};
const o = await api('POST', '/auth/otp/request', null, { phone: '08010000003' });
const v = await api('POST', '/auth/otp/verify', null, { phone: '08010000003', code: o.json.devCode });
const T = v.json.accessToken;
const cid = (await api('POST', '/circles', T, { name: 'QA Circle', emoji: '🧪' })).json.data.id;
const ask = await api('POST', `/circles/${cid}/asks`, T, { title: 'Where do we eat?', type: 'choice', options: ['Suya spot', 'Yellow Chilli'] });
const token = ask.json.data.shareToken ?? (await api('GET', `/asks/${ask.json.data.id}`, T)).json.data.shareToken;
console.log('share token minted:', !!token);

const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const measure = async (label, path, { cpu = 4 } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const reqs = [];
  page.on('response', (r) => reqs.push({ url: r.url().replace(token, '<token>'), status: r.status() }));
  const t0 = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const res = await page.evaluate(() => {
    const e = performance.getEntriesByType('resource');
    const js = e.filter((x) => /\.js(\?|$)/.test(x.name));
    return {
      requests: e.length,
      jsKB: Math.round(js.reduce((t, x) => t + (x.transferSize || 0), 0) / 1024),
      cssKB: Math.round(e.filter((x) => /\.css/.test(x.name)).reduce((t, x) => t + (x.transferSize || 0), 0) / 1024),
      gsap: js.some((x) => /gsap/.test(x.name)),
      totalKB: Math.round(e.reduce((t, x) => t + (x.transferSize || 0), 0) / 1024),
      fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
      title: document.title,
      bodyText: document.body.innerText.slice(0, 80).replace(/\n/g, ' | '),
    };
  });
  console.log(`\n[${label}] ${path.replace(token, '<token>')}  load=${Date.now() - t0}ms`, JSON.stringify(res));
  const bad = reqs.filter((r) => r.status >= 400);
  if (bad.length) console.log('  failed requests:', JSON.stringify(bad));
  await ctx.close();
};
await measure('slow 4G + 4x CPU', '/app');
await measure('slow 4G + 4x CPU', `/a/${token}`);
await measure('slow 4G + 4x CPU', '/app/auth/email');
await measure('slow 4G + 4x CPU', '/');

// Offline: a mutation must not look like it succeeded.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/a/${token}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  const btn = page.getByRole('radio').first();
  const hasChoice = await btn.count();
  if (hasChoice) await btn.click({ force: true }).catch(() => {});
  const submit = page.getByRole('button', { name: /vote|answer|send|continue|submit/i }).first();
  if (await submit.count()) await submit.click({ force: true }).catch(() => {});
  await page.waitForTimeout(2500);
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
  console.log('\n[offline] after choosing + submitting:', text.slice(0, 400));
  console.log('[offline] success wording present:', /saved|thanks|you voted|done/i.test(text), '| error wording present:', /offline|connection|network|try again|couldn/i.test(text));
  await ctx.close();
}

// Headers and cookies.
for (const path of ['/', '/app', `/a/${token}`, '/assets/does-not-exist.js', '/api/config']) {
  const r = await fetch(`${BASE}${path}`);
  const h = Object.fromEntries(r.headers);
  console.log(`\n${path.replace(token, '<token>')} ${r.status}`, JSON.stringify({ csp: (h['content-security-policy'] ?? '').slice(0, 60) + '…', cache: h['cache-control'], robots: h['x-robots-tag'], ref: h['referrer-policy'], xfo: h['x-frame-options'], nosniff: h['x-content-type-options'], hsts: h['strict-transport-security'] }));
}
await browser.close();

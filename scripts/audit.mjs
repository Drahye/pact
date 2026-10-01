// Launch audit: accessibility (axe-core), horizontal overflow at every required width,
// console errors, and broken internal links, across the site and the signed-in app.
// Usage: node scripts/audit.mjs [outFile]   (needs `npm run dev`; signs in as a demo organiser)
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'audit-results.json';
const BASE = (process.env.AUDIT_BASE ?? 'http://localhost:5173').replace(/\/$/, '');
// Staging has no demo data: the audit signs up its own person and Pact through the API (needs STAGING_SHOW_CODES or a dev stack).
const FRESH = process.env.AUDIT_FRESH === '1';
const WIDTHS = [390, 430, 768, 1024, 1280, 1440];
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
// bypassCSP: the audit injects axe-core into the page, which a hardened (staging or production) CSP rightly refuses.
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true });
const page = await context.newPage();
const results = { overflow: [], axe: [], console: [], links: [], routes: [] };
page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && results.console.push({ url: page.url(), text: m.text().slice(0, 200) }));
page.on('pageerror', (e) => results.console.push({ url: page.url(), text: `pageerror: ${e.message}` }));

const sitePages = ['/', '/download', '/terms', '/privacy', '/refunds', '/cookies', '/styleguide'];

async function signIn(phone) {
  await page.goto(`${BASE}/app/auth/phone`);
  await page.getByText('What’s your number?').waitFor();
  await page.waitForTimeout(500);
  await page.getByLabel('Mobile number').fill(phone.replace(/^0/, ''));
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
  await page.locator('.wallet-strip').waitFor();
}

async function checkOverflow(url) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => {
      const docW = document.documentElement.clientWidth;
      const over = document.documentElement.scrollWidth - docW;
      return { over };
    });
    if (o.over > 1) results.overflow.push({ url, width: w, px: o.over });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function runAxe(url) {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) }));
  });
  for (const v of r) results.axe.push({ url, ...v });
}

// Site pages
for (const path of sitePages) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  // Let entrance animations finish: axe measures colours at their current opacity.
  await page.waitForTimeout(8000);
  results.routes.push({ path, status: res?.status() });
  await runAxe(path);
  await checkOverflow(path);
  const links = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
  for (const href of new Set(links)) {
    if (!href || href.startsWith('mailto:') || href.startsWith('http') || href.startsWith('sms:')) continue;
    const [p, hash] = href.split('#');
    if (hash && (p === '' || p === '/')) {
      const exists = await page.evaluate((h) => !!document.getElementById(h), hash);
      if (!exists && path === '/') results.links.push({ from: path, href, problem: 'missing anchor' });
    }
  }
}

// Signed-in app screens
let pactPath;
if (FRESH) {
  const api = async (method, path, token, body) => {
    const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method !== 'GET' ? { 'idempotency-key': `audit-${Date.now()}-${Math.random()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return r.json();
  };
  const phone = `080${String(Date.now()).slice(-8)}`;
  const otp = await api('POST', '/auth/otp/request', null, { phone });
  const v = await api('POST', '/auth/otp/verify', null, { phone, code: otp.devCode });
  const t = await api('POST', '/auth/signup', null, { signupToken: v.signupToken, firstName: 'Audit', lastName: 'Person', pin: '2468' });
  const day = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  const made = await api('POST', '/pacts', t.accessToken, { title: 'Audit Trip', category: 'trip', target: 100000_00, deadline: day, tasks: [{ title: 'Book the flights' }] });
  pactPath = `/app/pact/${made.data.pact.id}`;
  await signIn(phone);
} else {
  await signIn('08010000006');
  await page.goto(`${BASE}/app/pacts`);
  await page.getByText("Sarah's Birthday").first().click();
  await page.locator('.detail__ring').waitFor();
  pactPath = new URL(page.url()).pathname;
}
const appPages = ['/app/home', '/app/pacts', pactPath, `${pactPath}/invite`, `${pactPath}/contribute`, '/app/create', '/app/wallet', '/app/wallet/topup', '/app/wallet/withdraw', '/app/activity', '/app/notifications', '/app/profile', '/app/profile/verify', '/app/profile/security', '/app/profile/banks'];
for (const path of appPages) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  results.routes.push({ path, status: res?.status(), landed: new URL(page.url()).pathname });
  await runAxe(path);
  await checkOverflow(path);
}

// Optional second pass as someone else, e.g. an organiser on a Pact with an account number
// and vendor payments: AUDIT_EXTRA_PHONE=08010000001 AUDIT_EXTRA_PATHS=/app/pact/<id>
if (process.env.AUDIT_EXTRA_PHONE && process.env.AUDIT_EXTRA_PATHS) {
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(process.env.AUDIT_EXTRA_PHONE);
  for (const path of process.env.AUDIT_EXTRA_PATHS.split(',')) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1400);
    results.routes.push({ path, status: res?.status(), landed: new URL(page.url()).pathname });
    await runAxe(path);
    await checkOverflow(path);
  }
}

await browser.close();
writeFileSync(out, JSON.stringify(results, null, 2));
const byRule = {};
for (const v of results.axe) (byRule[`${v.id} (${v.impact})`] ??= []).push(`${v.url} ×${v.nodes}`);
console.log(`routes checked: ${results.routes.length}`);
console.log(`overflow: ${results.overflow.length ? JSON.stringify(results.overflow) : 'none'}`);
console.log(`console errors: ${results.console.length ? JSON.stringify(results.console.slice(0, 8)) : 'none'}`);
console.log(`broken anchors: ${results.links.length ? JSON.stringify(results.links) : 'none'}`);
console.log(`axe violations: ${results.axe.length ? '' : 'none'}`);
for (const [rule, where] of Object.entries(byRule)) console.log(`  ${rule}: ${where.join(', ')}`);

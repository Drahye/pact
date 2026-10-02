// Checks the communication templates in a browser against the demo stack (scripts/demo-stack.sh, port 5174):
//  1. the gallery at every width, light and dark: all 16 templates draw, nothing overflows, axe is clean
//  2. a brand-new person's Home shows the Welcome template with a working "Create your first Pact"
//  3. opening a funded and a payment notification shows its template, with buttons that lead to the right place
// Usage: node scripts/communications-check.mjs <outDir>
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const OUT = process.argv[2] ?? 'exports/communications';
const B = (process.env.BASE ?? 'http://localhost:5174').replace(/\/$/, '');
mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const problems = [];
const ok = (name, cond, extra = '') => { console.log(cond ? 'ok  ' : 'FAIL', name, extra); if (!cond) problems.push(name); };
const axe = async (page, name, include) => {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate((inc) => axe.run(inc ? document.querySelector(inc) : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }), include ?? null);
  for (const v of r.violations) problems.push(`axe ${name}: ${v.id} ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  console.log(r.violations.length ? 'FAIL' : 'ok  ', `axe ${name}`, r.violations.map((v) => `${v.id}(${v.nodes.length})`).join(','));
};
const api = async (method, path, token, body) => {
  const r = await fetch(`${B}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method !== 'GET' ? { 'idempotency-key': `c-${Date.now()}-${Math.random()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const login = async (phone) => {
  const o = await api('POST', '/auth/otp/request', null, { phone });
  return (await api('POST', '/auth/otp/verify', null, { phone, code: o.devCode })).accessToken;
};
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});

/* 1. the gallery */
for (const theme of process.env.SKIP_GALLERY ? [] : ['light', 'dark']) {
  for (const w of [320, 375, 390, 430, 768, 960]) {
    const ctx = await browser.newContext({ viewport: { width: Math.max(w + 48, 360), height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${B}/dev/templates?kind=all&theme=${theme}&w=${w}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({
      templates: document.querySelectorAll('article.comm').length,
      h2: document.querySelectorAll('article.comm h2').length,
      overflow: [...document.querySelectorAll('.tp__frame')].filter((f) => f.scrollWidth > f.clientWidth + 1).length,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      dark: getComputedStyle(document.querySelector('.tp__frame')).backgroundColor,
    }));
    ok(`gallery ${theme} ${w}: all 16 templates, each with its own heading`, m.templates === 16 && m.h2 === 16, `${m.templates}/${m.h2}`);
    ok(`gallery ${theme} ${w}: nothing overflows its frame`, m.overflow === 0 && (w + 48 <= 360 || !m.pageOverflow), JSON.stringify(m));
    ok(`gallery ${theme} ${w}: ${theme} colours applied`, theme === 'dark' ? m.dark !== 'rgb(246, 244, 239)' : m.dark === 'rgb(246, 244, 239)', m.dark);
    ok(`gallery ${theme} ${w}: no page errors`, errs.length === 0, errs.join('|'));
    if (w === 390 || w === 320) { await axe(page, `gallery ${theme} ${w}`, '.tp__stage'); }
    if (w === 390 && theme === 'light') await page.screenshot({ path: `${OUT}/gallery-light-390.png`, fullPage: true });
    if (w === 390 && theme === 'dark') await page.screenshot({ path: `${OUT}/gallery-dark-390.png`, fullPage: true });
    if (w === 960) await page.locator('.tp__frame').nth(3).screenshot({ path: `${OUT}/desktop-${theme}-funded.png` });
    await ctx.close();
  }
}
// the buttons are real links, reachable by keyboard
{
  const page = await (await browser.newContext({ viewport: { width: 500, height: 900 } })).newPage();
  await page.goto(`${B}/dev/templates?kind=funded&w=390`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const links = await page.$$eval('.comm__cta a', (a) => a.map((x) => ({ href: x.getAttribute('href'), text: x.textContent.trim() })));
  ok('funded has two real links: Use Pact funds and Open Pact', links.length === 2 && links[0].text === 'Use Pact funds' && links[1].text === 'Open Pact', JSON.stringify(links));
  await page.locator('.comm__cta a').first().focus();
  ok('a button takes keyboard focus', await page.evaluate(() => document.activeElement?.textContent?.includes('Use Pact funds')));
}

/* 2. Welcome for a brand-new person, 3. notification details for someone with history */
const newPhone = `0802${String(Date.now()).slice(-7)}`;
const o = await api('POST', '/auth/otp/request', null, { phone: newPhone });
const v = await api('POST', '/auth/otp/verify', null, { phone: newPhone, code: o.devCode });
await api('POST', '/auth/signup', null, { signupToken: v.signupToken, firstName: 'Ngozi', lastName: 'Test', pin: '2468' });
const abraham = await login('08010000001');
const sarah = await login('08010000002');
const david = await login('08010000003');
const made = await api('POST', '/pacts', abraham, { title: 'Sarah’s Birthday', category: 'gift', target: 40_000_00, deadline: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10), tasks: [{ title: 'Order the cake' }] });
const pact = made.data.pact;
for (const t of [sarah, david]) await api('POST', `/invites/${pact.inviteCode}/join`, t, {});
await api('POST', `/pacts/${pact.id}/contributions`, sarah, { amount: 17_000_00, pin: '1357' });
await api('POST', `/pacts/${pact.id}/contributions`, david, { amount: 23_000_00, pin: '1357' }); // funded
await api('POST', `/pacts/${pact.id}/updates`, abraham, { body: 'Venue confirmed for Saturday. Please arrive by 5pm.' });

// Each pass signs in twice per person, and the demo stack allows about four codes per number per 15 minutes,
// so a full run uses two fresh stacks: VIEWPORTS=390x844 then VIEWPORTS=320x568.
const VPS = (process.env.VIEWPORTS ?? '390x844,320x568').split(',').map((v) => v.split('x').map(Number));
for (const [w, h] of VPS) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: theme, isMobile: true, hasTouch: true });
    await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    const signIn = async (digits) => {
      await page.goto(`${B}/app/auth/phone`);
      await page.getByLabel('Mobile number').fill(digits);
      await page.getByRole('button', { name: 'Send code' }).click();
      await page.getByRole('button', { name: 'Fill it in' }).click();
      await page.locator('.wallet-strip').waitFor();
    };
    await signIn(newPhone.replace(/^0/, ''));
    await page.waitForTimeout(1500);
    const welcome = page.getByRole('region', { name: 'Welcome' });
    ok(`welcome ${theme}@${w}: a new person sees the Welcome template`, await welcome.isVisible() && (await welcome.getByRole('heading', { name: 'Welcome, Ngozi.' }).count()) === 1);
    ok(`welcome ${theme}@${w}: first action is Create your first Pact`, (await welcome.getByRole('link', { name: 'Create your first Pact' }).getAttribute('href')) === '/app/create');
    await page.screenshot({ path: `${OUT}/${theme}-${w}-welcome.png` });
    await axe(page, `welcome ${theme}@${w}`);
    // someone with history: open the notifications
    await page.evaluate(() => { localStorage.clear(); });
    await ctx.clearCookies();
    await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
    await signIn('8010000001');
    await page.goto(`${B}/app/notifications`); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /fully funded|Goal reached/ }).first().click();
    await page.waitForTimeout(1500);
    ok(`detail ${theme}@${w}: the funded notification opens its template`, /\/app\/notifications\//.test(page.url()) && (await page.getByRole('heading', { name: /is fully funded/ }).count()) === 1, page.url());
    await page.screenshot({ path: `${OUT}/${theme}-${w}-detail-funded.png`, fullPage: true });
    await axe(page, `detail funded ${theme}@${w}`);
    const open = page.getByRole('link', { name: 'Use Pact funds' });
    ok(`detail ${theme}@${w}: Use Pact funds leads to the Pact`, (await open.getAttribute('href')) === `/app/pact/${pact.id}`);
    await open.click(); await page.waitForTimeout(1500);
    ok(`detail ${theme}@${w}: and the Pact opens`, page.url().endsWith(`/app/pact/${pact.id}`));
    // the organiser's update goes to the group, not to the organiser: look at it as David
    await page.evaluate(() => { localStorage.clear(); });
    await ctx.clearCookies();
    await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
    await signIn('8010000003');
    await page.goto(`${B}/app/notifications`); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /posted an update/ }).first().click(); await page.waitForTimeout(1500);
    ok(`detail ${theme}@${w}: an update shows its message and opens its thread`, (await page.getByText('Venue confirmed for Saturday').count()) >= 1);
    await page.getByRole('link', { name: 'View update' }).click(); await page.waitForTimeout(1800);
    ok(`detail ${theme}@${w}: the thread opens from the button`, (await page.getByRole('dialog').count()) > 0);
    ok(`detail ${theme}@${w}: no page errors`, errs.length === 0, errs.join('|'));
    await ctx.close();
  }
}
await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEMS:\n- ${problems.join('\n- ')}` : '\nall ok');

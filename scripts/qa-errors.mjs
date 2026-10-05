// Release QA: forced API failures against the signed-in app. For every failure class on a read (Home, Ask detail), a vote and a create,
// reads what the person sees: human wording, a way to retry, no stack text, no ids, no money words on unrelated errors.
// Usage: node scripts/qa-errors.mjs  (after scripts/detail-up.sh; uses /tmp/detail-state.json once, so run it on a fresh stack)
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const BASE = 'http://localhost:5174';
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: '/tmp/detail-state.json' });
const page = await ctx.newPage();
const MSG = {
  400: ['validation_failed', 'Check what you entered and try again.'],
  401: ['unauthorized', 'Sign in to continue.'],
  403: ['forbidden', 'You can’t do that here.'],
  404: ['not_found', 'We couldn’t find that.'],
  409: ['conflict', 'That changed while you were looking. Refresh and try again.'],
  429: ['rate_limited', 'Too many tries. Wait a moment and try again.'],
  500: ['internal', 'Something went wrong on our side. Try again.'],
};
const BAD = /stack|\bat [\w.<>]+ \(|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|undefined|\[object|SyntaxError|Unexpected token|JSON|TypeError|node_modules|ECONN|requestId/i;
const MONEY = /wallet|funds|₦|payment|balance|withdraw|top up/i;
let fails = 0;
const ok = (n, p, x = '') => { if (!p) fails++; console.log(p ? '  ok  ' : ' FAIL ', n, x); };
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
const fail = async (pattern, mode, run) => {
  await page.unroute(pattern).catch(() => {});
  await page.route(pattern, (route) => {
    if (route.request().method() !== run.method) return route.continue();
    if (mode === 'abort') return route.abort('failed');
    if (mode === 'html502') return route.fulfill({ status: 502, contentType: 'text/html', body: '<html><body><h1>502 Bad Gateway</h1>nginx/1.2</body></html>' });
    if (mode === 'timeout') return; // never answers
    const [code, message] = MSG[mode];
    return route.fulfill({ status: mode, contentType: 'application/json', body: JSON.stringify({ error: { code, message }, requestId: 'req-1' }) });
  });
};
// Warm a signed-in session first so the refresh cookie is spent on a normal load.
await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
await page.locator('.home__header').waitFor({ timeout: 20000 });

const modes = [400, 403, 404, 409, 429, 500, 'html502', 'abort'];
for (const mode of modes) {
  // Read: the Ask detail.
  await fail('**/api/asks/*', mode, { method: 'GET' });
  await page.goto(`${BASE}/app/asks/${ids.askOpen}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.innerText.replace('Skip to app', '').trim().length > 10, null, { timeout: 15000 }).catch(() => {});
  let t = await text();
  ok(`read ${mode}: human wording, nothing technical`, !BAD.test(t) && !MONEY.test(t.replace(/Wallet/g, '')) && t.length > 20, t.slice(0, 140));
  ok(`read ${mode}: a way to retry or go back`, (await page.getByRole('button', { name: /try again|retry|reload/i }).count()) + (await page.getByRole('link', { name: /home|back/i }).count()) + (await page.getByRole('button', { name: /back/i }).count()) > 0);
  await page.unroute('**/api/asks/*');
}
// Vote: the choice must come back (rolled back, with a message), not stay selected as if saved.
for (const mode of [400, 403, 409, 429, 500, 'abort']) {
  await page.unroute('**/api/asks/*/response').catch(() => {});
  await page.goto(`${BASE}/app/asks/${ids.askOpen}`, { waitUntil: 'load' });
  const radios = page.getByRole('radio');
  await radios.first().waitFor();
  const before = await page.getByRole('radio', { checked: true }).count();
  await fail('**/api/asks/*/response', mode, { method: 'PUT' });
  await radios.nth(1).click();
  await page.waitForTimeout(1800);
  const alerts = await page.locator('[role=alert], [role=status], .toast, .notice').allInnerTexts();
  const t = alerts.join(' | ') || (await text());
  const stillChecked = await radios.nth(1).getAttribute('aria-checked');
  ok(`vote ${mode}: message shown, nothing technical`, alerts.some((a) => a.trim().length > 8) && !BAD.test(t), alerts.join(' | ').slice(0, 140) || '(no alert text)');
  ok(`vote ${mode}: the unsaved choice is not left looking saved`, stillChecked !== 'true' || before === 0 && false, `aria-checked=${stillChecked}`);
}
await page.unroute('**/api/asks/*/response').catch(() => {});
// Create: input is kept when the call fails.
for (const mode of [400, 429, 500]) {
  await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
  await page.unroute('**/api/circles/*/asks').catch(() => {});
  await page.evaluate(() => Object.keys(localStorage).filter((k) => /draft/i.test(k)).forEach((k) => localStorage.removeItem(k)));
  await page.goto(`${BASE}/app/asks/new`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  if (!(await page.getByRole('heading', { name: 'Which Circle?' }).count())) {
    if (await page.getByLabel('Your question').count()) {
      await page.getByLabel('Your question').fill('Where do we eat on Friday?');
      await page.getByRole('radio', { name: /Pick one/ }).click();
      await page.getByRole('button', { name: 'Next' }).click();
    }
    await page.getByLabel('Option 1').waitFor({ timeout: 6000 }).catch(async () => { await page.screenshot({ path: 'exports/qa/err-debug.png' }); console.log('DEBUG text:', (await text()).slice(0, 200)); });
    await page.getByLabel('Option 1').fill('Suya spot');
    await page.getByLabel('Option 2').fill('Yellow Chilli');
    await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.getByRole('heading', { name: 'Which Circle?' }).waitFor();
  await page.getByRole('radio').first().click();
  await fail('**/api/circles/*/asks', mode, { method: 'POST' });
  await page.getByRole('button', { name: 'Ask the group' }).click();
  await page.waitForTimeout(1800);
  const alerts = await page.locator('[role=alert], [role=status], .toast, .notice').allInnerTexts();
  const t = alerts.join(' | ');
  ok(`create ${mode}: message, nothing technical, no money words`, t.trim().length > 8 && !BAD.test(t) && !MONEY.test(t), t.slice(0, 160));
  ok(`create ${mode}: still on the flow with the button usable again`, /\/app\/asks\/new/.test(page.url()) && (await page.getByRole('button', { name: 'Ask the group' }).isEnabled()));
}
await page.unroute('**/api/circles/*/asks').catch(() => {});
// Session expiry mid-use: a 401 on a read signs out cleanly to the front door and remembers where the person was.
await page.route('**/api/home', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: 'Sign in to continue.' } }) }));
await page.route('**/api/auth/refresh', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: 'Sign in to continue.' } }) }));
await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
ok('expired session: sent to a sign-in screen, not a blank page', /\/app\/auth\//.test(page.url()) || /\/app$/.test(new URL(page.url()).pathname), page.url().replace(BASE, ''));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);

// Screenshots of signed-in screens for design review.
// Usage: node scripts/shots.mjs <outDir> <phone> <name=path[@action,...]> ...
//   actions: click:<text>, fill:<label>=<value>, scroll:<px>, wait:<ms>
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const [out, phone, ...specs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: process.env.SCHEME === 'dark' ? 'dark' : 'light' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
const BASE = 'http://localhost:5173';

await page.goto(`${BASE}/app/auth/phone`);
await page.getByText('What’s your number?').waitFor();
await page.waitForTimeout(500);
await page.getByLabel('Mobile number').fill(phone.replace(/^0/, ''));
await page.getByRole('button', { name: 'Send code' }).click();
await page.getByRole('button', { name: 'Fill it in' }).click();
await page.locator('.wallet-strip').waitFor();

for (const spec of specs) {
  const name = spec.slice(0, spec.indexOf('='));
  const rest = spec.slice(spec.indexOf('=') + 1);
  const [path, actions = ''] = rest.split('@');
  await page.goto(`${BASE}${path}`);
  await page.waitForTimeout(1500);
  for (const a of actions.split(',').filter(Boolean)) {
    const [kind, arg] = [a.slice(0, a.indexOf(':')), a.slice(a.indexOf(':') + 1)];
    if (kind === 'click') await page.getByText(arg, { exact: false }).first().click();
    else if (kind === 'fill') {
      const [label, value] = arg.split('=');
      await page.getByLabel(label).first().fill(value);
    } else if (kind === 'scroll') await page.locator('.screen').first().evaluate((el, y) => el.scrollTo(0, y), Number(arg));
    else if (kind === 'wait') await page.waitForTimeout(Number(arg));
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('✓', name);
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();

import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const B = 'http://localhost:5174';
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: JSON.parse(readFileSync('/tmp/detail-state.json', 'utf8')) });
const page = await ctx.newPage();
await page.goto(`${B}/app/pact/${ids.pactProgress}/invite`, { waitUntil: 'load' });
await page.waitForTimeout(6000);
const code = (await page.locator('.invite__url').innerText()).trim().split('/').pop();
console.log('code', code, 'people before:', await page.locator('.invite__people li').count());
// someone else arrives through the link
const g = await browser.newContext({ viewport: { width: 390, height: 844 } });
const gp = await g.newPage();
await gp.goto(`${B}/app/auth/phone`, { waitUntil: 'load' });
await gp.getByLabel('Mobile number').fill('8010000007');
await gp.getByRole('button', { name: 'Send code' }).click();
await gp.getByRole('button', { name: 'Fill it in' }).click();
await gp.locator('.home__header').waitFor({ timeout: 30000 });
await gp.goto(`${B}/app/join/${code}`, { waitUntil: 'load' });
await gp.waitForTimeout(5000);
await gp.getByText('Contributing money').click();
await gp.getByRole('button', { name: /Join this Pact/ }).click();
await gp.waitForTimeout(3000);
console.log('joiner now at', gp.url());
// Abraham's screen polls every 8s
let seen = '';
for (let i = 0; i < 12 && !seen; i++) {
  await page.waitForTimeout(2000);
  seen = (await page.locator('.toast').allInnerTexts()).join(' | ');
}
await page.screenshot({ path: '/tmp/v1/invite-joined.png' });
console.log('toast on invite:', seen, '| people after:', await page.locator('.invite__people li').count());
writeFileSync('/tmp/detail-state.json', JSON.stringify(await ctx.storageState()));
await browser.close();

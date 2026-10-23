import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const OUT = '/tmp/v1';
mkdirSync(OUT, { recursive: true });
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const only = (process.argv[2] ?? 'all').split(',');
const want = (k) => only.includes('all') || only.includes(k);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: JSON.parse(readFileSync('/tmp/detail-state.json', 'utf8')) });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const B = 'http://localhost:5174';
const go = async (p, wait = 6000) => { await page.goto(`${B}${p}`, { waitUntil: 'load' }); await page.waitForTimeout(wait); };
const toast = async () => (await page.locator('.toast').allInnerTexts()).join(' | ');
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

if (want('contribute')) {
  await go(`/app/pact/${ids.pactProgress}/contribute`);
  await page.locator('.hold').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(800);
  for (const d of '13') await page.getByRole('button', { name: d, exact: true }).last().click();
  await shot('pin-sheet');
  for (const d of '57') await page.getByRole('button', { name: d, exact: true }).last().click();
  await page.waitForTimeout(2800);
  await shot('confirm');
  console.log('confirm title:', await page.locator('.confirm__title').innerText().catch(() => 'none'), '|', await page.locator('.confirm__line').innerText().catch(() => ''));
}
if (want('plan')) {
  await go(`/app/plans/${ids.planOpen}`);
  await page.getByText(/^I.m in$/).first().click();
  await page.waitForTimeout(500);
  await shot('plan-rsvp');
  console.log('plan toast:', await toast());
}
if (want('ask')) {
  await go(`/app/asks/${ids.askOpen}`);
  await page.getByText('Dec 18').first().click();
  await page.waitForTimeout(600);
  await shot('ask-vote');
  console.log('ask toast:', await toast());
}
if (want('split')) {
  await go(`/app/splits/${ids.splitOpen}`);
  await page.getByRole('button', { name: /Mark .* as settled/ }).first().click();
  await page.waitForTimeout(800);
  await shot('split-sheet');
  const confirm = page.getByRole('dialog').getByRole('button').filter({ hasText: /settled/i }).last();
  await confirm.click();
  await page.waitForTimeout(700);
  await shot('split-settled');
  console.log('split toast:', await toast());
}
if (want('create')) {
  await go('/app/create');
  await page.getByLabel('Name').fill('Tolu and Femi’s Wedding');
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();
  await next(); await page.waitForTimeout(500);
  await next(); await page.waitForTimeout(500);
  await next(); await page.waitForTimeout(500);
  await page.locator('.suggest__chip').nth(0).click().catch(() => {});
  await shot('create-when');
  const goalChips = page.getByRole('group', { name: /Usual goals/ }).getByRole('button');
  console.log('goal chips:', await goalChips.allInnerTexts());
  await goalChips.nth(1).click();
  await page.waitForTimeout(400);
  await next(); await page.waitForTimeout(800);
  await shot('create-review');
  await page.getByRole('button', { name: /Change the cover/ }).click();
  await page.waitForTimeout(1200);
  await shot('create-cover-sheet');
  await page.getByRole('button', { name: /Aso ebi|The couple/ }).last().click();
  await page.waitForTimeout(800);
  await shot('create-cover-picked');
}
console.log('page errors:', errs.slice(0, 3));
writeFileSync('/tmp/detail-state.json', JSON.stringify(await ctx.storageState()));
await browser.close();

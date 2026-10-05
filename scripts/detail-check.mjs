// Phase C checks: axe on every detail screen (light + dark), then the interactions: answer an Ask, RSVP to a Plan, settle a share.
// Usage: node scripts/detail-check.mjs   (after scripts/detail-up.sh; uses /tmp/detail-state.json, run LAST: it changes data)
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const BASE = 'http://localhost:5174';
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
let state = JSON.parse(readFileSync('/tmp/detail-state.json', 'utf8'));
const screens = { circle: `/app/circles/${ids.boys}`, 'circle-quiet': `/app/circles/${ids.circleQuiet}`, 'ask-open': `/app/asks/${ids.askOpen}`, 'ask-answered': `/app/asks/${ids.askAnswered}`, 'plan-open': `/app/plans/${ids.planOpen}`, 'plan-converted': `/app/plans/${ids.planConverted}`, 'split-open': `/app/splits/${ids.splitOpen}`, 'split-partial': `/app/splits/${ids.splitPartial}`, 'split-settled': `/app/splits/${ids.splitSettled}`, 'pact-progress': `/app/pact/${ids.pactProgress}`, 'pact-completed': `/app/pact/${ids.pactCompleted}` };
const results = [];
const ok = (name, pass, extra = '') => { results.push(pass); console.log(pass ? '  ok  ' : ' FAIL ', name, extra); };
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme, storageState: state });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
  const page = await ctx.newPage();
  for (const [name, path] of Object.entries(screens)) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    await page.addScriptTag({ content: axeSource });
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
    const small = await page.evaluate(() => [...document.querySelectorAll('main button, main a, .screen__content button, .screen__content a, [role=radio], [role=checkbox]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.height < 43.5 || b.width < 43.5) && getComputedStyle(e).display !== 'inline'; }).map((e) => `${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 28)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
    const h1 = await page.locator('h1').count();
    ok(`axe ${theme} ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}:${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join('|')}`).join(' ; '));
    ok(`h1 ${theme} ${name} = ${h1}`, h1 === 1);
    if (theme === 'light' && small.length) console.log('   targets under 44px:', small.slice(0, 6).join(' | '));
  }
  state = await ctx.storageState();
  await ctx.close();
}
// Interactions
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state });
const page = await ctx.newPage();
await page.goto(`${BASE}${screens['ask-open']}`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const radios = page.getByRole('radio');
ok('ask: three radios in a radiogroup', (await radios.count()) === 3 && (await page.getByRole('radiogroup').count()) === 1);
const before = await page.getByRole('radio', { name: /^Dec 18/ }).getAttribute('aria-label');
await page.getByRole('radio', { name: /^Dec 18/ }).click();
await page.waitForTimeout(120);
ok('ask: pick is selected at once', (await page.getByRole('radio', { name: /^Dec 18/ }).getAttribute('aria-checked')) === 'true');
ok('ask: count moved at once', (await page.getByRole('radio', { name: /^Dec 18/ }).getAttribute('aria-label')) !== before, `${before} -> ${await page.getByRole('radio', { name: /^Dec 18/ }).getAttribute('aria-label')}`);
await page.waitForTimeout(900);
ok('ask: stays selected after the server answers', (await page.getByRole('radio', { name: /^Dec 18/ }).getAttribute('aria-checked')) === 'true');
await page.getByRole('radio', { name: /^Dec 18/ }).focus();
await page.keyboard.press('ArrowDown');
ok('ask: arrow key moves focus', (await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).startsWith('Dec 20'));
ok('ask: status announced', (await page.locator('.ox-ask__status[role=status]').innerText()).includes('answered'));

await page.goto(`${BASE}${screens['plan-open']}`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.getByRole('radio', { name: 'Maybe' }).click();
await page.waitForTimeout(900);
ok('plan: RSVP changes to Maybe', (await page.getByRole('radio', { name: 'Maybe' }).getAttribute('aria-checked')) === 'true');
await page.goto(`${BASE}${screens['plan-converted']}`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
ok('plan: converted has no RSVP track and links to the Pact', (await page.getByRole('radiogroup').count()) === 0 && (await page.getByRole('link', { name: /Open Pact/ }).count()) === 1);

await page.goto(`${BASE}${screens['split-partial']}`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const left0 = await page.locator('.ox-split__left').innerText();
await page.getByRole('button', { name: /Mark Maya.s .* as settled/ }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Mark settled' }).click();
await page.waitForTimeout(1200);
ok('split: share resolves to Settled', (await page.locator('.ox-share', { hasText: 'Maya' }).innerText()).includes('Settled'));
ok('split: still-to-come-in updated', (await page.locator('.ox-split__left').innerText()) !== left0, `${left0.replace(/\n/g, ' ')} -> ${(await page.locator('.ox-split__left').innerText()).replace(/\n/g, ' ')}`);
await page.getByRole('button', { name: /Mark Tolu.s .* as settled/ }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Mark settled' }).click();
await page.waitForTimeout(1500);
ok('split: last share settles the whole split', (await page.getByText('All settled.').count()) > 0);
// Reduced motion
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state, reducedMotion: 'reduce' });
const p2 = await rm.newPage();
await p2.goto(`${BASE}${screens['pact-completed']}`, { waitUntil: 'load' });
await p2.waitForTimeout(800);
ok('reduced motion: completed screen still renders its content', (await p2.getByText('We made it happen.').count()) === 1);
console.log(results.every(Boolean) ? 'ALL PASS' : `${results.filter((x) => !x).length} FAILED`);
await browser.close();

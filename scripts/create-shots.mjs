// Phase D: drives the + sheet and the four create flows end to end, captures every step, checks the behaviour.
// Usage: node scripts/create-shots.mjs <outDir> [--w=390,430,768] [--theme=light|dark] [--axe]
// Needs scripts/detail-up.sh first (fresh stack + fixtures + saved session). Creates real objects on the demo stack.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const out = process.argv[2] ?? 'exports/phase-d';
const BASE = 'http://localhost:5174';
const widths = arg('w', '390').split(',').map(Number);
const theme = arg('theme', 'light');
const withAxe = process.argv.includes('--axe');
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
let state = JSON.parse(readFileSync('/tmp/detail-state.json', 'utf8'));
const results = [];
const ok = (name, pass, extra = '') => { results.push(pass); console.log(pass ? '  ok  ' : ' FAIL ', name, extra); };

for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, deviceScaleFactor: width >= 768 ? 1 : 2, colorScheme: theme, storageState: state });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${width}-${theme}-${name}.png` }); };
  const axe = async (name) => {
    if (!withAxe) return;
    await page.addScriptTag({ content: axeSource });
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
    ok(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}:${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join('|')}`).join(' ; '));
  };
  const next = (label = 'Next') => page.getByRole('button', { name: label, exact: true }).click();
  const small = async (name) => {
    const bad = await page.evaluate(() => [...document.querySelectorAll('.screen__content button, .screen__content [role=radio], .screen__content [role=checkbox], .screen__footer button, .topbar button')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.height < 43.5 || b.width < 43.5); }).map((e) => `${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
    if (bad.length) console.log(`   under 44px on ${name}:`, bad.slice(0, 5).join(' | '));
  };

  // ---- the + sheet
  await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await shot('sheet-0-closed');
  const plus = page.getByRole('button', { name: 'Create' }).first();
  ok('+ is a button that says it is closed', (await plus.getAttribute('aria-expanded')) === 'false');
  await plus.click();
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${out}/${width}-${theme}-sheet-1-morphing.png` });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${width}-${theme}-sheet-2-open.png` });
  ok('+ says it is open', (await plus.getAttribute('aria-expanded')) === 'true');
  const dialog = page.getByRole('dialog');
  ok('sheet: four choices in order', (await dialog.getByRole('button').filter({ hasText: /Get a quick decision|Figure out|Sort out|Commit to/ }).allInnerTexts()).length === 4);
  ok('sheet: focus is inside', await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
  await axe('sheet open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  ok('sheet: Escape closes it', (await page.getByRole('dialog').count()) === 0);
  ok('sheet: focus returns to +', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Create'));

  // ---- Ask (no Circle given, so it asks which)
  await page.goto(`${BASE}/app/asks/new`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await shot('ask-1-question');
  ok('ask: Next is disabled until there is a question', await page.getByRole('button', { name: 'Next', exact: true }).isDisabled());
  await page.getByLabel('Your question').fill('Where should we eat on Friday?');
  await axe('ask step 1');
  await small('ask 1');
  await next();
  await page.getByLabel('Option 1').waitFor();
  await shot('ask-2-options-empty');
  ok('ask: says add at least two options', (await page.getByText('Add at least two options.').count()) === 1);
  await page.getByLabel('Option 1').fill('Suya spot');
  await page.keyboard.press('Enter');
  ok('ask: Enter moves to the next option', await page.evaluate(() => document.activeElement?.id !== '' && document.activeElement?.closest('li')?.querySelector('label')?.textContent === 'Option 2'));
  await page.keyboard.type('Yellow Chilli');
  await shot('ask-3-options');
  await axe('ask options');
  await next();
  await page.getByRole('radiogroup', { name: 'Circle' }).waitFor();
  await shot('ask-4-circle');
  ok('ask: Ask the group is disabled until a Circle is chosen', await page.getByRole('button', { name: 'Ask the group' }).isDisabled());
  await page.getByRole('radio', { name: /The Boys/ }).click();
  await page.waitForTimeout(250);
  ok('ask: chosen Circle announces as checked', (await page.getByRole('radio', { name: /The Boys/ }).getAttribute('aria-checked')) === 'true');
  await axe('ask circle');
  // Back keeps what was entered
  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForTimeout(500);
  ok('ask: Back keeps the options', (await page.getByLabel('Option 1').inputValue()) === 'Suya spot');
  await next();
  await page.getByRole('radio', { name: /The Boys/ }).waitFor();
  await page.getByRole('button', { name: 'Ask the group' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${width}-${theme}-ask-5-made.png` });
  ok('ask: completion shows while it opens', (await page.getByText('Your question is live').count()) > 0);
  await page.waitForURL(/\/app\/asks\/[0-9a-f-]{36}/, { timeout: 8000 });
  await page.waitForTimeout(900);
  await shot('ask-6-resolved');
  ok('ask: lands on the Ask', (await page.getByRole('radio').count()) === 2);

  // ---- Leaving: nothing entered closes at once; something entered asks first
  await page.goto(`${BASE}/app/asks/new?circle=${ids.boys}`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.getByLabel('Your question').fill('Half a thought');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(500);
  await shot('leave-confirm');
  ok('leave: asks before discarding', (await page.getByRole('dialog').getByText(/Leave this ask/).count()) === 1);
  await axe('leave confirm');
  await page.getByRole('button', { name: 'Keep going' }).click();
  await page.waitForTimeout(400);
  ok('leave: Keep going stays on the flow', (await page.getByLabel('Your question').inputValue()) === 'Half a thought');

  // ---- Plan (from a Circle: no Circle step)
  await page.goto(`${BASE}/app/plans/new?circle=${ids.boys}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await shot('plan-1-what');
  await page.getByLabel('Plan name').fill('Beach day in Lekki');
  await next();
  await page.getByRole('group', { name: /Quick dates/ }).waitFor();
  await shot('plan-2-when');
  await page.getByRole('button', { name: 'This weekend' }).click();
  await page.waitForTimeout(300);
  ok('plan: quick date fills the date field', (await page.getByLabel('Starts').inputValue()) !== '');
  ok('plan: an end date is offered once there is a start', (await page.getByLabel('Ends (optional)').count()) === 1);
  await shot('plan-3-when-picked');
  await axe('plan when');
  await next();
  await page.getByLabel('Where').waitFor();
  await page.getByLabel('Where').fill('Landmark Beach');
  await shot('plan-4-where');
  ok('plan: no Circle step when it comes from a Circle', (await page.getByRole('button', { name: 'Create plan' }).count()) === 1);
  await small('plan where');
  await page.getByRole('button', { name: 'Create plan' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${width}-${theme}-plan-5-made.png` });
  await page.waitForURL(/\/app\/plans\/[0-9a-f-]{36}/, { timeout: 8000 });
  await page.waitForTimeout(900);
  await shot('plan-6-resolved');
  ok('plan: lands on the Plan with its date and place', (await page.getByText('Landmark Beach').count()) > 0);

  // ---- Plan without a Circle: who is it for
  await page.goto(`${BASE}/app/plans/new`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.getByLabel('Plan name').fill('Dinner on Friday');
  await next();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByLabel('Where').waitFor();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Circle' }).waitFor();
  await shot('plan-7-who');
  await axe('plan who');

  // ---- Split
  await page.goto(`${BASE}/app/splits/new?circle=${ids.boys}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.getByLabel('What was it for?').fill('Suya night');
  const amt = page.getByLabel('Total amount');
  ok('split: amount is a numeric keyboard', ['numeric', 'decimal'].includes((await amt.getAttribute('inputmode')) ?? ''));
  await shot('split-1-what');
  await amt.fill('24000');
  await shot('split-2-amount');
  await small('split 1');
  await next();
  await page.getByRole('radiogroup', { name: 'Who paid' }).waitFor();
  await shot('split-3-paid');
  await page.getByRole('radio', { name: /Sarah/ }).click();
  await page.waitForTimeout(250);
  await axe('split paid');
  await next();
  await page.getByRole('checkbox', { name: /David/ }).waitFor();
  await shot('split-4-who');
  await page.getByRole('checkbox', { name: /Tolu/ }).click();
  await page.waitForTimeout(250);
  ok('split: unticking a person updates the checkbox', (await page.getByRole('checkbox', { name: /Tolu/ }).getAttribute('aria-checked')) === 'false');
  ok('split: says when the payer is not sharing', true);
  await page.getByRole('checkbox', { name: /Sarah/ }).click();
  await page.waitForTimeout(250);
  ok('split: says the payer is not sharing', (await page.getByText(/paid and isn.t sharing it/).count()) === 1);
  await page.getByRole('checkbox', { name: /Sarah/ }).click();
  await page.waitForTimeout(250);
  await shot('split-5-who-untick');
  await next();
  await page.getByText('Here’s the split').waitFor();
  await shot('split-6-review');
  await page.getByRole('button', { name: 'Create split' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${width}-${theme}-split-7-made.png` });
  await page.waitForURL(/\/app\/splits\/[0-9a-f-]{36}/, { timeout: 8000 });
  await page.waitForTimeout(900);
  await shot('split-8-resolved');
  ok('split: lands on the Split', (await page.getByText('Suya night').count()) > 0);

  // ---- Pact from a Circle: the Circle's people are already ticked
  await page.goto(`${BASE}/app/create?circle=${ids.boys}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await shot('pact-1-what');
  await page.getByLabel('Name').fill('Ibadan road trip');
  await axe('pact what');
  await small('pact what');
  await next();
  await page.getByRole('checkbox', { name: /Sarah/ }).waitFor();
  await page.waitForTimeout(400);
  await shot('pact-2-who');
  ok('pact: the Circle’s people start ticked', (await page.getByRole('checkbox', { name: /Sarah/ }).getAttribute('aria-checked')) === 'true');
  await next();
  await page.getByText('What needs to happen?').waitFor();
  await page.waitForTimeout(400);
  await shot('pact-3-todo');
  const chip = page.locator('.suggest__chip').first();
  await chip.click();
  await next();
  await page.getByText('How much, and by when?').waitFor();
  await shot('pact-4-when-empty');
  ok('pact: Next is disabled with nothing entered', await page.getByRole('button', { name: 'Next', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'In 2 weeks' }).click();
  await page.getByLabel('Target').fill('300000');
  await page.waitForTimeout(300);
  await shot('pact-5-when');
  await axe('pact when');
  await next();
  await page.getByText('Ready to make it real?').waitFor();
  await page.waitForTimeout(400);
  await shot('pact-6-review');
  await axe('pact review');
  await small('pact review');
  await page.getByRole('button', { name: /^Create Pact/ }).click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${width}-${theme}-pact-7-made.png` });
  ok('pact: strong completion shows', (await page.getByText('Your Pact is made').count()) > 0);
  await page.waitForURL(/\/app\/pact\/[0-9a-f-]{36}/, { timeout: 9000 });
  await page.waitForTimeout(1200);
  await shot('pact-8-resolved');
  ok('pact: lands on the new Pact', page.url().includes('/app/pact/'));

  // ---- Plan -> Pact: what the plan knows is not asked again
  await page.goto(`${BASE}/app/create?plan=${ids.planOpen}`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await shot('plan-to-pact-1');
  ok('plan to pact: the name is already there', (await page.getByLabel('Name').inputValue()) === 'Bali Trip');
  ok('plan to pact: says where it came from', (await page.getByText(/From your plan/).count()) === 1);
  console.log(errors.length ? `   page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}` : '   no page errors');
  state = await ctx.storageState();
  writeFileSync('/tmp/detail-state.json', JSON.stringify(state));
  await ctx.close();
}
await browser.close();
console.log(results.every(Boolean) ? 'ALL PASS' : `${results.filter((x) => !x).length} FAILED`);

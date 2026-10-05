// Exports every app screen as an individual PNG (390 wide, full page), light and dark, signed in and signed out, into
// exports/app-screens/{light,dark}/NN-name.png, then zips it. Usage: node scripts/export-app-screens.mjs [--w=390]
// Needs the demo stack with fixtures and one saved session: bash scripts/detail-up.sh first.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
const W = Number((process.argv.find((a) => a.startsWith('--w=')) ?? '--w=390').split('=')[1]);
const BASE = 'http://localhost:5174';
const OUT = 'exports/app-screens';
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
const T = ids.tokens;
rmSync(OUT, { recursive: true, force: true });
for (const t of ['light', 'dark']) mkdirSync(`${OUT}/${t}`, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});

const signedIn = [
  ['home', '/app/home'], ['circles', '/app/circles'], ['circle-the-boys', `/app/circles/${ids.boys}`], ['circle-quiet', `/app/circles/${ids.circleQuiet}`],
  ['ask-open', `/app/asks/${ids.askOpen}`], ['ask-answered', `/app/asks/${ids.askAnswered}`],
  ['plan-open', `/app/plans/${ids.planOpen}`], ['plan-became-pact', `/app/plans/${ids.planConverted}`],
  ['split-open', `/app/splits/${ids.splitOpen}`], ['split-partial', `/app/splits/${ids.splitPartial}`], ['split-settled', `/app/splits/${ids.splitSettled}`], ['split-you-owe', `/app/splits/${ids.splitOwe}`],
  ['pact-active', `/app/pact/${ids.pactActive}`], ['pact-in-progress', `/app/pact/${ids.pactProgress}`], ['pact-completed', `/app/pact/${ids.pactCompleted}`], ['pact-from-plan', `/app/pact/${ids.pactFromPlan}`],
  ['recap-pact', `/app/recap/pact/${ids.pactCompleted}`], ['recap-split', `/app/recap/split/${ids.splitSettled}`],
  ['activity', '/app/activity'], ['pacts', '/app/pacts'], ['notifications', '/app/notifications'],
  ['me', '/app/profile'], ['settings', '/app/profile/settings'], ['account', '/app/profile/account'], ['security', '/app/profile/security'], ['bank-accounts', '/app/profile/banks'], ['verify-identity', '/app/profile/verify'],
  ['wallet', '/app/wallet'], ['wallet-top-up', '/app/wallet/topup'], ['wallet-withdraw', '/app/wallet/withdraw'],
  ['create-ask', '/app/asks/new'], ['create-plan', '/app/plans/new'], ['create-split', '/app/splits/new'], ['create-pact', '/app/create'], ['create-circle', '/app/circles/new'],
  ['guided-start', '/app/start'], ['join-with-invite', '/app/join-invite'], ['onboarding-intro', '/app/onboarding'],
];
const signedOut = [
  ['welcome', '/app'], ['get-started', '/app/auth/start'], ['sign-in', '/app/auth/signin'], ['email', '/app/auth/email'], ['phone', '/app/auth/phone'],
  ['shared-ask', `/a/${T.ask}`], ['shared-ask-closed', `/a/${T.askClosed}`], ['shared-plan', `/p/${T.plan}`], ['shared-plan-became-pact', `/p/${T.planPact}`], ['shared-split', `/s/${T.split}`], ['shared-split-settled', `/s/${T.splitSettled}`],
  ['shared-recap-pact', `/r/${T.recapPact}`], ['shared-recap-split', `/r/${T.recapSplit}`], ['circle-invite', `/app/c/${T.circle}`], ['circle-invite-revoked', `/app/c/${T.circleRevoked}`],
];

let manifest = [];
const shoot = async (page, theme, n, name, path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const file = `${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: `${OUT}/${theme}/${file}`, fullPage: true });
  if (theme === 'light') manifest.push(`${file}\t${path.replace(/\/[A-Za-z0-9_-]{30,}/g, '/<id>')}`);
};

for (const theme of ['light', 'dark']) {
  const init = (t) => (c) => c.addInitScript((x) => { try { localStorage.setItem('pact.theme', x); } catch {} }, t);
  const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, storageState: '/tmp/detail-state.json', deviceScaleFactor: 2 });
  await init(theme)(ctx);
  const page = await ctx.newPage();
  let n = 0;
  for (const [name, path] of signedIn) await shoot(page, theme, ++n, name, path);
  // The + sheet, open.
  await page.goto(`${BASE}/app/home`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Create' }).click().catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${theme}/${String(++n).padStart(2, '0')}-create-sheet.png` });
  if (theme === 'light') manifest.push(`${String(n).padStart(2, '0')}-create-sheet.png\t/app/home (+ open)`);
  await ctx.storageState({ path: '/tmp/detail-state.json' });
  await ctx.close();
  const anon = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2 });
  await init(theme)(anon);
  const ap = await anon.newPage();
  for (const [name, path] of signedOut) await shoot(ap, theme, ++n, `out-${name}`, path);
  await anon.close();
}
writeFileSync(`${OUT}/INDEX.txt`, `PACT app screens, ${W}px wide, 2x, full page. light/ and dark/ hold the same screens. Demo data.\n\n${manifest.join('\n')}\n`);
execFileSync('zip', ['-qr', 'exports/pact-app-screens.zip', 'app-screens'], { cwd: 'exports' });
console.log(`done: ${manifest.length} screens x 2 themes`);
await browser.close();

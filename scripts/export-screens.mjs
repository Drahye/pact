// Exports the 29 submission screens as self-contained HTML (plus PNG), then zips them.
//  01–20 app states · 21–24 landing and download, desktop and mobile · 25–29 style guide
// Usage: node scripts/export-screens.mjs   (dev server on :5173)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { frameLayout, phoneFrameCss, snapshotHtml } from './lib/html-snapshot.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:5173';
const out = 'exports/screens';
const png = 'exports/screens-png';
for (const d of [out, png]) {
  if (existsSync(d)) for (const f of readdirSync(d)) rmSync(`${d}/${f}`);
  mkdirSync(d, { recursive: true });
}
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const index = [];

const write = (n, slug, title, html, group) => {
  const file = `${String(n).padStart(2, '0')}-${slug}.html`;
  writeFileSync(`${out}/${file}`, html);
  index.push({ file, title, group });
  console.log('saved', file);
};

// ---------------------------------------------------------------- app states
let app = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const go = async (path, wait = 1400) => {
  await app.goto(`${base}${path}`, { waitUntil: 'load', timeout: 60000 });
  await app.waitForTimeout(wait);
};
let n = 0;
const state = async (slug, title, wait = 600) => {
  await app.waitForTimeout(wait);
  n += 1;
  await app.screenshot({ path: `${png}/${String(n).padStart(2, '0')}-${slug}.png` });
  write(n, slug, title, await snapshotHtml(app, { title: `PACT app · ${title}`, extraCss: phoneFrameCss, frameOverlays: true }), 'Mobile app');
};
const hold = async () => {
  const box = await app.locator('.hold').boundingBox();
  await app.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await app.mouse.down();
  await app.waitForTimeout(1200);
  await app.mouse.up();
};

// Welcome is captured in its settled state (₦320,000 · 64%), not mid-payment.
await app.emulateMedia({ reducedMotion: 'reduce' });
await go('/app', 2500);
await state('app-welcome', 'Welcome');
await app.getByRole('button', { name: 'Join with invite' }).click();
await state('app-welcome-join', 'Welcome · Join with invite', 900);
await app.emulateMedia({ reducedMotion: 'no-preference' });

await go('/app/home', 2200);
await state('app-home', 'Home');
await go('/app/pacts');
await state('app-pacts', 'Pacts');
await go('/app/profile');
await state('app-profile', 'Profile');

// The Create flow runs in its own session so the new Pact doesn't appear in the showcase screens.
const main = app;
app = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await go('/app/create');
await state('app-create-empty', 'Create a Pact · Empty');
await app.getByRole('button', { name: 'Create Pact' }).click();
await state('app-create-errors', 'Create a Pact · Validation');
await app.getByLabel('What’s the money for?').fill('Sarah’s Birthday');
await app.getByLabel('How much do you need?').fill('500000');
await app.getByLabel('When do you need it?').fill('2026-10-18');
await app.locator('.create__invite').click();
for (const name of ['Sarah Adeyemi', 'David Eze', 'Maya Bello']) await app.getByRole('button', { name }).click();
await state('app-create-invite-sheet', 'Create a Pact · Invite people', 900);
await app.getByRole('button', { name: /Add 3 people/ }).click();
await state('app-create-filled', 'Create a Pact · Filled', 900);
await app.getByRole('button', { name: 'Create Pact' }).click();
await state('app-detail-new-pact', 'Pact Detail · New Pact, just you', 2600);
await app.getByRole('link', { name: 'Invite people' }).click();
await state('app-invite-joining', 'Invite · People joining', 5500);
await app.close();
app = main;

await go('/app/pact/sarahs-birthday', 2200);
await state('app-detail', 'Pact Detail');
await app.locator('.person', { hasText: 'David' }).click();
await state('app-detail-selected', 'Pact Detail · Tap a colour', 900);
await go('/app/pact/sarahs-birthday/invite');
await state('app-invite', 'Invite');
await go('/app/pact/sarahs-birthday/contribute');
await state('app-contribute', 'Contribute');
await app.getByRole('button', { name: /Cover the rest/ }).click();
await state('app-contribute-cover-rest', 'Contribute · Cover the rest');
await go('/app/pact/sarahs-birthday/contribute');
await hold();
await state('app-confirmation', 'Confirmation', 2600);
await go('/app/activity');
await state('app-activity', 'Activity');
await go('/app/pact/sarahs-birthday/contribute');
await app.getByRole('button', { name: /Cover the rest/ }).click();
await hold();
await app.waitForTimeout(2000);
await app.getByRole('button', { name: 'See it complete' }).click();
await state('app-completed', 'Completed', 3200);
await app.getByRole('button', { name: 'View contributions' }).click();
await state('app-completed-contributions', 'Completed · Contributions', 900);
await app.close();

// ---------------------------------------------------- website, fixed layouts
const site = async (path, kind, slug, title) => {
  const width = kind === 'mobile' ? 390 : 1440;
  const p = await browser.newPage({ viewport: { width, height: kind === 'mobile' ? 844 : 900 }, reducedMotion: 'reduce' });
  await p.goto(`${base}${path}`, { waitUntil: 'load', timeout: 60000 });
  const h = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) await p.evaluate((v) => scrollTo(0, v), y), await p.waitForTimeout(40);
  await p.evaluate(() => scrollTo(0, 0));
  await p.waitForTimeout(1200);
  n += 1;
  write(n, slug, title, frameLayout(await snapshotHtml(p, { title, viewportHeight: kind === 'mobile' ? 844 : 900 }), { title, kind }), 'Website');
  await p.close();
};
await site('/', 'desktop', 'landing-desktop', 'Landing page · Desktop');
await site('/', 'mobile', 'landing-mobile', 'Landing page · Mobile');
await site('/download', 'desktop', 'download-desktop', 'Download page · Desktop');
await site('/download', 'mobile', 'download-mobile', 'Download page · Mobile');

// ------------------------------------------------------------- style guide
for (const [key, title] of [
  ['foundations', 'Style guide · Foundations and variables'],
  ['actions', 'Components · Buttons and inputs'],
  ['progress', 'Components · Progress and people'],
  ['surfaces', 'Components · Cards, feed and navigation'],
  ['feedback', 'Components · Feedback and marketing'],
]) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await p.goto(`${base}/styleguide?page=${key}`, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(1500);
  n += 1;
  write(n, `styleguide-${key}`, title, await snapshotHtml(p, { title: `PACT · ${title}` }), 'Style guide');
  await p.close();
}
await browser.close();

// ------------------------------------------------------------------- index + zip
const groups = ['Mobile app', 'Website', 'Style guide'];
const list = groups
  .map((g) => `<h2>${g}</h2><ol>${index.filter((i) => i.group === g).map((i) => `<li><a href="${i.file}"><b>${i.file.slice(0, 2)}</b>${i.title}</a></li>`).join('')}</ol>`)
  .join('');
writeFileSync(
  `${out}/index.html`,
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PACT · ${index.length} screens</title><style>
body{margin:0;padding:48px 20px;font:16px/1.5 system-ui,sans-serif;background:#f6f4ef;color:#0f1713}main{max-width:760px;margin:auto}
h1{font-size:44px;letter-spacing:-.04em;margin:0}p{color:#4a544f}h2{font-size:18px;margin:36px 0 10px}ol{list-style:none;padding:0;margin:0;display:grid;gap:8px}
a{display:flex;gap:14px;align-items:center;padding:14px 18px;border-radius:16px;background:#fff;box-shadow:inset 0 0 0 1px #e7e3da;color:inherit;text-decoration:none;font-weight:600}
a:hover{box-shadow:inset 0 0 0 1.5px #0f1713}b{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#e3f7ec;color:#137a4a;font-size:13px}
</style></head><body><main><h1>PACT · ${index.length} screens</h1><p>Self-contained snapshots of the coded product. Styles, fonts and images are inlined, so every file opens offline. App states are shown in a phone frame with their bottom sheets. Website pages are full-frame, full-height layouts at 1440px (desktop) and 390px (mobile). Live interactions (gestures, 3D, scroll animation) run in the build: <code>npm run dev</code>.</p>${list}</main></body></html>`,
);
const zip = 'exports/pact-29-screens.zip';
if (existsSync(zip)) rmSync(zip);
execFileSync('zip', ['-qr', '../pact-29-screens.zip', '.'], { cwd: out });
console.log(`zipped ${index.length} screens -> ${zip}`);

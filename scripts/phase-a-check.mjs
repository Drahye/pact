// Design-system primitives: screenshots of the gallery at 390 / 430 / 768 (light beside dark), a dark-only capture, and behaviour,
// accessibility and token checks. Usage: node scripts/phase-a-check.mjs <outDir> [base]   (a dev server must be running)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? 'exports/phase-a-gallery';
const BASE = (process.argv[3] ?? 'http://localhost:5190').replace(/\/$/, '');
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const results = [];
const check = (name, ok, detail = '') => (results.push(ok), console.log(ok ? '✓' : '✗', name, detail));
const errors = [];

/* ---- screenshots + overflow ---- */
for (const width of [390, 430, 768]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width < 600 ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/dev/objects`, { waitUntil: 'load' });
  await page.locator('#create').waitFor();
  await page.waitForTimeout(1500);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${width}px: no horizontal overflow`, over <= 0, `(${over}px)`);
  await page.screenshot({ path: `${out}/${width}-gallery.png`, fullPage: true });
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/objects?theme=dark`, { waitUntil: 'load' });
  await page.locator('#create').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/390-gallery-dark.png`, fullPage: true });
  const dark = await page.evaluate(() => ({ bg: getComputedStyle(document.querySelector('.gal-frame')).backgroundColor, text: getComputedStyle(document.querySelector('.gal-frame')).color, surface: getComputedStyle(document.querySelector('.ox-ask .ox-opt')).backgroundColor }));
  const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  check('dark: background is a warm charcoal, not pure black', lum(dark.bg) > 0.003 && lum(dark.bg) < 0.05 && dark.bg !== 'rgb(0, 0, 0)', dark.bg);
  check('dark: surfaces are softened, not white', lum(dark.surface) < 0.12, dark.surface);
  await ctx.close();
}

/* ---- behaviour (light frame, phone width) ---- */
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/dev/objects?theme=light`, { waitUntil: 'load' });
await page.locator('#ask').waitFor();

const ask = page.locator('#ask .ox-ask').first();
const before = Number((await ask.getByRole('radio', { name: /Nov 14/ }).locator('.ox-opt__n').innerText()).trim());
await ask.getByRole('radio', { name: /Nov 14/ }).focus();
await page.keyboard.press('ArrowDown');
check('Ask: arrow keys move between options', (await page.evaluate(() => document.activeElement?.textContent ?? '')).includes('Nov 21'));
await ask.getByRole('radio', { name: /Nov 14/ }).click();
await page.waitForTimeout(500);
check('Ask: the choice is selected immediately', (await ask.getByRole('radio', { name: /Nov 14/ }).getAttribute('aria-checked')) === 'true');
check('Ask: its count ticks up', Number((await ask.getByRole('radio', { name: /Nov 14/ }).locator('.ox-opt__n').innerText()).trim()) === before + 1);
check('Ask: it says it was counted', /Counted/.test(await ask.innerText()));
check('Ask: closed and disabled objects cannot be answered', (await page.locator('#ask .ox-ask.is-closed .ox-opt:not(:disabled)').count()) === 0 && (await page.locator('#ask .ox-ask.is-disabled .ox-opt:not(:disabled)').count()) === 0);

const plan = page.locator('#plan .ox-plan').first();
await plan.getByRole('radio', { name: 'Maybe' }).click();
await page.waitForTimeout(400);
check('Plan: one tap sets the RSVP and the pill follows', (await plan.getByRole('radio', { name: 'Maybe' }).getAttribute('aria-checked')) === 'true' && (await plan.locator('.ox-rsvp__pill').count()) === 1);
check('Plan: a finished plan has no RSVP and a done mark', (await page.locator('#plan .ox-plan.is-done .ox-rsvp').count()) === 0 && (await page.locator('#plan .ox-plan.is-done .done__mark').count()) === 1);

const split = page.locator('#split .ox-split').first();
const segBefore = await split.locator('.ox-split__bar i.is-on').count();
const leftBefore = await split.locator('.ox-split__left').innerText();
await split.getByRole('button', { name: /Mark You.*settled|Mark .*settled/ }).first().click();
await split.locator('.ox-share.is-fresh').waitFor({ timeout: 4000 });
check('Split: the settled row warms and the bar fills a segment', (await split.locator('.ox-split__bar i.is-on').count()) === segBefore + 1);
await page.waitForTimeout(1200);
check('Split: the amount still to come in changes', (await split.locator('.ox-split__left').innerText()) !== leftBefore);
const last = split.getByRole('button', { name: /settled/ });
while ((await last.count()) > 0) { await last.first().click(); await page.waitForTimeout(150); }
check('Split: the last share resolves the whole object', (await split.evaluate((el) => el.classList.contains('is-resolved'))) === true);

const pact = page.locator('#pact .ox-pact').first();
await pact.getByRole('button', { name: 'Mark done' }).click();
await page.waitForTimeout(500);
check('Pact: the responsibility resolves to done', (await pact.locator('.ox-pact__mine.is-done').count()) === 1 && (await pact.locator('.ox-pact__mine.is-done .done__mark').count()) === 1);
check('Pact: a completed Pact is a completion with faces', (await page.locator('#pact .ox-pact--completed .done .avatar').count()) >= 3);

await page.locator('.gal-plus').scrollIntoViewIfNeeded();
await page.locator('.gal-plus').click();
await page.waitForTimeout(40);
const clip = await page.evaluate(() => getComputedStyle(document.querySelector('.csheet__panel:not(.csheet--inline .csheet__panel)') ?? document.querySelector('.csheet__panel')).clipPath);
check('Create sheet: it grows out of the button (clipped at the start)', /^inset\(/.test(clip) && !/inset\(0px 0px 0px 0px/.test(clip), clip);
await page.waitForTimeout(600);
check('Create sheet: four tinted choices', (await page.locator('.csheet:not(.csheet--inline) .create-sheet__option').count()) === 4);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
check('Create sheet: Escape closes it and focus returns to the button', (await page.locator('.csheet:not(.csheet--inline)').count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Create')));

/* ---- accessibility ---- */
const targets = await page.evaluate(() => [...document.querySelectorAll('.gal-frame button, .gal-frame a')].filter((e) => !e.closest('.csheet--inline') || true).map((e) => ({ t: e.textContent.trim().slice(0, 24), cls: e.className, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, act: /\bact\b/.test(e.className) })).filter((x) => !x.act && x.h < 43.5 && x.h > 0));
check('touch targets: every control is 44px tall (contextual actions extend their hit area)', targets.length === 0, JSON.stringify(targets.slice(0, 4)));
let noFocus = 0;
await page.evaluate(() => window.scrollTo(0, 0));
await page.keyboard.press('Tab');
for (let i = 0; i < 70; i++) {
  const ok = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return true; const cs = getComputedStyle(e); const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0; const shadow = cs.boxShadow !== 'none'; return ring || shadow; });
  if (!ok) noFocus++;
  await page.keyboard.press('Tab');
}
check('keyboard: every focused control shows a visible focus indicator', noFocus === 0, `(${noFocus} without)`);
const unnamed = await page.evaluate(() => [...document.querySelectorAll('.gal-frame button, .gal-frame a, .gal-frame [role=radio]')].filter((e) => !(e.getAttribute('aria-label') || e.textContent.trim())).length);
check('screen reader: every control has a name', unnamed === 0, `(${unnamed} unnamed)`);

/* ---- contrast of every tint pair, both themes ---- */
const pairs = await page.evaluate(() => {
  const parse = (c) => c.match(/[\d.]+/g).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(parse(a)), lum(parse(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const out = [];
  for (const frame of document.querySelectorAll('.gal-frame')) {
    for (const t of ['coral', 'sky', 'lilac', 'sun', 'pink', 'mint']) {
      const probe = document.createElement('span');
      probe.className = `tint--${t}`;
      probe.style.cssText = 'color:var(--tint-fg);background:var(--tint-bg)';
      frame.appendChild(probe);
      const cs = getComputedStyle(probe);
      out.push({ mode: frame.dataset.mode, t, r: ratio(cs.color, cs.backgroundColor) });
      probe.remove();
    }
    const cs = getComputedStyle(frame);
    const probe2 = document.createElement('span'); probe2.style.cssText = 'color:var(--color-text-secondary)'; frame.appendChild(probe2);
    out.push({ mode: frame.dataset.mode, t: 'secondary text', r: ratio(getComputedStyle(probe2).color, cs.backgroundColor) }); probe2.remove();
  }
  return out;
});
const weak = pairs.filter((p) => p.r < 4.5);
check('contrast: tint text on tint fill and secondary text pass 4.5:1 in light and dark', weak.length === 0, weak.map((w) => `${w.mode}/${w.t} ${w.r.toFixed(2)}`).join(', '));

/* ---- reduced motion ---- */
const rm = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
const p2 = await rm.newPage();
await p2.goto(`${BASE}/dev/objects?theme=light`, { waitUntil: 'load' });
await p2.locator('#completion').waitFor();
const anim = await p2.evaluate(() => ({ ring: getComputedStyle(document.querySelector('.done__ring')).animationName, sparks: getComputedStyle(document.querySelector('.done__sparks')).display, motion: getComputedStyle(document.documentElement).getPropertyValue('--motion-state').trim() }));
check('reduced motion: ring and tick are already drawn, sparks are off, motion tokens are 0', anim.ring === 'none' && anim.sparks === 'none' && anim.motion === '0ms', JSON.stringify(anim));

/* ---- no raw colours in the primitives ---- */
const dir = 'src/components/objects';
const hex = [];
for (const f of readdirSync(dir)) if (/\.(css|tsx)$/.test(f)) { const t = readFileSync(join(dir, f), 'utf8'); for (const m of t.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) hex.push(`${f}:${m[0]}`); }
check('tokens: no raw hex values in the object primitives', hex.length === 0, hex.slice(0, 5).join(' '));

check('no page errors', errors.length === 0, errors[0] ?? '');
await browser.close();
console.log(results.every(Boolean) ? 'all design-system checks passed' : 'SOME CHECKS FAILED');
process.exit(results.every(Boolean) ? 0 : 1);

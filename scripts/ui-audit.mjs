// Full UI audit: top + bottom-scroll shots and a bottom-overlap measurement for every screen.
// Usage: node scripts/ui-audit.mjs <outDir> [--w=390,320] [--theme=light] [--only=home]
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const out = process.argv[2] ?? '/tmp/ui-audit';
const BASE = 'http://localhost:5174';
const widths = arg('w', '390').split(',').map(Number);
const themes = arg('theme', 'light').split(',');
const only = arg('only', '').split(',').filter(Boolean);
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...(existsSync('/tmp/detail-ids.json') ? JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) : {}) };
mkdirSync(out, { recursive: true });
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
let state = JSON.parse(readFileSync('/tmp/detail-state.json', 'utf8'));
const screens = [
  ['home', '/app/home'], ['pacts', '/app/pacts'], ['circles', '/app/circles'], ['activity', '/app/activity'], ['profile', '/app/profile'],
  ['wallet', '/app/wallet'], ['notifications', '/app/notifications'], ['topup', '/app/topup'], ['withdraw', '/app/wallet/withdraw'],
  ['circle', `/app/circles/${ids.boys}`], ['ask-open', `/app/asks/${ids.askOpen}`], ['ask-answered', `/app/asks/${ids.askAnswered}`],
  ['plan-open', `/app/plans/${ids.planOpen}`], ['split-open', `/app/splits/${ids.splitOpen}`], ['split-settled', `/app/splits/${ids.splitSettled}`],
  ['pact-active', `/app/pact/${ids.pactActive}`], ['pact-completed', ids.pactCompleted && `/app/pact/${ids.pactCompleted}`],
  ['create', '/app/create'], ['circle-new', '/app/circles/new'], ['ask-new', '/app/asks/new'], ['plan-new', '/app/plans/new'],
].filter(([n, p]) => p && (!only.length || only.some((o) => n.startsWith(o))));
const report = [];
for (const theme of themes) for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, storageState: JSON.parse(readFileSync('/tmp/detail-state.json', 'utf8')) });
  await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), theme);
  const page = await ctx.newPage();
  for (const [name, path] of screens) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const tag = `${out}/${width}-${theme}-${name}`;
    await page.screenshot({ path: `${tag}-top.png` });
    const r = await page.evaluate(async () => {
      const sc = document.querySelector('.screen');
      if (!sc) return { noScreen: true };
      sc.scrollTop = sc.scrollHeight;
      await new Promise((res) => setTimeout(res, 500));
      const guards = [...sc.querySelectorAll('.tabbar__pill, .screen__footer')].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0);
      const guardTop = guards.length ? Math.min(...guards.map((b) => b.top)) : innerHeight;
      // Content that is visible, has paint, and extends below the top of the sticky chrome.
      const hits = [];
      for (const el of sc.querySelectorAll('.screen__content *')) {
        if (el.closest('.tabbar, .screen__footer')) continue;
        const b = el.getBoundingClientRect();
        if (b.width < 4 || b.height < 4 || b.bottom < 0 || b.top > innerHeight) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') continue;
        const leaf = !el.children.length && el.textContent.trim();
        const ctl = el.matches('button, a, input, [role=button]');
        if (!(leaf || ctl)) continue;
        if (b.bottom > guardTop + 1 && b.top < innerHeight) hits.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 40), text: el.textContent.trim().slice(0, 30), under: Math.round(b.bottom - guardTop) });
      }
      return { guardTop: Math.round(guardTop), hasTabbar: !!sc.querySelector('.tabbar'), hasFooter: !!sc.querySelector('.screen__footer'), overlapCount: hits.length, hits: hits.slice(0, 6), scrollable: sc.scrollHeight > sc.clientHeight + 4 };
    });
    await page.screenshot({ path: `${tag}-bottom.png` });
    report.push({ width, theme, name, ...r });
    if (r.overlapCount) console.log('OVERLAP', width, name, JSON.stringify(r.hits));
  }
  writeFileSync('/tmp/detail-state.json', JSON.stringify(await ctx.storageState()));
  await ctx.close();
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log('done', report.length, 'screens;', report.filter((r) => r.overlapCount).length, 'with overlap');
await browser.close();

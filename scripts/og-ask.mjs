// The one share card used for every shared Ask link (1200x630). Run: node --import tsx scripts/og-ask.mjs
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { markSvg } from '../src/components/brand/geometry.ts';

const INK = '#0F1713', MINT = '#3DD68C', PAPER = '#F6F4EF';
const font = readFileSync('node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2').toString('base64');
const bar = (label, n, w, on) => `<div class="row"><div class="fill" style="width:${w}%;background:${on ? '#bdeed6' : '#ece9e2'}"></div><b>${label}</b><i>${n}</i></div>`;
const html = `<html><head><style>
@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:${PAPER};font-family:Geist,system-ui;color:${INK};display:grid;grid-template-columns:1fr 520px;align-items:center;padding:0 88px;gap:56px;
background-image:radial-gradient(closest-side at 92% 12%,#fff3cf,transparent 70%),radial-gradient(closest-side at 70% 100%,#d9f6e8,transparent 70%)}
.brand{display:flex;align-items:center;gap:18px;margin-bottom:44px}.brand svg{width:64px;height:64px}.brand b{font-size:54px;letter-spacing:.06em}
h1{font-size:84px;letter-spacing:-.045em;line-height:1.02;font-weight:700}
p{margin-top:28px;font-size:34px;color:#4a544f}
.card{background:#fff;border-radius:40px;padding:36px;box-shadow:0 20px 60px #0f171318,inset 0 0 0 2px #e6e2d8}
.tag{font-size:22px;letter-spacing:.08em;color:#4a544f;font-weight:600;margin-bottom:18px}
.q{font-size:38px;font-weight:700;letter-spacing:-.02em;margin-bottom:22px}
.row{position:relative;height:68px;border-radius:22px;background:#faf9f6;box-shadow:inset 0 0 0 2px #e6e2d8;margin-bottom:12px;overflow:hidden;display:flex;align-items:center;padding:0 22px;justify-content:space-between;font-size:28px}
.fill{position:absolute;inset:0 auto 0 0}.row b,.row i{position:relative;font-style:normal}.row b{font-weight:650}
.foot{margin-top:18px;font-size:26px;font-weight:650}
</style></head><body>
<div><div class="brand">${markSvg({ colors: [INK, MINT, '#FFC53D', '#FF7A5C'] })}<b>PACT</b></div><h1>One tap.<br>The group decides.</h1><p>Open the link, answer, see where everyone landed.</p></div>
<div class="card"><div class="tag">THE BOYS 🍻</div><div class="q">Where should we stay?</div>${bar('Labadi', 4, 100, true)}${bar('East Legon', 2, 50)}${bar('Osu', 1, 25)}<div class="foot">7 people are deciding →</div></div>
</body></html>`;
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/brand/og-ask.png' });
await browser.close();
console.log('wrote public/brand/og-ask.png');

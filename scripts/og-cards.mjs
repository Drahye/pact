// The share cards for every kind of shared link (1200x630): plan, split, Circle invite, recap. (The Ask card is scripts/og-ask.mjs.)
// Each shows an illustration of the kind of thing, never anyone's real title, name or amount. Run: node --import tsx scripts/og-cards.mjs
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { markSvg } from '../src/components/brand/geometry.ts';

const INK = '#0F1713', MINT = '#3DD68C', PAPER = '#F6F4EF';
const font = readFileSync('node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2').toString('base64');
const css = (wash) => `
@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:${PAPER};font-family:Geist,system-ui;color:${INK};display:grid;grid-template-columns:1fr 520px;align-items:center;padding:0 88px;gap:56px;background-image:${wash}}
.brand{display:flex;align-items:center;gap:18px;margin-bottom:44px}.brand svg{width:64px;height:64px}.brand b{font-size:54px;letter-spacing:.06em}
h1{font-size:80px;letter-spacing:-.045em;line-height:1.02;font-weight:700}
p.s{margin-top:28px;font-size:34px;color:#4a544f}
.card{background:#fff;border-radius:40px;padding:36px;box-shadow:0 20px 60px #0f171318,inset 0 0 0 2px #e6e2d8}
.tag{font-size:22px;letter-spacing:.08em;color:#4a544f;font-weight:600;margin-bottom:18px}
.foot{margin-top:18px;font-size:26px;font-weight:650}`;
const left = (h, s) => `<div><div class="brand">${markSvg({ colors: [INK, MINT, '#FFC53D', '#FF7A5C'] })}<b>PACT</b></div><h1>${h}</h1><p class="s">${s}</p></div>`;
const faces = (cols) => cols.map((c, i) => `<i style="display:inline-grid;place-items:center;width:64px;height:64px;border-radius:50%;background:${c};margin-left:${i ? -16 : 0}px;box-shadow:0 0 0 4px #fff;font-style:normal;font-weight:700;font-size:26px">${'ASDMT'[i]}</i>`).join('');

const cards = {
  'og-plan': {
    wash: 'radial-gradient(closest-side at 92% 12%,#ffe9b0,transparent 70%),radial-gradient(closest-side at 70% 100%,#fff3cf,transparent 70%)',
    html: `${left('Are you<br>coming?', 'One tap to say you’re in, and see who else is.')}<div class="card"><div class="tag">A PLAN</div>
<div style="display:flex;gap:26px;align-items:center"><div style="width:130px;height:150px;border-radius:30px;background:#fff0c2;display:grid;place-items:center;text-align:center;color:#8a5a00;line-height:1"><div><div style="font-size:22px;font-weight:700;letter-spacing:.08em">SAT</div><div style="font-size:72px;font-weight:700;margin:6px 0">21</div><div style="font-size:22px;font-weight:700;letter-spacing:.08em">NOV</div></div></div>
<div><div style="font-size:42px;font-weight:700;letter-spacing:-.02em">Weekend away</div><div style="font-size:26px;color:#4a544f;margin-top:8px">Date · place</div></div></div>
<div style="margin-top:26px">${faces(['#d9f6e8', '#fde0d4', '#dbe9f3', '#e6e1f4'])}</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:26px;background:#efece5;border-radius:22px;padding:6px;font-size:28px;font-weight:650;text-align:center"><div style="background:${INK};color:#fff;border-radius:18px;padding:16px 0">I’m in</div><div style="padding:16px 0;color:#4a544f">Maybe</div><div style="padding:16px 0;color:#4a544f">Can’t</div></div></div>`,
  },
  'og-split': {
    wash: 'radial-gradient(closest-side at 92% 12%,#e8e0ff,transparent 70%),radial-gradient(closest-side at 70% 100%,#f1edff,transparent 70%)',
    html: `${left('Settle up,<br>no awkward.', 'See where a shared expense stands.')}<div class="card" style="background:#f6f2ff"><div class="tag" style="color:#6a4fd8">A SPLIT</div>
<div style="font-size:42px;font-weight:700;letter-spacing:-.02em">Shared expense</div><div style="font-size:92px;font-weight:700;letter-spacing:-.05em;margin:12px 0 18px">₦ • • •</div>
<div style="display:flex;gap:10px"><i style="flex:1;height:18px;border-radius:9px;background:#9b7bff"></i><i style="flex:1;height:18px;border-radius:9px;background:#9b7bff"></i><i style="flex:1;height:18px;border-radius:9px;background:#e1d8ff"></i><i style="flex:1;height:18px;border-radius:9px;background:#e1d8ff"></i></div>
<div class="foot">2 of 4 settled</div></div>`,
  },
  'og-circle': {
    wash: 'radial-gradient(closest-side at 92% 12%,#cfe4ff,transparent 70%),radial-gradient(closest-side at 70% 100%,#d9f6e8,transparent 70%)',
    html: `${left('You’re<br>invited.', 'Join a group of people doing things together.')}<div class="card" style="background:linear-gradient(160deg,#d6e8ff,#f1f7ff);text-align:left"><div style="width:130px;height:130px;border-radius:50%;background:#fff;display:grid;place-items:center;font-size:72px;box-shadow:inset 0 0 0 3px #bfd9f7">👥</div>
<div style="font-size:60px;font-weight:700;letter-spacing:-.04em;margin:26px 0 10px">A Circle</div><div style="margin-bottom:18px">${faces(['#d9f6e8', '#fde0d4', '#dbe9f3', '#e6e1f4', '#f0e6cc'])}</div><div class="foot" style="margin:0">Plans, questions and splits, together</div></div>`,
  },
  'og-recap': {
    wash: 'radial-gradient(closest-side at 92% 12%,#d9f6e8,transparent 70%),radial-gradient(closest-side at 70% 100%,#e3f7ec,transparent 70%)',
    html: `${left('We made<br>it happen.', 'A group did something together. See how.')}<div class="card" style="background:${INK};color:#fff;box-shadow:0 20px 60px #0f171340"><div style="width:84px;height:84px;border-radius:50%;border:8px solid ${MINT};display:grid;place-items:center;font-size:44px;color:${MINT}">✓</div>
<div style="font-size:58px;font-weight:700;letter-spacing:-.04em;margin:28px 0 22px;color:#9be8c4">Done, together.</div><div style="display:flex;gap:40px;font-size:30px;color:#c9d2cc"><div><b style="display:block;font-size:56px;color:#fff">•</b>people</div><div><b style="display:block;font-size:56px;color:#fff">•</b>decisions</div><div><b style="display:block;font-size:56px;color:#fff">•</b>tasks</div></div></div>`,
  },
};
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [name, c] of Object.entries(cards)) {
  await page.setContent(`<html><head><style>${css(c.wash)}</style></head><body>${c.html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/brand/${name}.png` });
  console.log('wrote', `public/brand/${name}.png`);
}
await browser.close();

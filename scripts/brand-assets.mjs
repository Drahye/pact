// Draws every static brand asset from the one mark definition in src/components/brand/geometry.ts:
// favicon, app icons, manifest and the social card. Run after changing the mark:
//   node --import tsx scripts/brand-assets.mjs
import { chromium } from 'playwright';
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { markSvg } from '../src/components/brand/geometry.ts';

const INK = '#0F1713';
const MINT = '#3DD68C';
const PAPER = '#F6F4EF';
mkdirSync('public/brand', { recursive: true });
mkdirSync('public/icons', { recursive: true });
const write = (path, data) => (writeFileSync(path, data), console.log('wrote', path));

// Standalone marks (transparent background): ink for light surfaces, white for dark, accents for expressive moments.
write('public/brand/pact-mark.svg', markSvg({ colors: INK }));
write('public/brand/pact-mark-light.svg', markSvg({ colors: '#FFFFFF' }));
write('public/brand/pact-mark-color.svg', markSvg({ colors: [INK, MINT, '#FFC53D', '#FF7A5C'] }));

// The browser tab icon: the mark only, on an ink tile, never the wordmark shrunk down.
const tile = markSvg({ colors: MINT, tile: { fill: INK, radius: 9 } });
write('public/favicon.svg', tile);

// PNG icons. Rounded for the web, square (full bleed) for Apple and maskable icons, which the OS shapes itself.
const png = (svg, size, path) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(path).then(() => console.log('wrote', path));
for (const size of [16, 32, 48, 192, 512]) await png(tile, size, `public/icons/icon-${size}.png`);
const square = markSvg({ colors: MINT, tile: { fill: INK, radius: 0 } });
await png(square, 180, 'public/icons/apple-touch-icon.png');
// Maskable: the mark inside the central 60% so any mask shape keeps it whole.
await png(markSvg({ colors: MINT, tile: { fill: INK, radius: 0 }, inset: 0.2 }), 512, 'public/icons/maskable-512.png');

write(
  'public/manifest.webmanifest',
  JSON.stringify(
    {
      name: 'PACT',
      short_name: 'PACT',
      description: 'Make it happen together. The people, money, tasks and deadline for a group plan, in one place.',
      start_url: '/app',
      scope: '/',
      display: 'standalone',
      background_color: PAPER,
      theme_color: PAPER,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  ) + '\n',
);

// Social card, rendered with the product's own typeface.
const font = readFileSync('node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2').toString('base64');
const html = `<html><head><style>
@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:${PAPER};font-family:Geist,system-ui;color:${INK};display:flex;flex-direction:column;justify-content:center;padding:0 96px;gap:36px;
background-image:radial-gradient(closest-side at 88% 20%,#fff3cf,transparent 70%),radial-gradient(closest-side at 80% 90%,#ffe3f1,transparent 70%)}
.brand{display:flex;align-items:center;gap:22px}
.brand svg{width:96px;height:96px}
.brand b{font-size:84px;letter-spacing:.06em;font-weight:700}
h1{font-size:92px;letter-spacing:-.045em;line-height:1;font-weight:700;max-width:960px}
h1 span{background:#ffc53d;border-radius:.25em;padding:0 .14em}
p{font-size:34px;color:#4a544f;max-width:880px;line-height:1.3}
</style></head><body>
<div class="brand">${markSvg({ colors: [INK, MINT, '#FFC53D', '#FF7A5C'] })}<b>PACT</b></div>
<h1>Make it happen <span>together</span>.</h1>
<p>The people, money, tasks and deadline for a group plan, in one place.</p></body></html>`;
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/brand/og.png' });
await browser.close();
console.log('wrote public/brand/og.png');

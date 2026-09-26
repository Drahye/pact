// Records a captioned walkthrough of the live app (needs `npm run dev` on a freshly seeded database).
// Story: a friend joins Sarah's Birthday from an invite link, takes a task and pays straight in
// to complete the goal; then the organiser releases the funds and adds the memory.
// Usage: node scripts/demo-video.mjs [outDir]   → <outDir>/pact-demo.webm
import { chromium } from 'playwright';
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] ?? 'exports/demo';
mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:5173';
const W = 720;
const H = 1080;

/* ---------- setup: find Sarah's Birthday invite code as the organiser, via the API ---------- */
const j = async (path, body, token) => {
  const r = await fetch(`${BASE}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};
const otp = await j('/auth/otp/request', { phone: '08010000001' });
const auth = await j('/auth/otp/verify', { phone: '08010000001', code: otp.devCode });
const pacts = await j('/pacts', undefined, auth.accessToken);
const sarah = pacts.data.find((p) => p.title === "Sarah's Birthday");
if (!sarah || sarah.status !== 'open') throw new Error('Reset the database first: Sarah’s Birthday must be open (npm run db:reset, restart dev).');
const code = sarah.inviteCode;

/* ---------- recording ---------- */
const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});
const context = await browser.newContext({
  viewport: { width: W, height: H },
  // Video frames are captured at CSS pixel size, so record at exactly the viewport.
  recordVideo: { dir: out, size: { width: W, height: H } },
});

// Caption bar under the phone, a title card, and a tap marker. Re-created on every load.
await context.addInitScript(() => {
  const css = `
    #demo-cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:12px;
      max-width:660px;padding:12px 20px;border-radius:999px;background:#0f1713;color:#fbfaf7;font:600 17px/1.3 'Geist Variable',system-ui;
      letter-spacing:-.01em;box-shadow:0 12px 30px -12px rgba(15,23,19,.5);transition:opacity .3s, transform .3s;opacity:0}
    #demo-cap.on{opacity:1}
    #demo-cap b{display:grid;place-items:center;min-width:26px;height:26px;border-radius:50%;background:#3dd68c;color:#0f1713;font-size:13px}
    #demo-card{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
      background:#f6f4ef;color:#0f1713;font-family:'Geist Variable',system-ui;text-align:center;transition:opacity .5s;opacity:0;pointer-events:none}
    #demo-card.on{opacity:1}
    #demo-card h1{font-size:64px;letter-spacing:-.045em;line-height:1}
    #demo-card h1 span{background:#ffc53d;border-radius:.3em;padding:0 .15em}
    #demo-card p{font-size:22px;color:#4a544f;max-width:520px}
    #demo-card small{font-size:15px;color:#676f6a;margin-top:18px}
    .demo-tap{position:fixed;z-index:99998;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;
      background:rgba(61,214,140,.35);border:2px solid #22b872;pointer-events:none;animation:demo-tap .7s ease-out forwards}
    @keyframes demo-tap{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.5);opacity:0}}`;
  const mount = () => {
    if (document.getElementById('demo-cap')) return;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
    const cap = document.createElement('div');
    cap.id = 'demo-cap';
    document.body.appendChild(cap);
    const card = document.createElement('div');
    card.id = 'demo-card';
    document.body.appendChild(card);
  };
  window.__cap = (text, n) => {
    mount();
    const el = document.getElementById('demo-cap');
    el.classList.remove('on');
    setTimeout(() => {
      el.innerHTML = text ? `${n ? `<b>${n}</b>` : ''}<span>${text}</span>` : '';
      if (text) el.classList.add('on');
    }, 200);
  };
  window.__card = (html) => {
    mount();
    const el = document.getElementById('demo-card');
    if (html) el.innerHTML = html;
    el.classList.toggle('on', !!html);
  };
  window.__tap = (x, y) => {
    const d = document.createElement('div');
    d.className = 'demo-tap';
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 800);
  };
  document.addEventListener('DOMContentLoaded', mount);
});

const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);
let step = 0;
const cap = async (text, hold = 1800) => {
  await page.evaluate(([t, n]) => window.__cap(t, n), [text, ++step]);
  await wait(hold);
};
const card = async (html, hold = 2600) => {
  await page.evaluate((h) => window.__card(h), html);
  await wait(hold);
};
const tap = async (locator, after = 900) => {
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.evaluate(([x, y]) => window.__tap(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
  await wait(320);
  await locator.click();
  await wait(after);
};
const btn = (name) => page.getByRole('button', { name }).first();
const lnk = (name) => page.getByRole('link', { name }).first();
const typeSlow = async (locator, text) => {
  await tap(locator, 200);
  await locator.pressSequentially(text, { delay: 90 });
  await wait(500);
};
const pin = async (digits) => {
  for (const d of digits) await tap(page.getByRole('button', { name: d, exact: true }).last(), 180);
};
const hold = async (locator) => {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([a, b]) => window.__tap(a, b), [x, y]);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await wait(1250);
  await page.mouse.up();
  await wait(900);
};

try {
  // Title
  await page.goto(`${BASE}/app/join/${code}`, { waitUntil: 'load' });
  await card(`<h1>pact</h1><p>Make it happen <span>together</span>.</p><small>Product walkthrough · sandbox payments, no real money</small>`, 3200);
  await card('', 600);

  // 1. The invite
  await page.getByText('invited you to').waitFor();
  await cap('Abraham shares an invite in the group chat. Anyone can see what it’s for.', 3000);
  await page.getByText('How do you want to show up?').scrollIntoViewIfNeeded();
  await cap('Money is one way to show up. A task is another.', 2200);
  await tap(page.getByRole('radio', { name: /Contributing and taking a task/ }), 900);
  await tap(btn('Sign up to join'));

  // 2. Sign up
  await cap('Signing up takes a phone number and a one-time code.', 1200);
  await typeSlow(page.getByLabel('Mobile number'), '8035550142');
  await tap(btn('Send code'), 1400);
  await tap(btn('Fill it in'), 1500);
  await typeSlow(page.getByLabel('First name'), 'Ngozi');
  await typeSlow(page.getByLabel('Last name'), 'Adebayo');
  await tap(btn('Continue'), 1000);
  await cap('A 4-digit PIN approves every payment.', 1400);
  await pin('2580');
  await wait(700);
  await pin('2580');
  await page.getByText('Join this Pact').waitFor();
  await tap(btn('Join this Pact'), 2000);

  // 3. The plan
  await page.locator('.detail__ring').waitFor();
  await cap('One goal, one ring. Every colour is someone’s part.', 2600);
  await page.locator('.attention').scrollIntoViewIfNeeded();
  await cap('PACT shows what needs attention, so nobody has to chase.', 2800);
  await tap(page.locator('.attention__action').filter({ hasText: 'I’ll do it' }).first(), 1600);
  await cap('Ngozi takes the photography. That counts as showing up too.', 2400);
  await page.locator('.budget').scrollIntoViewIfNeeded();
  await cap('The plan: what the money covers, and what’s already funded.', 2800);
  await page.locator('.tasks').scrollIntoViewIfNeeded();
  await wait(1600);

  // 4. Cover the rest by paying straight in
  await page.goto(`${page.url()}/contribute?amount=180000`);
  await page.getByText('From your wallet').waitFor();
  await cap('She covers the rest. No wallet balance needed: pay straight into the Pact.', 3000);
  await tap(page.getByRole('link', { name: /Pay ₦180,000 by transfer or card/ }), 1400);
  await cap('Bank transfer is free. Cards show their 1.5% fee before you pay.', 2600);
  await tap(btn(/Pay ₦180,000/), 1400);
  await cap('Sandbox checkout. In production this is Paystack’s secure page.', 2400);
  await cap('Nothing counts until the processor confirms to our server.', 2200);
  await tap(btn('I’ve sent the money'), 1800);
  await page.getByText('You’re in.').waitFor();
  await cap('And that completed the goal. Everyone is told.', 2600);
  await tap(btn('Back to the Pact'), 3000);
  await cap('We did it: nine people, one plan, nobody chased anybody.', 3200);

  // 5. The organiser
  await page.goto(`${BASE}/app/profile`);
  await cap('Now the organiser’s side.', 1400);
  await tap(btn('Sign out'), 600);
  await page.goto(`${BASE}/app/auth/phone`);
  await wait(800);
  await typeSlow(page.getByLabel('Mobile number'), '8010000001');
  await tap(btn('Send code'), 1200);
  await tap(btn('Fill it in'), 2200);
  await cap('Abraham’s home: what needs him, and his Pacts.', 2600);
  await tap(lnk('Pacts'), 1200);
  await tap(page.getByRole('link', { name: /Sarah/ }).first(), 2400);
  await cap('Only a BVN-verified organiser can release the money.', 2400);
  await tap(btn(/Release ₦500,000/), 1400);
  await pin('1357');
  await wait(1600);
  await cap('It lands in his wallet, and every member is told.', 2400);

  // 6. The memory
  await page.locator('.memory').scrollIntoViewIfNeeded();
  await cap('Afterwards, the group keeps the memory. Only people in the Pact can see it.', 2600);
  await tap(page.getByRole('button', { name: /Add the memory/ }), 1000);
  await typeSlow(page.getByLabel('How did it go?'), 'Sarah cried twice. The cake survived the drive.');
  const photo = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#ffc53d' } })
    .composite([{ input: Buffer.from('<svg width="900" height="700"><circle cx="450" cy="350" r="220" fill="#ff7a5c"/><circle cx="450" cy="350" r="120" fill="#3dd68c"/></svg>') }])
    .jpeg()
    .toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'party.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByText('Photos · 1/6').waitFor({ timeout: 15000 });
  await cap('Photos are checked, re-encoded and stripped of location data.', 2600);
  await tap(btn('Save'), 1600);
  await page.locator('.memory__grid img').first().waitFor({ timeout: 15000 });
  await page.locator('.memory').scrollIntoViewIfNeeded();
  await wait(2600);

  // End
  await page.evaluate(() => window.__cap(''));
  await card(`<h1>pact</h1><p>Make the plan. Make it happen <span>together</span>.</p><small>Web app live now · iOS and Android coming soon</small>`, 3600);
} catch (err) {
  await page.screenshot({ path: `${out}/demo-FAILED.png` });
  console.error('FAILED at caption', step, err.message);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  const vid = readdirSync(out).filter((f) => f.endsWith('.webm') && f !== 'pact-demo.webm').pop();
  if (vid) renameSync(`${out}/${vid}`, `${out}/pact-demo.webm`);
  console.log('video:', `${out}/pact-demo.webm`);
}

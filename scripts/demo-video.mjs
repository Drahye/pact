// Records a captioned walkthrough of the live app (needs `npm run dev` on a freshly seeded database).
// Story: a friend joins Sarah's Birthday from an invite link, tops up, completes the goal;
// then the organiser releases the funds and withdraws to their bank.
// Usage: node scripts/demo-video.mjs [outDir]   → <outDir>/pact-demo.webm
import { chromium } from 'playwright';
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
  await card(`<h1>pact</h1><p>Plan it <span>together</span>. Fund it together.</p><small>Product walkthrough · sandbox payments, no real money</small>`, 3200);
  await card('', 600);

  // 1. Invite link
  await page.getByText('invited you to').waitFor();
  await cap('Abraham drops an invite link in the group chat. Anyone can see what it’s for.', 3200);
  await tap(btn('Sign up to join'));

  // 2. Sign up
  await cap('Signing up takes a phone number…', 1200);
  await typeSlow(page.getByLabel('Mobile number'), '8035550142');
  await tap(btn('Send code'), 1400);
  await cap('…and a one-time SMS code. The sandbox shows it on screen.', 2200);
  await tap(btn('Fill it in'), 1500);
  await cap('Name as on your bank account, so withdrawals always go through.', 1400);
  await typeSlow(page.getByLabel('First name'), 'Ngozi');
  await typeSlow(page.getByLabel('Last name'), 'Adebayo');
  await tap(btn('Continue'), 1000);
  await cap('A 4-digit PIN approves every payment. Weak PINs are refused.', 1600);
  await pin('2580');
  await wait(700);
  await pin('2580');
  await page.getByText('Join this Pact').waitFor();
  await cap('Back to the invite, signed in.', 1600);
  await tap(btn('Join this Pact'), 1800);

  // 3. The Pact
  await page.getByText('Tap a colour to see who gave it').waitFor();
  await cap('One goal, one ring. Every colour is a person’s money.', 2600);
  await tap(page.locator('.person').nth(1), 2000);
  await tap(page.locator('.person').nth(1), 600);
  await page.locator('.detail__rule').scrollIntoViewIfNeeded();
  await cap('The rule for a missed goal is set up front and runs by itself.', 3000);
  await tap(lnk('Contribute'), 1400);

  // 4. Short on funds → top up the difference
  await tap(btn(/Cover the rest/), 1200);
  await cap('Ngozi covers the rest. Her wallet is empty, so PACT offers to top up the difference.', 3200);
  await tap(lnk(/Top up ₦180,000/), 1400);
  await cap('Bank transfer is free. Cards carry a 1.5% fee, shown before you pay.', 3000);
  await tap(btn(/Pay ₦180,000/), 1600);
  await cap('Sandbox checkout. In production this is Paystack’s secure page.', 2600);
  await cap('The wallet is credited only when the processor confirms to our server.', 2400);
  await tap(btn('I’ve sent the money'), 1800);
  await page.getByText('Money added').waitFor();
  await wait(1200);
  await tap(btn('Continue to contribute'), 1400);

  // 5. Contribute: hold, then PIN
  await tap(btn(/Cover the rest/), 1000);
  await cap('Press and hold to contribute. Letting go early cancels.', 1800);
  await hold(page.locator('.hold'));
  await cap('Then the PIN. A retry can never charge twice.', 1400);
  await pin('2580');
  await page.getByText('You’re in.').waitFor();
  await cap('Done, and it completed the goal. Everyone in the Pact is notified.', 3200);
  await tap(btn('See it complete'), 3200);
  await cap('₦500,000, from nine people. Nobody had to chase anybody.', 3000);

  // 6. Organiser
  await page.goto(`${BASE}/app/profile`);
  await cap('Now the organiser’s side.', 1600);
  await tap(btn('Sign out'), 600);
  // Straight to sign-in: Welcome's live 3D scene is slow under headless software rendering.
  await page.goto(`${BASE}/app/auth/phone`);
  await wait(800);
  await typeSlow(page.getByLabel('Mobile number'), '8010000001');
  await tap(btn('Send code'), 1200);
  await tap(btn('Fill it in'), 2200);
  await cap('Abraham’s home: wallet, open Pacts, and a new notification.', 2600);
  await tap(page.getByRole('link', { name: /Notifications/ }), 1400);
  await cap('Every movement of money shows up here.', 2400);
  await tap(page.getByRole('button', { name: 'Back' }), 900);
  await tap(lnk('Pacts'), 1200);
  await tap(page.getByRole('link', { name: /Sarah/ }), 2400);
  await cap('Funded. Only a BVN-verified organiser can release the money.', 2600);
  await tap(btn(/Release ₦500,000/), 1400);
  await pin('1357');
  await wait(1600);
  await cap('The pool moves to his wallet, and everyone is told.', 2600);

  // 7. Wallet and withdrawal
  await tap(page.getByRole('button', { name: 'Back' }), 1200);
  await tap(lnk('Wallet'), 1800);
  await cap('Full history, every line with a receipt.', 2600);
  await tap(page.locator('.txn').first(), 2400);
  await page.keyboard.press('Escape');
  await wait(600);
  await tap(page.locator('.wallet-card').getByRole('link', { name: 'Withdraw' }), 1400);
  await tap(page.locator('.screen__footer').getByRole('button', { name: 'Add a bank account' }), 1000);
  await page.getByLabel('Bank', { exact: true }).selectOption('058');
  await wait(600);
  await typeSlow(page.getByLabel('Account number'), '0123456789');
  await page.getByText('ABRAHAM OKAFOR').waitFor();
  await cap('The account name is checked. Withdrawals only go to your own name.', 2800);
  await tap(btn('Save account'), 1000);
  await pin('1357');
  await wait(1200);
  await typeSlow(page.getByLabel('Amount', { exact: true }), '100000');
  await cap('A flat ₦50 fee, shown up front.', 2000);
  await tap(btn(/Withdraw ₦100,000/), 1000);
  await pin('1357');
  await page.getByText('On its way').waitFor({ timeout: 15000 });
  await cap('Sent. If the bank ever returns it, the money and fee come straight back.', 3200);

  // End
  await page.evaluate(() => window.__cap(''));
  await card(`<h1>pact</h1><p>Money works <span>better</span> together.</p><small>Web app live now · iOS and Android coming soon</small>`, 3600);
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

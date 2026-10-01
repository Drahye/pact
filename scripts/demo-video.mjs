// Records a captioned walkthrough of the live app (needs the app running on a freshly seeded database).
// Story: Abraham plans a Lagos weekend (budget, tasks, a draft that survives a reload, an account number
// anyone can pay), a friend joins from the invite and pledges then pays, Abraham completes the goal from his
// wallet, pays a vendor straight from the Pact, releases the rest, withdraws to his bank, checks his devices
// and keeps the memory.
// Usage: DEMO_BASE=http://localhost:5173 node scripts/demo-video.mjs [outDir]   → <outDir>/pact-demo.webm
import { chromium } from 'playwright';
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { INTRO, OUTRO, chapterSpeech, lineId } from './lib/demo-lines.mjs';

const out = process.argv[2] ?? 'exports/demo';
mkdirSync(out, { recursive: true });
const BASE = process.env.DEMO_BASE ?? 'http://localhost:5173';
const W = 720;
const H = 1080;

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
const t0 = Date.now(); // the video starts here; narration timestamps are relative to it

// Narration: lines come from `node scripts/demo-voice.mjs`. Each caption waits for its line to finish.
const NARRATE = process.env.DEMO_NARRATE !== '0';
const voiceIndex = NARRATE ? JSON.parse(readFileSync('exports/voice/index.json', 'utf8')) : {};
const narration = [];
const speak = (text) => {
  if (!NARRATE || !text) return 0;
  const e = voiceIndex[lineId(text)];
  if (!e) throw new Error(`No narration for “${text.slice(0, 50)}”. Run: node scripts/demo-voice.mjs`);
  narration.push({ ms: Date.now() - t0, file: e.file, text });
  return e.seconds * 1000;
};
// Speech sets the pace when there is some; otherwise the written hold does.
const pause = (hold, spoken) => (spoken ? page.waitForTimeout(Math.max(hold * SPEED, spoken + 450)) : wait(hold));
const SPEED = Number(process.env.DEMO_SPEED ?? 1);
const wait = (ms) => page.waitForTimeout(ms * SPEED);
let step = 0;
let lastCap = '';
const cap = async (text, hold = 1800) => {
  lastCap = text;
  await page.evaluate(([t, n]) => window.__cap(t, n), [text, ++step]);
  await pause(hold, speak(text));
};
const card = async (html, hold = 2600, speech = '') => {
  await page.evaluate((h) => window.__card(h), html);
  await pause(hold, speak(speech));
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
  await locator.pressSequentially(text, { delay: 90 * SPEED });
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
  await page.waitForTimeout(1400); // the button needs a real hold, whatever the playback speed
  await page.mouse.up();
  await wait(900);
};


const chapter = async (n, title, sub) => {
  await page.evaluate(([nn, t, s]) => window.__card(`<small style="margin:0;font-weight:700;letter-spacing:.14em;color:#22b872">CHAPTER ${nn}</small><h1 style="font-size:52px">${t}</h1><p>${s}</p>`), [n, title, sub]);
  await pause(2400, speak(chapterSpeech(n, title, sub)));
  await page.evaluate(() => window.__card(''));
  await wait(500);
};
const signInAs = async (digits) => {
  await page.goto(`${BASE}/app/auth/phone`, { waitUntil: 'load' });
  await page.getByText('What’s your number?').waitFor();
  await wait(600);
  await typeSlow(page.getByLabel('Mobile number'), digits);
  await tap(btn('Send code'), 1300);
  await tap(btn('Fill it in'), 2000);
};
const signOut = async () => {
  await page.goto(`${BASE}/app/profile`, { waitUntil: 'load' });
  await tap(btn('Sign out'), 900);
};
const ABRAHAM = '8010000001';
const NGOZI = '8035550142';
let invite = '';
let pactUrl = '';

try {
  await page.goto(`${BASE}/app`, { waitUntil: 'load' });
  await card(`<h1>pact</h1><p>Make it happen <span>together</span>.</p><small>Product walkthrough · sandbox payments, no real money</small>`, 3200, INTRO);
  await card(
    `<small style="margin:0;font-weight:700;letter-spacing:.14em;color:#22b872">IN THIS WALKTHROUGH</small>
     <p style="text-align:left;font-size:24px;line-height:1.7;color:#0f1713">1 &nbsp;Plan it together<br>2 &nbsp;Bring people in, and let them pay<br>3 &nbsp;A friend joins<br>4 &nbsp;Finish the goal<br>5 &nbsp;Pay vendors from the Pact<br>6 &nbsp;Wallet and security<br>7 &nbsp;Take orders for aso-ebi<br>8 &nbsp;Keep the memory</p>`,
    5800,
  );
  await card('', 600);

  /* ---------- 1. Plan it together ---------- */
  await chapter(1, 'Plan it together', 'Abraham is organising a weekend in Lagos for six friends.');
  await signInAs(ABRAHAM);
  await cap('Abraham signs in with his number and a one-time code. The code fills itself in.', 2600);
  await page.locator('.wallet-strip').waitFor();
  await cap('Home shows what needs him across every Pact.', 2600);

  // Skeleton loaders: hold the Pacts list back for a moment so the loading state is visible.
  let slow = true;
  await page.route('**/api/pacts', async (route) => {
    if (slow) await new Promise((r) => setTimeout(r, 2600));
    await route.continue().catch(() => undefined);
  });
  await tap(lnk('Pacts'), 400);
  await cap('While data loads, PACT shows the shape of what’s coming, not a spinner.', 2400);
  await page.getByRole('heading', { name: /Pacts/ }).first().waitFor();
  slow = false;
  await wait(1400);

  await tap(page.getByRole('link', { name: 'Create a Pact' }), 900);
  await cap('Name it, pick a date, set the money.', 1600);
  await typeSlow(page.getByLabel('Name', { exact: true }), 'Detty December in Lagos');
  await tap(page.getByRole('radio', { name: 'Trip' }), 500);
  await tap(page.getByRole('button', { name: 'In a month' }), 900);
  await cap('Quick date chips, or pick any day.', 1600);

  await cap('Four things are all it takes: a name, a date and roughly how much.', 2400);
  await tap(page.getByRole('button', { name: /Break it into what the money covers/ }), 900);
  await cap('Or break the target into what it covers. Each line is a real cost.', 2400);
  const amount = async (label, value) => {
    const f = page.getByLabel(label);
    await tap(f, 150);
    await f.pressSequentially(value, { delay: 70 });
  };
  await amount('Line 1 amount', '100000');
  await amount('Line 2 amount', '100000');
  await amount('Line 3 amount', '40000');
  await wait(800);
  await cap('Flights, stay and transport add up to a ₦240,000 target.', 2200);

  await tap(page.getByRole('button', { name: /Add things that need doing/ }), 800);
  await tap(page.getByRole('button', { name: /Book the flights/ }), 500);
  await tap(page.getByRole('button', { name: /Choose the accommodation/ }), 700);
  await cap('Tasks count as showing up too, so not everyone has to pay to help.', 2400);

  await page.getByText('Bring your people').scrollIntoViewIfNeeded();
  await tap(page.getByRole('button', { name: /Invite people now/ }), 900);
  await typeSlow(page.getByLabel('Add by phone number'), '08035550142');
  await tap(page.getByRole('button', { name: 'Add', exact: true }), 700);
  await cap('Numbers not on PACT yet get a text with the link.', 2200);
  await tap(btn(/^Add 1 person|^Done/), 900);

  // Saved drafts: life happens mid-form.
  await cap('Your phone rings mid-way. The page reloads…', 1600);
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'load' });
  await page.getByText('We kept what you’d filled in.').waitFor();
  await cap('…and nothing is lost. Forms and sheets save themselves on this device.', 3200);
  await page.evaluate(() => scrollTo(0, 0));
  await wait(800);
  await tap(btn(/Create Pact/), 1800);
  await page.waitForURL(/\/invite/);
  invite = await page.evaluate(() => document.body.innerText.match(/join\/([A-Z0-9]{8})/)?.[1] ?? '');
  await cap('The Pact is live. One link for the group chat, or send it from here.', 2800);

  /* ---------- 2. Bring people in, and let them pay ---------- */
  await chapter(2, 'Bring people in', 'Not everyone has the app. Everyone can still pay.');
  await tap(page.getByRole('link', { name: /Detty December/ }).or(page.getByRole('button', { name: /Back/ })).first(), 1200);
  pactUrl = page.url();
  await cap('Every Pact can have its own bank account number.', 2000);
  await tap(page.getByRole('button', { name: /Get an account number/ }), 1800);
  await page.getByText('Pay by bank transfer').scrollIntoViewIfNeeded();
  await cap('Friends pay from any bank app. No download, no signup.', 2800);
  await tap(btn('Test a transfer'), 900);
  await typeSlow(page.getByLabel('Name on the sender’s bank account'), 'Tunde Bakare');
  const amt = page.getByRole('textbox', { name: 'Amount' });
  await tap(amt, 150);
  await amt.pressSequentially('60000', { delay: 80 });
  await cap('Tunde pays from his bank app. Sandbox stands in for the bank.', 2200);
  await tap(btn(/^Send/), 1800);
  await cap('He isn’t a member, so he shows up as a guest. The organiser can match him later.', 3200);

  /* ---------- 3. A friend joins ---------- */
  await chapter(3, 'A friend joins', 'Ngozi opens the invite from the group chat.');
  await signOut();
  await page.goto(`${BASE}/app/join/${invite}`, { waitUntil: 'load' });
  await page.getByText('invited you to').waitFor();
  await cap('Anyone can see what it’s for, and how far along it is, before signing up.', 3000);
  await page.getByText('Everyone brings something').scrollIntoViewIfNeeded();
  await tap(page.getByRole('radio', { name: /Contributing and taking a task/ }), 900);
  await tap(btn('Sign up to join'), 900);
  await typeSlow(page.getByLabel('Mobile number'), NGOZI);
  await tap(btn('Send code'), 1300);
  await tap(btn('Fill it in'), 1500);
  await typeSlow(page.getByLabel('First name'), 'Ngozi');
  await typeSlow(page.getByLabel('Last name'), 'Adebayo');
  await tap(btn('Continue'), 900);
  await cap('A 4-digit PIN approves every payment.', 1400);
  await pin('2580');
  await wait(700);
  await pin('2580');
  await page.getByText('Join this Pact').waitFor();
  await tap(btn('Join this Pact'), 2000);
  await page.locator('.detail__ring').waitFor();
  await cap('One goal, one ring. Every colour is someone’s part.', 2600);
  await page.locator('.attention').scrollIntoViewIfNeeded();
  await cap('PACT shows what needs attention, so nobody has to chase.', 2600);
  await tap(page.locator('.attention__action').filter({ hasText: 'I’ll do it' }).first(), 1500);
  await cap('Ngozi takes the flights. That counts as showing up.', 2200);
  await page.locator('.budget').scrollIntoViewIfNeeded();
  await cap('The plan fills line by line as money comes in.', 2600);

  await page.evaluate(() => scrollTo(0, 0));
  await wait(600);
  await tap(page.getByRole('button', { name: /Can’t pay yet/ }), 1000);
  const how = page.getByRole('textbox', { name: 'How much' });
  await tap(how, 150);
  await how.fill('');
  await how.pressSequentially('100000', { delay: 70 * SPEED });
  await tap(page.getByRole('radio', { name: 'In 3 days' }), 800);
  await cap('Can’t pay yet? Pick an amount and a date. PACT reminds you, so nobody chases.', 3200);
  await tap(btn(/^Remind me · ₦/), 1800);
  await cap('The group sees her pay date next to her name.', 2200);
  await tap(btn('Pay now'), 1400);
  await page.getByText('Pay with').waitFor();
  await cap('She pays now instead: straight into the Pact, no wallet balance needed.', 2800);
  await tap(page.getByRole('link', { name: /by transfer or card/ }), 1400);
  await cap('Transfer is free. Cards show their fee first.', 2200);
  await tap(btn(/^Pay ₦/), 1400);
  await cap('Sandbox checkout. In production this is Paystack’s secure page.', 2200);
  await tap(btn('I’ve sent the money'), 1800);
  await page.getByText('You’re in.').waitFor();
  await cap('Nothing counts until the payment processor confirms to our server.', 2800);
  await tap(btn('Back to the Pact'), 2200);

  /* ---------- 4. Finish the goal ---------- */
  await chapter(4, 'Finish the goal', 'Back with the organiser, ₦80,000 short.');
  await signOut();
  await signInAs(ABRAHAM);
  await page.goto(pactUrl, { waitUntil: 'load' });
  await page.locator('.detail__ring').waitFor();
  await cap('The ring shows who has covered what. Tunde is a guest, Ngozi is in.', 3000);
  await tap(page.locator('.nextstep').getByRole('button').first(), 1200);
  await page.getByText('Pay with').waitFor();
  await cap('Abraham pays the rest from his PACT balance. Press and hold, so it’s never by accident.', 3000);
  const holdBtn = page.getByRole('button', { name: /Hold to contribute|Hold/ }).first();
  await hold(holdBtn);
  await pin('1357');
  await page.getByText('You’re in.').waitFor({ timeout: 15000 });
  await cap('And that completes the goal. Everyone is told.', 2600);
  await tap(btn(/See it complete|Back to/), 2600);
  await page.getByText('We did it.').waitFor();
  await cap('We did it. The group made it happen.', 3200);

  /* ---------- 5. Pay vendors from the Pact ---------- */
  await chapter(5, 'Pay vendors from the Pact', 'The money goes to who it’s for, and everyone can see it.');
  await page.locator('.completed__money').scrollIntoViewIfNeeded();
  await cap('The organiser pays vendors straight from the Pact, so nobody fronts money.', 3000);
  await tap(page.getByRole('button', { name: /Pay a vendor from the Pact/ }), 1000);
  await typeSlow(page.getByLabel('What it’s for'), 'Hotel deposit');
  const vamt = page.getByRole('textbox', { name: 'Amount' });
  await tap(vamt, 150);
  await vamt.pressSequentially('90000', { delay: 70 });
  await cap('Half-filled? Close it. The sheet keeps what you typed.', 2400);
  await page.keyboard.press('Escape');
  await wait(900);
  await tap(page.getByRole('button', { name: /Pay a vendor from the Pact/ }), 1200);
  await cap('Back where they left off.', 1800);
  await page.selectOption('#vendor-bank', { index: 1 });
  const acct = page.getByLabel('Their account number');
  await tap(acct, 150);
  await acct.pressSequentially('0123456789', { delay: 70 });
  await page.getByText('The bank says this account belongs to').waitFor();
  await cap('PACT asks the bank who owns the account, so a typo can’t send money to a stranger.', 3200);
  await tap(btn(/^Pay ₦/), 900);
  await pin('1357');
  await wait(1400);
  await cap('Paid. Members see the vendor, the amount and, later, the receipt.', 3000);

  // Release the rest
  await page.evaluate(() => scrollTo(0, 0));
  await wait(500);
  await cap('What’s left can move to the organiser’s wallet. Only a BVN-verified organiser can release it.', 3000);
  await tap(btn(/^Release ₦/), 1200);
  await pin('1357');
  await wait(1800);
  await cap('It lands in his wallet, and every member is told.', 2400);

  /* ---------- 6. Wallet and security ---------- */
  await chapter(6, 'Wallet and security', 'Take the money out, and stay in control.');
  let slowTxns = true;
  await page.route('**/api/wallet/transactions*', async (route) => {
    if (slowTxns) await new Promise((r) => setTimeout(r, 2200));
    await route.continue().catch(() => undefined);
  });
  await page.goto(`${BASE}/app/wallet`, { waitUntil: 'commit' });
  await page.locator('.sk').first().waitFor();
  await cap('Every naira in and out is on the ledger. It loads as a skeleton first.', 2200);
  await page.getByText('History').first().waitFor();
  slowTxns = false;
  await wait(2200);
  await page.goto(`${BASE}/app/wallet/withdraw`, { waitUntil: 'load' });
  await page.getByRole('heading', { name: 'Withdraw to bank' }).waitFor();
  await cap('Withdrawals only go to a bank account in the same name as the wallet.', 2800);
  const add = page.getByRole('button', { name: 'Add a bank account' }).first();
  await tap(add, 1000);
  await page.selectOption('#bank', { index: 1 });
  const num = page.getByLabel('Account number');
  await tap(num, 150);
  await num.pressSequentially('0123456789', { delay: 70 });
  await page.getByText('ABRAHAM OKAFOR').waitFor();
  await cap('The bank confirms the name matches before anything is saved.', 2600);
  await tap(btn('Save account'), 900);
  await pin('1357');
  await wait(1400);
  const wamt = page.getByRole('textbox', { name: /Amount/ });
  await tap(wamt, 150);
  await wamt.pressSequentially('50000', { delay: 70 });
  await cap('Fee up front, always. No surprises.', 2200);
  await tap(btn(/^Withdraw ₦/), 900);
  await pin('1357');
  await page.getByText(/on its way|Sent|sent/).first().waitFor({ timeout: 20000 }).catch(() => undefined);
  await wait(2200);

  await page.goto(`${BASE}/app/profile`, { waitUntil: 'load' });
  await tap(page.getByRole('link', { name: /PIN and devices/ }).or(page.getByRole('button', { name: /PIN and devices/ })).first(), 1400);
  await cap('Every signed-in device is listed. Sign any of them out, or change the PIN.', 3200);

  /* ---------- 7. Take orders ---------- */
  await chapter(7, 'Take orders', 'Aso-ebi, souvenirs, tickets: people order what they want.');
  await page.goto(`${BASE}/app/create`, { waitUntil: 'load' });
  await typeSlow(page.getByLabel('Name', { exact: true }), 'Tolu and Femi’s aso-ebi');
  await tap(page.getByRole('radio', { name: 'Wedding' }), 500);
  await tap(page.getByRole('button', { name: 'In a month' }), 700);
  await tap(page.getByRole('button', { name: /More ways to use PACT/ }), 700);
  await tap(page.getByRole('button', { name: /^Group order/ }), 900);
  await cap('Instead of one target, list what’s on offer. The total is whatever people order.', 3000);
  await typeSlow(page.getByLabel('Item 1 name'), 'Aso-oke and gele');
  const price = page.getByLabel('Item 1 price');
  await tap(price, 150);
  await price.pressSequentially('45000', { delay: 70 * SPEED });
  await typeSlow(page.getByLabel('Item 1 sizes or colours'), 'S, M, L');
  await typeSlow(page.getByLabel('Item 1 how many available'), '20');
  await tap(btn(/Create Pact/), 1800);
  await page.waitForURL(/\/invite/);
  await page.goto(page.url().replace('/invite', ''), { waitUntil: 'load' });
  await page.getByRole('heading', { name: 'Order', exact: true }).scrollIntoViewIfNeeded();
  await cap('Members see the menu, what’s left, and the pay-by date.', 2600);
  await tap(page.getByRole('button', { name: 'Order', exact: true }).first(), 1000);
  await tap(page.getByRole('radio', { name: 'M', exact: true }), 600);
  await tap(page.getByRole('button', { name: 'One more' }), 600);
  await cap('Pick a size and a quantity. Stock is tracked, so nobody orders what’s gone.', 2800);
  await tap(btn(/^Order · ₦/), 1600);
  await cap('The order is placed. PACT reminds you on the pay-by day.', 2400);
  await page.getByRole('link', { name: /Pay for orders/ }).waitFor();
  await wait(1400);

  /* ---------- 8. Keep the memory ---------- */
  await chapter(8, 'Keep the memory', 'The plan is done. The story is worth keeping.');
  await page.goto(pactUrl, { waitUntil: 'load' });
  await page.locator('.memory').scrollIntoViewIfNeeded();
  await cap('Afterwards, the group keeps the memory. Only people in the Pact can see it.', 2800);
  await tap(page.getByRole('button', { name: /Add the memory/ }), 1000);
  await typeSlow(page.getByLabel('How did it go?'), 'Six of us, one weekend, and nobody chased anybody.');
  const photo = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#ffc53d' } })
    .composite([{ input: Buffer.from('<svg width="900" height="700"><circle cx="450" cy="350" r="220" fill="#ff7a5c"/><circle cx="450" cy="350" r="120" fill="#3dd68c"/></svg>') }])
    .jpeg()
    .toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'lagos.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByText('Photos · 1/6').waitFor({ timeout: 15000 });
  await cap('Photos are checked, re-encoded and stripped of location data.', 2600);
  await tap(btn('Save'), 1600);
  await page.locator('.memory__grid img').first().waitFor({ timeout: 15000 });
  await page.locator('.memory').scrollIntoViewIfNeeded();
  await wait(2600);

  await page.evaluate(() => window.__cap(''));
  await card(`<h1>pact</h1><p>Plan it. Fund it. Split the work. Keep the memory.<br>Make it happen <span>together</span>.</p><small>Web app live now · iOS and Android coming soon</small>`, 4200, OUTRO);
} catch (err) {
  await page.screenshot({ path: `${out}/demo-FAILED.png` });
  console.error('FAILED after caption', step, `“${lastCap}”`, err.message.split('\n').slice(0, 3).join(' | '));
  process.exitCode = 1;
} finally {
  writeFileSync(`${out}/narration.json`, JSON.stringify({ ms: Date.now() - t0, lines: narration }, null, 1));
  await context.close();
  await browser.close();
  const vid = readdirSync(out).filter((f) => f.endsWith('.webm') && f !== 'pact-demo.webm').pop();
  if (vid) renameSync(`${out}/${vid}`, `${out}/pact-demo.webm`);
  console.log('video:', `${out}/pact-demo.webm`);
}

// Mobile responsiveness audit with real layout measurement and screenshots.
//
// Runs the signed-in app at phone and tablet sizes against realistic worst-case data by rewriting
// API responses in the browser (long titles, huge amounts, 100%, 20+ members, long names), then
// measures what the layout actually does: page overflow, off-screen elements, text outside the
// progress-ring, clipped text, small tap targets, and CTAs pushed off the viewport.
//
// Usage: node scripts/responsive-audit.mjs <outDir>
//   env: BASE (default http://localhost:5174, a throwaway stack from scripts/demo-stack.sh)
//        THEME=light|dark (default light)   TEXT=100|125|150 (root font scale)
//        VIEWPORTS=320x568,390x844 (subset)  SHOTS=all|key|none (default key)
//        ONLY=detail,home (screen filter)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const OUT = process.argv[2] ?? 'exports/responsive';
const BASE = (process.env.BASE ?? 'http://localhost:5174').replace(/\/$/, '');
const THEME = process.env.THEME ?? 'light';
const TEXT = Number(process.env.TEXT ?? 100);
const SHOTS = process.env.SHOTS ?? 'key';
const ONLY = process.env.ONLY?.split(',');
const ALL_VIEWPORTS = [[320, 568], [360, 800], [375, 667], [390, 844], [393, 852], [412, 915], [430, 932], [768, 1024]];
const VIEWPORTS = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',').map((v) => v.split('x').map(Number)) : ALL_VIEWPORTS;
const KEY_WIDTHS = new Set([320, 375, 390, 430, 768]);

const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});

/* ---- worst-case data ---------------------------------------------------- */
const N = (naira) => naira * 100;
const SCENARIOS = {
  wedding: { title: "Sarah and Daniel's Destination Wedding Celebration", target: N(5_000_000), pct: 64, names: true },
  trip50m: { title: 'End of Year University Department Trip to Lagos', target: N(50_000_000), pct: 99, names: true },
  apartment: { title: 'New Apartment Furniture and Moving Expenses', target: N(25_000_000), pct: 9 },
  full: { title: 'Lagos Beach Weekend', target: N(2_500_000), pct: 100, status: 'funded' },
  small: { title: 'Bread', target: N(5_000), pct: 9 },
  zero: { title: 'Brunch', target: N(500), pct: 0 },
  crowd: { title: 'Family Reunion', target: N(500_000), pct: 64, crowd: 24 },
};
const LONG_NAME = { firstName: 'Oluwadamilare', lastName: 'Chukwuemeka-Adeyemi-Johnson' };
const SHORT_NAME = { firstName: 'Al', lastName: 'Li' };

function reshape(pact, people, sc) {
  const ratio = sc.target / Math.max(1, pact.target);
  const p = structuredClone(pact);
  p.title = sc.title;
  p.target = sc.target;
  if (sc.status) p.status = sc.status;
  if (sc.crowd) {
    const base = p.members.slice();
    for (let i = 0; base.length + i < sc.crowd; i++) {
      const src = base[(i % (base.length - 1)) + 1];
      p.members.push({ ...src, userId: `extra-${i}`, role: 'member' });
      people.push({ id: `extra-${i}`, firstName: ['Ngozi', 'Tunde', 'Bisi', 'Emeka'][i % 4], lastName: `Member${i}`, color: src.color, tint: 'sky', photoUrl: null });
    }
  }
  const joined = p.members.filter((m) => m.status === 'joined');
  const raised = Math.round((sc.target * sc.pct) / 100);
  const sum = joined.reduce((s, m) => s + m.contributed, 0) || 1;
  let acc = 0;
  joined.forEach((m, i) => {
    m.contributed = i === joined.length - 1 ? raised - acc : Math.round((m.contributed / sum) * raised);
    acc += m.contributed;
  });
  p.raised = raised;
  p.poolBalance = raised;
  p.budget = (p.budget ?? []).map((b) => ({ ...b, amount: Math.round(b.amount * ratio), funded: Math.min(Math.round(b.funded * ratio), Math.round(b.amount * ratio)) }));
  if (p.viewer) p.viewer.suggestedShare = Math.round(sc.target / Math.max(1, joined.length));
  if (sc.names) {
    const others = people.filter((x) => x.id !== p.organizerId);
    if (others[0]) Object.assign(others[0], LONG_NAME);
    if (others[1]) Object.assign(others[1], SHORT_NAME);
    if (others[2]) Object.assign(others[2], { firstName: 'Christopher-Maximilian', lastName: 'Ogunbanjo' });
  }
  return p;
}

/** Pacts-list mix: every card variant at once. */
const LIST_MIX = [
  ['wedding', {}], ['trip50m', {}], ['full', {}], ['small', { status: 'released' }], ['zero', { status: 'cancelled' }],
  ['apartment', { status: 'refunded' }], ['crowd', {}],
];

async function install(page, state) {
  await page.route(/\/api\/pacts(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch();
    const json = await res.json();
    const base = json.data;
    json.data = LIST_MIX.map(([k, over], i) => {
      const src = structuredClone(base[i % base.length]);
      const people = [];
      const out = reshape(src, people, { ...SCENARIOS[k], ...over });
      if (i >= base.length) out.id = `${src.id.slice(0, -2)}${String(i).padStart(2, '0')}`;
      return out;
    });
    return route.fulfill({ response: res, json });
  });
  await page.route(/\/api\/pacts\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'GET' || !state.scenario) return route.continue();
    const res = await route.fetch();
    const json = await res.json();
    if (!json.data?.pact) return route.fulfill({ response: res, json });
    json.data.pact = reshape(json.data.pact, json.people, SCENARIOS[state.scenario]);
    return route.fulfill({ response: res, json });
  });
}

/* ---- in-page measurements ---------------------------------------------- */
const measure = () => {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const out = { overflow: [], offscreen: [], ring: [], clipped: [], taps: [], cta: [] };
  const desc = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.01 && r.width > 0 && r.height > 0;
  };
  const inScroller = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll|hidden)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) return true;
      if (/(auto|scroll|hidden)/.test(cs.overflowX) && e.getBoundingClientRect().right <= vw + 1 && e.className?.toString().includes('screen')) return false;
    }
    return false;
  };
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) out.overflow.push(`page scrollWidth ${de.scrollWidth} > ${vw}`);
  const screen = document.querySelector('.screen');
  if (screen && screen.scrollWidth > screen.clientWidth + 1) {
    const wide = [...screen.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > screen.clientWidth + 1).sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right).slice(0, 3);
    out.overflow.push(`.screen scrollWidth ${screen.scrollWidth} > ${screen.clientWidth}; widest: ${wide.map((e) => `${desc(e)}→${Math.round(e.getBoundingClientRect().right)}${e.closest('[aria-hidden="true"]') ? '(decor)' : ''}`).join(', ')}`);
  }

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('svg') && el.tagName !== 'svg') continue;
    if (el.closest('.proto-panel, .skip-link, .visually-hidden')) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el) && !el.closest('[aria-hidden="true"]') && r.width < vw * 3) {
      if (out.offscreen.length < 12) out.offscreen.push(`${desc(el)} ${Math.round(r.left)}..${Math.round(r.right)} (vw ${vw}) "${(el.textContent ?? '').trim().slice(0, 30)}"`);
    }
    // Clipped text: hidden overflow with content wider than the box and no ellipsis.
    const cs = getComputedStyle(el);
    if (el.children.length === 0 && el.textContent.trim() && /(hidden|clip)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && !cs.webkitLineClamp) {
      out.clipped.push(`${desc(el)} "${el.textContent.trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
    }
    // Tap targets.
    if (el.matches('button, a[href], [role="tab"], [role="radio"], [role="button"], input:not([type="hidden"]), select, textarea, summary') && !el.closest('[aria-hidden="true"]')) {
      const slop = getComputedStyle(el, '::after');
      const slopBox = slop.content !== 'none' && slop.position === 'absolute' ? [Math.max(r.width, r.width - parseFloat(slop.left || 0) - parseFloat(slop.right || 0)), r.height - parseFloat(slop.top || 0) - parseFloat(slop.bottom || 0)] : [r.width, r.height];
      if ((slopBox[0] < 43.5 || slopBox[1] < 43.5) && !(el.tagName === 'A' && getComputedStyle(el).display === 'inline')) {
        out.taps.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}"`);
      }
    }
  }

  // Rings: every text run in the centre must sit inside the inner circle with a margin.
  for (const ring of document.querySelectorAll('.sring, .ring')) {
    const center = ring.querySelector('.sring__center, .ring__center');
    if (!center || !visible(ring)) continue;
    const rr = ring.getBoundingClientRect();
    const circle = ring.querySelector('circle');
    const stroke = circle ? Number(circle.getAttribute('stroke-width')) : 10;
    const cx = rr.left + rr.width / 2;
    const cy = rr.top + rr.height / 2;
    const inner = rr.width / 2 - stroke; // inside edge of the stroke
    const walker = document.createTreeWalker(center, NodeFilter.SHOW_TEXT);
    let worst = Infinity;
    let worstText = '';
    let minFont = Infinity;
    for (let n; (n = walker.nextNode()); ) {
      if (!n.textContent.trim() || n.parentElement.closest('.visually-hidden, [data-sr]')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) {
        const corners = [[q.left, q.top], [q.right, q.top], [q.left, q.bottom], [q.right, q.bottom]];
        for (const [x, y] of corners) {
          const margin = inner - Math.hypot(x - cx, y - cy);
          if (margin < worst) { worst = margin; worstText = n.textContent.trim().slice(0, 20); }
        }
      }
      minFont = Math.min(minFont, parseFloat(getComputedStyle(n.parentElement).fontSize));
    }
    // Block-level: pills and containers must also stay inside.
    const bad = worst < 2;
    out.ring.push({ size: Math.round(rr.width), margin: Math.round(worst * 10) / 10, text: worstText, minFont: Math.round(minFont * 10) / 10, bad, wrapped: [...center.querySelectorAll('p')].some((p) => p.getClientRects().length > 1 && p.getBoundingClientRect().height > parseFloat(getComputedStyle(p).lineHeight) * 1.6) });
  }

  // Primary CTAs must be reachable: fully inside the viewport (or in a scrolling page we report position).
  for (const b of document.querySelectorAll('.btn--primary, .hold')) {
    if (!visible(b) || b.disabled) continue;
    const r = b.getBoundingClientRect();
    const fixed = (() => { for (let e = b; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; })();
    if (fixed && (r.bottom > vh + 1 || r.top < 0)) out.cta.push(`${desc(b)} fixed but outside viewport: ${Math.round(r.top)}..${Math.round(r.bottom)} (vh ${vh})`);
    if (b.scrollWidth > b.clientWidth + 1) out.cta.push(`${desc(b)} label overflows: "${b.textContent.trim().slice(0, 40)}" ${b.scrollWidth}>${b.clientWidth}`);
    if (r.height > 90) out.cta.push(`${desc(b)} unusually tall ${Math.round(r.height)}px: "${b.textContent.trim().slice(0, 40)}"`);
  }
  return out;
};

/** Models the OS "larger text" setting: every font-size and px line-height rule is multiplied, layout rules are not.
 *  Done at stylesheet level (calc around the original value) so JS that measures and sizes text still runs on top. */
const applyTextScale = (factor) => {
  document.getElementById('__text-scale')?.remove();
  const scaleDecl = (style) => {
    let out = '';
    const fs = style.getPropertyValue('font-size');
    if (fs) out += `font-size: calc((${fs}) * ${factor});`;
    const lh = style.getPropertyValue('line-height');
    if (lh && /px$/.test(lh.trim())) out += `line-height: calc((${lh}) * ${factor});`;
    return out;
  };
  const walk = (rules) => {
    let css = '';
    for (const r of rules) {
      if (r.style && r.selectorText) {
        const d = scaleDecl(r.style);
        if (d) css += `${r.selectorText}{${d}}`;
      } else if (r.cssRules && r.cssRules.length && !(r instanceof CSSKeyframesRule) && !(r instanceof CSSFontFaceRule)) {
        const inner = walk(r.cssRules);
        if (inner) css += `${r.cssText.slice(0, r.cssText.indexOf('{'))}{${inner}}`;
      }
    }
    return css;
  };
  let css = '';
  for (const sheet of document.styleSheets) {
    try { css += walk(sheet.cssRules); } catch { /* cross-origin sheet */ }
  }
  const el = document.createElement('style');
  el.id = '__text-scale';
  el.textContent = css;
  document.head.appendChild(el);
};

/** Sheets: they must fit the screen, keep their close control reachable, and scroll internally when long. */
const measureSheet = () => {
  const panel = document.querySelector('.modal__panel');
  if (!panel) return null;
  const vh = window.innerHeight;
  const vw = document.documentElement.clientWidth;
  const r = panel.getBoundingClientRect();
  const body = panel.querySelector('.modal__body');
  const close = panel.querySelector('.modal__header .icon-btn');
  const cr = close?.getBoundingClientRect();
  const foot = panel.querySelector('.modal__footer')?.getBoundingClientRect();
  const issues = [];
  if (r.top < 0 || r.bottom > vh + 1) issues.push(`panel ${Math.round(r.top)}..${Math.round(r.bottom)} outside viewport ${vh}`);
  if (r.width > vw + 1) issues.push(`panel wider than viewport (${Math.round(r.width)}>${vw})`);
  if (cr && (cr.top < 0 || cr.bottom > vh)) issues.push('close control off-screen');
  if (body && body.scrollHeight > body.clientHeight + 1 && !/(auto|scroll)/.test(getComputedStyle(body).overflowY)) issues.push('body taller than panel and not scrollable');
  if (foot && (foot.bottom > vh + 1)) issues.push(`footer CTA below viewport (${Math.round(foot.bottom)}>${vh})`);
  const wide = [...panel.querySelectorAll('*')].find((e) => e.getBoundingClientRect().right > vw + 1 && !e.closest('[style*="overflow"]'));
  if (wide) issues.push(`content wider than viewport: ${wide.tagName.toLowerCase()}.${String(wide.className).split(' ')[0]}`);
  return { issues, height: Math.round(r.height), vh, scrollable: body ? body.scrollHeight > body.clientHeight + 1 : false };
};

/** With a software keyboard open (modelled as a shorter viewport), every field must be reachable: visible, and not under the sticky footer. */
async function keyboardCheck(page, vp, screen) {
  const orig = page.viewportSize();
  const kb = Math.round(Math.min(300, orig.height * 0.45));
  const fields = await page.locator('.screen input:visible, .screen textarea:visible, .modal input:visible').all();
  if (!fields.length) return;
  report.push({ vp, screen, kind: 'kbd-info', msg: `${Math.min(fields.length, 8)} fields checked with ${kb}px keyboard` });
  await page.setViewportSize({ width: orig.width, height: orig.height - kb });
  await page.waitForTimeout(400);
  for (const [i, f] of fields.slice(0, 8).entries()) {
    await f.focus();
    await page.waitForTimeout(350);
    const r = await f.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const foot = [...document.querySelectorAll('.screen__footer, .tabbar, .modal__panel > .modal__footer')].map((n) => n.getBoundingClientRect()).filter((x) => x.height > 0);
      const covered = foot.some((x) => b.bottom > x.top + 1 && b.top < x.bottom - 1 && !el.closest('.modal__panel'));
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), vh, off: b.bottom > vh + 1 || b.top < -1, covered, label: el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.id.slice(0, 8) };
    });
    if (r.off || r.covered) note(vp, `${screen}[kbd]`, 'KEYBOARD', `field #${i} "${r.label}" ${r.off ? 'off-screen' : 'under footer'} (top ${r.top}, bottom ${r.bottom}, visible height ${r.vh})`);
  }
  await page.evaluate(() => document.activeElement?.blur());
  await page.setViewportSize(orig);
  await page.waitForTimeout(250);
}

/* ---- run ---------------------------------------------------------------- */
const report = [];
const summary = new Map();
const note = (vp, screen, kind, msg) => {
  const k = `${kind}: ${msg}`;
  report.push({ vp, screen, kind, msg });
  const e = summary.get(k) ?? new Set();
  e.add(`${vp}/${screen}`);
  summary.set(k, e);
};

async function signIn(page, phone) {
  await page.goto(`${BASE}/app/auth/phone`);
  await page.getByText('What’s your number?').waitFor();
  await page.waitForTimeout(400);
  await page.getByLabel('Mobile number').fill(phone.replace(/^0/, ''));
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('button', { name: 'Fill it in' }).click();
  await page.locator('.wallet-strip').waitFor();
}

// The demo OTP allows a few codes per number, so sign in once and reuse the session for every viewport.
const SESSION_FILE = `${OUT}/.session.json`;
let session = existsSync(SESSION_FILE) ? JSON.parse(readFileSync(SESSION_FILE, 'utf8')) : null;
for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: w < 768, hasTouch: w < 768, ...(session ? { storageState: session } : {}) });
  await ctx.addInitScript(([t, scale]) => {
    localStorage.setItem('pact.theme', t);
  }, [THEME, TEXT]);
  const page = await ctx.newPage();
  const state = { scenario: null };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await install(page, state);
  const vp = `${w}x${h}`;
  const dir = `${OUT}/${THEME}${TEXT !== 100 ? `-t${TEXT}` : ''}/${vp}`;
  if (SHOTS !== 'none') mkdirSync(dir, { recursive: true });

  const check = async (screen, { shot = true, scrolls = [], kbd = false } = {}) => {
    if (ONLY && !ONLY.some((o) => screen.startsWith(o))) return;
    await page.waitForTimeout(1500);
    const positions = [0, ...scrolls];
    if (TEXT !== 100) {
      await page.evaluate(applyTextScale, TEXT / 100);
      await page.waitForTimeout(500); // let fit-to-width logic react, as it would on a device that starts scaled
    }
    for (const y of positions) {
      if (y) {
        await page.locator('.screen').first().evaluate((el, top) => el.scrollTo(0, top), y).catch(() => {});
        await page.waitForTimeout(250);
      }
      if (TEXT !== 100 && y) {
        await page.evaluate(applyTextScale, TEXT / 100);
        await page.waitForTimeout(300);
      }
      const m = await page.evaluate(measure);
      const tag = y ? `${screen}@${y}` : screen;
      for (const s of m.overflow) note(vp, tag, 'OVERFLOW', s);
      for (const s of m.offscreen) note(vp, tag, 'OFFSCREEN', s);
      for (const s of m.clipped) note(vp, tag, 'CLIPPED', s);
      for (const s of m.cta) note(vp, tag, 'CTA', s);
      for (const r of m.ring) {
        if (r.bad) note(vp, tag, 'RING', `text "${r.text}" ${r.margin}px inside ring edge (ring ${r.size}px, min font ${r.minFont}px)`);
        if (r.wrapped) note(vp, tag, 'RING-WRAP', `a line wraps inside ${r.size}px ring`);
      }
      if (!y) for (const s of m.taps.slice(0, 40)) note(vp, tag, 'TAP<44', s.replace(/ \d+x\d+ /, (x) => x));
      if (y === 0 && m.ring.length) report.push({ vp, screen: tag, kind: 'ring-info', msg: JSON.stringify(m.ring) });
      if (kbd && !y) await keyboardCheck(page, vp, screen);
      if (shot && SHOTS !== 'none' && (SHOTS === 'all' || KEY_WIDTHS.has(w))) await page.screenshot({ path: `${dir}/${tag.replace(/[^\w@-]/g, '_')}.png` });
    }
  };

  /* signed out: only when starting without a session, so the first viewport covers it (re-run per viewport with a fresh stack for more) */
  if (!session) {
    for (const [name, path] of [['welcome', '/app'], ['phone', '/app/auth/phone'], ['join-invalid', '/app/join/NOPE0000']]) {
      await page.goto(`${BASE}${path}`);
      await check(`out-${name}`, { kbd: name === 'phone' });
    }
  }

  if (!session) {
    await signIn(page, '08010000001');
    session = await ctx.storageState();
    mkdirSync(OUT, { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify(session));
  } else {
    await page.goto(`${BASE}/app/home`);
    await page.locator('.wallet-strip').waitFor();
  }
  await check('home', { scrolls: [600, 1400] });
  await page.goto(`${BASE}/app/pacts`);
  await check('pacts', { scrolls: [700, 1500, 2300] });
  await page.goto(`${BASE}/app/pacts`);
  await page.waitForTimeout(800);
  await page.getByPlaceholder('Search by name').fill('zzzz').catch(() => {});
  await check('pacts-nosearchresult', { shot: true });
  await page.getByPlaceholder('Search by name').fill('').catch(() => {});
  await page.waitForTimeout(300);

  /* Loading, error and empty states of the Pacts list (and Home, which reads the same data). */
  for (const [name, handler] of [
    ['error', (route) => route.abort('failed')],
    ['loading', async (route) => { await new Promise((r) => setTimeout(r, 30000)); route.abort(); }],
    ['empty', async (route) => { const res = await route.fetch(); const json = await res.json(); json.data = []; route.fulfill({ response: res, json }); }],
  ]) {
    if (ONLY && !ONLY.some((o) => o === 'states' || o.startsWith('state-'))) break;
    const match = /\/api\/pacts(\?.*)?$/;
    await page.unroute(match);
    await page.route(match, async (route) => (route.request().method() === 'GET' ? handler(route) : route.continue()));
    for (const path of ['/app/pacts', '/app/home']) {
      await page.goto(`${BASE}${path}`);
      await page.waitForTimeout(name === 'error' ? 4500 : 1200);
      await check(`state-${name}${path.replace('/app', '').replace('/', '-')}`);
    }
    await page.unroute(match);
  }
  await install(page, state);

  for (const key of Object.keys(SCENARIOS)) {
    if (ONLY && !ONLY.some((o) => o === 'detail' || o.startsWith('detail-') || o.startsWith('contribute') || o === 'completed')) break;
    state.scenario = key;
    await page.goto(`${BASE}/app/pacts`);
    await page.waitForTimeout(600);
    const real = await page.locator('a[href*="/app/pact/"]').first().getAttribute('href');
    // Detail GET is rewritten for any id, so navigate straight there.
    await page.goto(`${BASE}${real}`);
    await page.waitForTimeout(400);
    await check(`detail-${key}`, { scrolls: key === 'wedding' || key === 'full' ? [700, 1400, 2100, 2800] : [] });
    if (key === 'wedding' || key === 'crowd') {
      const opens = key === 'wedding'
        ? ['Split the rest', 'Invite people', 'Add a task', 'Add a budget line', 'Contributing and taking a task', 'Buy the gift', 'Get an account number']
        : ['Invite people'];
      for (const text of opens) {
        const t = page.getByText(text, { exact: false }).first();
        if (!(await t.count())) continue;
        await t.scrollIntoViewIfNeeded().catch(() => {});
        await t.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(800);
        const m = await page.evaluate(measureSheet);
        const tag = `sheet-${key}-${text.replace(/\W+/g, '_').slice(0, 24)}`;
        if (m) {
          for (const i of m.issues) note(vp, tag, 'SHEET', i);
          if (SHOTS !== 'none' && (SHOTS === 'all' || KEY_WIDTHS.has(w))) await page.screenshot({ path: `${dir}/${tag}.png` });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
          if (await page.locator('.modal__panel').count()) await page.locator('.modal__header .icon-btn').first().click().catch(() => {});
          await page.waitForTimeout(400);
        } else if (!/\/app\/pact\//.test(page.url().replace(/.*\/app/, '/app')) || page.url() !== `${BASE}${real}`) {
          await page.goto(`${BASE}${real}`);
          await page.waitForTimeout(500);
        }
      }
    }
    if (['wedding', 'trip50m', 'small', 'apartment'].includes(key)) {
      await page.goto(`${BASE}${real}/contribute`);
      if (key === 'apartment') await page.locator('.contribute__fill').click().catch(() => {});
      await check(`contribute-${key}`, { kbd: true });
    }
  }
  state.scenario = null;
  const simple = [['create', '/app/create'], ['wallet', '/app/wallet'], ['topup', '/app/wallet/topup'], ['withdraw', '/app/wallet/withdraw'], ['activity', '/app/activity'], ['notifications', '/app/notifications'], ['profile', '/app/profile'], ['verify', '/app/profile/verify'], ['security', '/app/profile/security'], ['banks', '/app/profile/banks']];
  for (const [name, path] of simple) {
    if (ONLY && !ONLY.some((o) => name.startsWith(o))) continue;
    await page.goto(`${BASE}${path}`);
    await check(name, { scrolls: name === 'create' ? [600, 1200] : [], kbd: ['create', 'topup', 'withdraw'].includes(name) });
  }
  for (const e of errors) note(vp, 'console', 'PAGE-ERROR', e.slice(0, 120));
  // Refresh tokens rotate on use: keep the newest session for the next viewport and the next run.
  session = await ctx.storageState();
  writeFileSync(SESSION_FILE, JSON.stringify(session));
  await ctx.close();
  console.log(`done ${vp}`);
}
await browser.close();

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/report-${THEME}${TEXT !== 100 ? `-t${TEXT}` : ''}.json`, JSON.stringify(report, null, 2));
const rows = [...summary.entries()].sort((a, b) => b[1].size - a[1].size);
console.log(`\n${rows.length} distinct findings`);
for (const [k, where] of rows) console.log(`- ${k}\n    ${[...where].slice(0, 6).join(', ')}${where.size > 6 ? ` +${where.size - 6}` : ''}`);

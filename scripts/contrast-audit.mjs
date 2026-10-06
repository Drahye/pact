// Contrast + typography audit on rendered pixels, light and dark, rest and pressed states.
// Usage: node scripts/contrast-audit.mjs [--theme=light,dark] [--states=rest,active,hover,focus] [--only=home,circle] [--out=/tmp/contrast]
// Needs the demo stack with fixtures and a saved session: bash scripts/detail-up.sh first.
//
// How it measures: text is hidden with -webkit-text-fill-color and the page is screenshotted, so the pixels under every text line are the real
// background (gradients, heroes, translucent layers, filters, all of it). The text colour comes from computed style, composited with its own alpha,
// ancestor opacity and any brightness() filter. Pressed/hover/focus states are forced on every interactive element (and its ancestors) through
// CDP at once, then measured the same way. WCAG 2.2 AA: 4.5:1 text, 3:1 large text (24px, or 18.66px at 700) and icons.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const themes = arg('theme', 'light,dark').split(',');
const states = arg('states', 'rest,active').split(',');
const only = arg('only', '').split(',').filter(Boolean);
const OUT = arg('out', '/tmp/contrast');
const FEEDBACK = process.argv.includes('--feedback');
const WIDTH = Number(arg('w', 390));
const BASE = 'http://localhost:5174';
mkdirSync(OUT, { recursive: true });
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
const T = ids.tokens;

const signedIn = [
  ['home', '/app/home'], ['circles', '/app/circles'], ['circle', `/app/circles/${ids.boys}`], ['circle-quiet', `/app/circles/${ids.circleQuiet}`],
  ['ask-open', `/app/asks/${ids.askOpen}`], ['ask-answered', `/app/asks/${ids.askAnswered}`],
  ['plan-open', `/app/plans/${ids.planOpen}`], ['plan-pact', `/app/plans/${ids.planConverted}`],
  ['split-open', `/app/splits/${ids.splitOpen}`], ['split-partial', `/app/splits/${ids.splitPartial}`], ['split-settled', `/app/splits/${ids.splitSettled}`], ['split-owe', `/app/splits/${ids.splitOwe}`],
  ['pact-active', `/app/pact/${ids.pactActive}`], ['pact-progress', `/app/pact/${ids.pactProgress}`], ['pact-done', `/app/pact/${ids.pactCompleted}`], ['pact-plan', `/app/pact/${ids.pactFromPlan}`],
  ['recap-pact', `/app/recap/pact/${ids.pactCompleted}`], ['recap-split', `/app/recap/split/${ids.splitSettled}`],
  ['activity', '/app/activity'], ['pacts', '/app/pacts'], ['notifications', '/app/notifications'],
  ['me', '/app/profile'], ['settings', '/app/profile/settings'], ['account', '/app/profile/account'], ['security', '/app/profile/security'], ['banks', '/app/profile/banks'], ['verify', '/app/profile/verify'],
  ['wallet', '/app/wallet'], ['topup', '/app/wallet/topup'], ['withdraw', '/app/wallet/withdraw'],
  ['create-ask', '/app/asks/new'], ['create-plan', '/app/plans/new'], ['create-split', '/app/splits/new'], ['create-pact', '/app/create'], ['create-circle', '/app/circles/new'],
  ['start', '/app/start'], ['join-invite', '/app/join-invite'], ['onboarding', '/app/onboarding'],
];
const signedOut = [
  ['out-welcome', '/app'], ['out-start', '/app/auth/start'], ['out-signin', '/app/auth/signin'], ['out-email', '/app/auth/email'], ['out-phone', '/app/auth/phone'],
  ['share-ask', `/a/${T.ask}`], ['share-ask-closed', `/a/${T.askClosed}`], ['share-plan', `/p/${T.plan}`], ['share-plan-pact', `/p/${T.planPact}`], ['share-split', `/s/${T.split}`], ['share-split-settled', `/s/${T.splitSettled}`],
  ['share-recap-pact', `/r/${T.recapPact}`], ['share-recap-split', `/r/${T.recapSplit}`], ['circle-invite', `/app/c/${T.circle}`], ['circle-invite-revoked', `/app/c/${T.circleRevoked}`],
];

const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});

// ---- in-page: mark interactive elements, then collect every text line / icon / input with its computed look -------------------
const MARK = `(() => {
  const sel = 'a[href],button,[role=button],[role=tab],[role=radio],[role=switch],[role=checkbox],[role=link],[role=option],[role=menuitem],summary,input:not([type=hidden]),select,textarea,label,[tabindex]:not([tabindex="-1"])';
  const all = [...document.querySelectorAll('*')];
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  let n = 0;
  for (const el of all) {
    if (el.closest('svg') && el.tagName !== 'svg') continue;
    if (el.tagName === 'svg') continue;
    let hit = el.matches(sel);
    if (!hit) { const c = getComputedStyle(el).cursor; hit = c === 'pointer' && !(el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer'); }
    if (!hit || !visible(el)) continue;
    el.setAttribute('data-ca', '1'); n++;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { if (p.hasAttribute('data-ca') || p.hasAttribute('data-cap')) break; p.setAttribute('data-cap', '1'); }
  }
  for (const s of document.querySelectorAll('svg')) { const r = s.getBoundingClientRect(); if (r.width <= 44 && r.height <= 44 && r.width > 2) s.setAttribute('data-ci', '1'); }
  return n;
})()`;

const COLLECT = `((state) => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const cx = canvas.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  const rgba = (str) => {
    if (cache.has(str)) return cache.get(str);
    let m = /^rgba?\\(([^)]+)\\)$/.exec(str), v;
    if (m) { const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); v = [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    else if ((m = /^color\\(srgb ([^)]+)\\)$/.exec(str))) { const p = m[1].split(/[ \\/]+/).filter(Boolean).map(Number); v = [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    else { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = str; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; v = [d[0], d[1], d[2], d[3] / 255]; }
    cache.set(str, v); return v;
  };
  const sig = (el) => { const c = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).filter(Boolean).slice(0, 3).join('.'); return el.tagName.toLowerCase() + (c ? '.' + c : ''); };
  const chain = (el) => { const out = []; for (let p = el.parentElement; p && out.length < 3; p = p.parentElement) { const c = typeof p.className === 'string' ? p.className.trim().split(/\\s+/)[0] : ''; if (c) out.push(c); } return out.join('<'); };
  const effective = (el) => {
    let op = 1, filt = 1, disabled = false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e); op *= +s.opacity;
      const m = /brightness\\(([\\d.]+)\\)/.exec(s.filter); if (m) filt *= +m[1];
      if (e.matches(':disabled,[aria-disabled=true],[data-disabled=true]')) disabled = true;
    }
    return { op, filt, disabled };
  };
  const topOk = (el, r) => {
    const x = Math.min(innerWidth - 1, Math.max(0, r.x + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2));
    const t = document.elementFromPoint(x, y); if (!t) return false;
    if (el.contains(t) || t.contains(el)) return true;
    return !!(t.closest('[aria-hidden=true],svg') || !(t.textContent || '').trim());
  };
  const out = [];
  const W = innerWidth, H = innerHeight;
  const dialog = document.querySelector('[role=dialog][aria-modal=true]');
  const inScope = (el) => !dialog || dialog.contains(el);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue.replace(/\\s+/g, ' ').trim(); if (!t) continue;
    if (/^[\\p{Extended_Pictographic}\\uFE0F\\u200D\\s]+$/u.test(t)) continue;
    const el = n.parentElement; if (!el || el.closest('script,style,noscript,[hidden],svg,.sr-only,.visually-hidden,#ca-style') || !inScope(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const eff = effective(el); if (eff.op < 0.05) continue;
    const fill = cs.webkitTextFillColor || cs.color; const fg = rgba(fill); if (fg[3] === 0) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 2 && r.height > 4 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W);
    if (!rects.length || !topOk(el, rects[0])) continue;
    const ia = el.closest('[data-ca]');
    out.push({ k: 'text', text: t.slice(0, 44), sig: sig(el), chain: chain(el), ia: ia ? sig(ia) : '', iaTag: ia ? ia.tagName : '',
      rects: rects.slice(0, 4).map((r) => [r.x, r.y, r.width, r.height]), fg, op: eff.op, filt: eff.filt, disabled: eff.disabled,
      size: parseFloat(cs.fontSize), weight: +cs.fontWeight, lh: cs.lineHeight, ls: cs.letterSpacing, tt: cs.textTransform, fam: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim(), tag: el.tagName.toLowerCase(), numeric: /^[\\d,.\\s₦$%:+\\-–/]+$/.test(t) });
  }
  for (const s of document.querySelectorAll('svg[data-ci]')) {
    const r = s.getBoundingClientRect(); if (r.bottom < 0 || r.top > H || !inScope(s)) continue;
    const cs = getComputedStyle(s); const eff = effective(s); if (cs.visibility === 'hidden' || eff.op < 0.05) continue;
    let stroke = cs.stroke !== 'none' ? cs.stroke : null;
    if (!stroke) { const shape = s.querySelector('path,circle,rect,line,polyline,polygon,ellipse'); if (shape) { const sc = getComputedStyle(shape); stroke = sc.stroke !== 'none' ? sc.stroke : (sc.fill !== 'none' ? sc.fill : null); } }
    if (!stroke) continue;
    if (cs.strokeDasharray !== 'none' && parseFloat(cs.strokeDashoffset) >= parseFloat(cs.strokeDasharray) - 0.5) continue;
    const fg = rgba(stroke); if (fg[3] === 0) continue;
    const ia = s.closest('[data-ca]'); if (!topOk(s, r)) continue;
    out.push({ k: 'icon', text: '(icon)', sig: sig(s.parentElement || s), chain: chain(s), ia: ia ? sig(ia) : '', iaTag: ia ? ia.tagName : '', iconOnly: !!ia && !(ia.textContent || '').trim(), rects: [[r.x, r.y, r.width, r.height]], fg, op: eff.op, filt: eff.filt, disabled: eff.disabled, size: r.width, weight: 0 });
  }
  for (const i of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea')) {
    const r = i.getBoundingClientRect(); if (r.width < 4 || r.bottom < 0 || r.top > H || !inScope(i)) continue;
    const cs = getComputedStyle(i); const eff = effective(i);
    if (!i.value && i.placeholder) {
      const ph = getComputedStyle(i, '::placeholder'); const fg = rgba(ph.webkitTextFillColor || ph.color);
      out.push({ k: 'placeholder', text: i.placeholder.slice(0, 30), sig: sig(i), chain: chain(i), ia: sig(i), iaTag: i.tagName, rects: [[r.x + 12, r.y + r.height * 0.3, Math.min(r.width - 24, 120), r.height * 0.4]], fg, op: eff.op, filt: eff.filt, disabled: i.disabled, size: parseFloat(cs.fontSize), weight: +cs.fontWeight });
    }
  }
  return out;
})(${'$STATE'})`;

const RECTS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('[data-ca]')) {
    if (el.matches(':disabled,[aria-disabled=true]') || el.closest('[aria-hidden=true]')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 20 || r.height < 20 || r.bottom < 0 || r.top > innerHeight) continue;
    if (el.matches('input,textarea,select,label') && !el.matches('label[for]')) continue;
    const c = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '';
    out.push({ sig: el.tagName.toLowerCase() + (c ? '.' + c : ''), text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24), r: [r.x, r.y, r.width, r.height] });
  }
  return out;
})()`;
const noFeedback = new Map();
const diffIn = (a, b, rc) => {
  const [x, y, w, h] = rc; const x0 = Math.max(0, Math.floor(x - 3)), y0 = Math.max(0, Math.floor(y - 3)), x1 = Math.min(a.info.width - 1, Math.ceil(x + w + 3)), y1 = Math.min(a.info.height - 1, Math.ceil(y + h + 3));
  let sum = 0, n = 0, max = 0;
  for (let py = y0; py <= y1; py += 2) for (let px = x0; px <= x1; px += 2) { const o = (py * a.info.width + px) * a.info.channels; const d = Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2]); sum += d; n++; if (d > max) max = d; }
  return { mean: n ? sum / n : 0, max };
};

// ---- pixel work ----------------------------------------------------------------------------------------------------------------
const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const samplesOf = (img, rect, shrink) => {
  const { data, info } = img; const [x, y, w, h] = rect;
  const sy = shrink ? h * 0.2 : 0;
  const x0 = Math.max(0, Math.floor(x + 1)), x1 = Math.min(info.width - 1, Math.ceil(x + w - 1));
  const y0 = Math.max(0, Math.floor(y + sy)), y1 = Math.min(info.height - 1, Math.ceil(y + h - sy));
  if (x1 < x0 || y1 < y0) return [];
  const nx = Math.min(14, x1 - x0 + 1), ny = Math.min(3, y1 - y0 + 1), out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const px = nx === 1 ? x0 : Math.round(x0 + ((x1 - x0) * i) / (nx - 1)), py = ny === 1 ? y0 : Math.round(y0 + ((y1 - y0) * j) / (ny - 1));
    const o = (py * info.width + px) * info.channels; out.push([data[o], data[o + 1], data[o + 2]]);
  }
  return out;
};
const measure = (img, it) => {
  const per = [];
  for (const rc of it.rects) {
    const bgs = samplesOf(img, rc, it.k === 'text' || it.k === 'placeholder');
    for (const bg of bgs) {
      const a = Math.min(1, it.fg[3] * it.op);
      const f = [0, 1, 2].map((c) => it.fg[c] * a * it.filt + bg[c] * (1 - a));
      per.push({ r: ratio(lum(f[0], f[1], f[2]), lum(bg[0], bg[1], bg[2])), bg, f });
    }
  }
  if (!per.length) return null;
  per.sort((p, q) => p.r - q.r);
  const worst = per[Math.min(per.length - 1, Math.floor(per.length * 0.08))];
  return { ratio: worst.r, bg: hex(worst.bg), fg: hex(worst.f) };
};
const need = (it) => (it.k === 'icon' ? 3 : (it.size >= 24 || (it.size >= 18.66 && it.weight >= 700)) ? 3 : 4.5);

// ---- run -----------------------------------------------------------------------------------------------------------------------
const findings = new Map();
const typo = [];
let checked = 0;
const record = (theme, state, screen, it, m) => {
  const req = need(it);
  checked++;
  if (m.ratio >= req) return;
  const key = [theme, state, it.k, it.sig, it.ia, m.fg, m.bg].join('|');
  const f = findings.get(key) ?? { theme, state, kind: it.k, sig: it.sig, chain: it.chain, ia: it.ia, fg: m.fg, bg: m.bg, size: it.size, weight: it.weight, req, worst: 99, n: 0, screens: new Set(), samples: new Set(), disabled: !!it.disabled };
  f.worst = Math.min(f.worst, m.ratio); f.n++; f.screens.add(screen); if (f.samples.size < 3) f.samples.add(it.text);
  findings.set(key, f);
};

const runScreen = async (page, cdp, theme, name) => {
  const h = await page.evaluate(() => Math.min(3800, Math.max(844, (document.querySelector('.screen')?.scrollHeight ?? document.documentElement.scrollHeight) + 60)));
  await page.setViewportSize({ width: WIDTH, height: h });
  await page.waitForTimeout(450);
  await page.addStyleTag({ content: `#ca-x{}*,*::before,*::after{pointer-events:auto!important;transition:none!important;animation:none!important;caret-color:transparent!important}html[data-ca-clean] *{-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}html[data-ca-clean] svg[data-ci]{visibility:hidden!important}html[data-ca-clean] ::placeholder{-webkit-text-fill-color:transparent!important}` }).catch(() => {});
  await page.evaluate(MARK);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const doc = await cdp.send('DOM.getDocument', { depth: 0 });
  const forceAll = async (classes, ancestors = true) => {
    const q = await cdp.send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: ancestors ? '[data-ca],[data-cap]' : '[data-ca]' });
    for (let i = 0; i < q.nodeIds.length; i += 80) await Promise.all(q.nodeIds.slice(i, i + 80).map((nodeId) => cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: classes }).catch(() => {})));
    return q.nodeIds;
  };
  let fbRest = null, fbRects = null;
  for (const state of states) {
    let forced = [];
    if (state === 'active') forced = await forceAll(['hover', 'active']);
    if (state === 'hover') forced = await forceAll(['hover']);
    if (state === 'focus') forced = await forceAll(['focus-visible'], false);
    await page.waitForTimeout(80);
    await page.evaluate(() => document.documentElement.removeAttribute('data-ca-clean'));
    if (FEEDBACK && (state === 'rest' || state === 'active')) {
      const shot = await sharp(await page.screenshot({ type: 'png' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      if (state === 'rest') { fbRest = shot; fbRects = await page.evaluate(RECTS); }
      else if (fbRest) for (const e of fbRects) { const d = diffIn(fbRest, shot, e.r); if (d.mean < 0.35 && d.max < 40) { const k = `${theme} ${e.sig}`; const g = noFeedback.get(k) ?? { n: 0, screens: new Set(), text: e.text }; g.n++; g.screens.add(name); noFeedback.set(k, g); } }
    }
    const items = await page.evaluate(COLLECT.replace('$STATE', JSON.stringify(state)));
    await page.evaluate(() => document.documentElement.setAttribute('data-ca-clean', '1'));
    await page.waitForTimeout(60);
    const png = await page.screenshot({ type: 'png' });
    const img = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const it of items) {
      const m = measure(img, it); if (!m) continue;
      if (state === 'rest' && it.k === 'text') typo.push({ theme, screen: name, text: it.text, sig: it.sig, chain: it.chain, size: it.size, weight: it.weight, lh: it.lh, ls: it.ls, tt: it.tt, fam: it.fam, tag: it.tag, numeric: it.numeric, y: Math.round(it.rects[0][1]), ratio: +m.ratio.toFixed(2), fg: m.fg, bg: m.bg });
      // Pressed, hover and focus states only matter for things inside the pressed element.
      if (state !== 'rest' && !it.ia) continue;
      if (it.k === 'icon' && !it.iconOnly && state === 'rest') { /* icons beside a label are advisory, checked at 3:1 anyway */ }
      record(theme, state, name, it, m);
    }
    await page.evaluate(() => document.documentElement.removeAttribute('data-ca-clean'));
    for (let i = 0; i < forced.length; i += 80) await Promise.all(forced.slice(i, i + 80).map((nodeId) => cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => {})));
  }
  await page.setViewportSize({ width: WIDTH, height: 844 });
};

for (const theme of themes) {
  const mk = async (state) => {
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 1, colorScheme: theme, ...(state ? { storageState: '/tmp/detail-state.json' } : {}) });
    await ctx.addInitScript((t) => { try { localStorage.setItem('pact.theme', t); } catch {} }, theme);
    return ctx;
  };
  const ctx = await mk(true);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  for (const [name, path] of signedIn) {
    if (only.length && !only.some((o) => name.startsWith(o))) continue;
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' }); await page.waitForTimeout(1700);
    const u = new URL(page.url());
    if (u.pathname === '/app' || u.pathname.startsWith('/app/auth')) { console.error(`SESSION LOST on ${name} (${u.pathname}). Run bash scripts/detail-up.sh and start again.`); process.exit(2); }
    await runScreen(page, cdp, theme, name);
    console.log('·', theme, name, checked);
    writeFileSync('/tmp/detail-state.json', JSON.stringify(await ctx.storageState()));
  }
  if (!only.length || only.includes('create-sheet')) {
    await page.goto(`${BASE}/app/home`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Create' }).click().catch(() => {}); await page.waitForTimeout(800);
    await runScreen(page, cdp, theme, 'create-sheet');
  }
  // Sheets and menus opened from detail screens: what a person sees after tapping More, Share, Invite and the like.
  if (process.argv.includes('--sheets')) {
    const flows = [
      ['pact-active', `/app/pact/${ids.pactActive}`, [/^more/i, /^share/i, /invite/i, /add money/i]],
      ['split-open', `/app/splits/${ids.splitOpen}`, [/^more/i, /^share/i]],
      ['circle', `/app/circles/${ids.boys}`, [/^more/i, /^share/i, /invite/i, /settings/i]],
      ['plan-open', `/app/plans/${ids.planOpen}`, [/^more/i, /^share/i, /ask the group/i]],
      ['ask-open', `/app/asks/${ids.askOpen}`, [/^more/i, /^share/i]],
      ['settings', '/app/profile/settings', [/close my account/i, /download my data/i]],
      ['wallet', '/app/wallet', [/add money|top up/i, /withdraw/i]],
      ['pacts', '/app/pacts', [/create a pact/i]],
    ];
    for (const [name, path, buttons] of flows) {
      for (const b of buttons) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
        const btn = page.getByRole('button', { name: b }).or(page.getByRole('link', { name: b })).first();
        if (!(await btn.count())) continue;
        await btn.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(900);
        if (!(await page.locator('[role=dialog][aria-modal=true]').count())) continue;
        await runScreen(page, cdp, theme, `${name}:${b.source.replace(/[^a-z ]/gi, '')}`);
        console.log('·', theme, 'sheet', name, b.source, checked);
      }
    }
  }
  writeFileSync('/tmp/detail-state.json', JSON.stringify(await ctx.storageState()));
  await ctx.close();
  const anon = await mk(false);
  const ap = await anon.newPage(); const acdp = await anon.newCDPSession(ap);
  for (const [name, path] of signedOut) {
    if (only.length && !only.some((o) => name.startsWith(o))) continue;
    await ap.goto(`${BASE}${path}`, { waitUntil: 'load' }); await ap.waitForTimeout(1800);
    await runScreen(ap, acdp, theme, name);
    console.log('·', theme, name, checked);
  }
  await anon.close();
}
await browser.close();

if (FEEDBACK) {
  const fb = [...noFeedback].map(([k, g]) => ({ k, n: g.n, screens: [...g.screens].slice(0, 4), text: g.text })).sort((a, b) => b.n - a.n);
  writeFileSync(`${OUT}/no-feedback.json`, JSON.stringify(fb, null, 1));
  console.log(`\nTAPPABLE WITH NO VISIBLE PRESSED CHANGE (${fb.length})`);
  for (const f of fb) console.log(`${String(f.n).padStart(3)}  ${f.k.padEnd(64)} ${f.screens.join(',')} "${f.text}"`);
}
const rows = [...findings.values()].map((f) => ({ ...f, screens: [...f.screens], samples: [...f.samples] })).sort((a, b) => a.worst - b.worst);
writeFileSync(`${OUT}/findings.json`, JSON.stringify(rows, null, 1));
writeFileSync(`${OUT}/typo.json`, JSON.stringify(typo));
console.log(`\nchecked ${checked} items, ${rows.length} failing groups`);
for (const f of rows) console.log(`${f.worst.toFixed(2)}/${f.req} ${f.theme} ${f.state.padEnd(6)} ${f.kind.padEnd(5)} ${f.sig}${f.ia && f.ia !== f.sig ? ' [in ' + f.ia + ']' : ''} ${f.fg} on ${f.bg} ${Math.round(f.size)}px/${f.weight}${f.disabled ? ' (disabled)' : ''} x${f.n} ${f.screens.slice(0, 3).join(',')} "${f.samples.join('" "')}"`);

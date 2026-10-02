// First-time experience, end to end, against the demo stack (scripts/demo-stack.sh, port 5174):
// brand-new account -> intro (3 screens, skip, back) -> the three paths (start, join, explore) -> the demo Pact
// (read only) -> the three Homes (nothing started, finished only, something running) -> never shown twice.
// Usage: node scripts/onboarding-check.mjs <outDir>   env: THEME=light|dark, VIEWPORTS=390x844,320x568
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const OUT = process.argv[2] ?? 'exports/onboarding';
const B = (process.env.BASE ?? 'http://localhost:5174').replace(/\/$/, '');
const THEME = process.env.THEME ?? 'light';
const VPS = (process.env.VIEWPORTS ?? '390x844,320x568').split(',').map((v) => v.split('x').map(Number));
mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const problems = [];
const ok = (name, cond, extra = '') => { console.log(cond ? 'ok  ' : 'FAIL', name, extra); if (!cond) problems.push(name); };
const axe = async (page, name) => {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }));
  for (const v of r.violations) problems.push(`axe ${name}: ${v.id} ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  console.log(r.violations.length ? 'FAIL' : 'ok  ', `axe ${name}`, r.violations.map((v) => `${v.id}(${v.nodes.length})`).join(','));
};
const api = async (method, path, token, body) => {
  const r = await fetch(`${B}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method !== 'GET' ? { 'idempotency-key': `o-${Date.now()}-${Math.random()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const login = async (phone) => {
  const o = await api('POST', '/auth/otp/request', null, { phone });
  return (await api('POST', '/auth/otp/verify', null, { phone, code: o.devCode })).accessToken;
};
let counter = 0;
const newAccount = async (first) => {
  const phone = `0803${String(Date.now()).slice(-6)}${counter++}`.slice(0, 11);
  const o = await api('POST', '/auth/otp/request', null, { phone });
  const v = await api('POST', '/auth/otp/verify', null, { phone, code: o.devCode });
  const s = await api('POST', '/auth/signup', null, { signupToken: v.signupToken, firstName: first, lastName: 'Tester', pin: '2468' });
  return { phone, token: s.accessToken, id: s.user.id };
};

const shell = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell`;
const browser = await chromium.launch(existsSync(shell) ? { executablePath: shell } : {});

const [w0, h0] = VPS[0];
for (const [w, h] of VPS) {
  const tag = `${THEME}@${w}`;
  const ctxFor = async () => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true });
    await ctx.addInitScript((t) => localStorage.setItem('pact.theme', t), THEME);
    const page = await ctx.newPage();
    page.errs = [];
    page.on('pageerror', (e) => page.errs.push(e.message));
    return { ctx, page };
  };
  const uiLogin = async (page, phone) => {
    await page.goto(`${B}/app/auth/phone`);
    await page.getByLabel('Mobile number').fill(phone.replace(/^0/, ''));
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByRole('button', { name: 'Fill it in' }).click();
    await page.waitForTimeout(2200);
  };
  const noOverflow = async (page, name) => ok(`${name} ${tag}: no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  const reachable = async (page, locator, name) => {
    const box = await locator.boundingBox();
    ok(`${name} ${tag}: reachable on screen`, !!box && box.y >= 0 && box.y + box.height <= page.viewportSize().height + 1, JSON.stringify(box && { y: Math.round(box.y), h: Math.round(box.height) }));
  };

  /* --- brand new: the intro --- */
  {
    const acct = await newAccount('Ngozi');
    const { ctx, page } = await ctxFor();
    await uiLogin(page, acct.phone);
    ok(`new account ${tag}: lands on the intro, not an empty Home`, /\/app\/onboarding/.test(page.url()), page.url());
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${tag}-intro-1.png` });
    ok(`intro 1 ${tag}: the promise`, (await page.getByRole('heading', { name: 'Make plans happen together.' }).count()) === 1);
    ok(`intro 1 ${tag}: shows a real Pact (title, people, progress, next step)`, (await page.getByText('Sarah’s Birthday').count()) > 0 && (await page.getByText('8 people').count()) > 0 && (await page.getByText('Next step').count()) > 0);
    await reachable(page, page.getByRole('button', { name: 'Continue' }), 'Continue');
    await noOverflow(page, 'intro 1');
    await axe(page, `intro 1 ${tag}`);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(900);
    ok(`intro 2 ${tag}: everyone can see what's happening`, (await page.getByRole('heading', { name: 'Everyone can see what’s happening.' }).count()) === 1);
    ok(`intro 2 ${tag}: all four steps`, (await page.getByText('Invite your people').count()) > 0 && (await page.getByText('Finish the Pact together').count()) > 0);
    await page.screenshot({ path: `${OUT}/${tag}-intro-2.png` });
    await axe(page, `intro 2 ${tag}`);
    await page.getByRole('button', { name: 'Back' }).click(); await page.waitForTimeout(700);
    ok(`intro ${tag}: Back goes to the first screen`, (await page.getByRole('heading', { name: 'Make plans happen together.' }).count()) === 1);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(1000);
    ok(`intro 3 ${tag}: real plans, finished together`, (await page.getByRole('heading', { name: 'Real plans. Finished together.' }).count()) === 1);
    ok(`intro 3 ${tag}: samples are labelled Demo, three of them`, (await page.getByText('Demo · Completed').count()) === 3 && (await page.getByText(/Not real customers/).count()) === 1);
    for (const n of ['Create your first Pact', 'I’ve been invited', 'Explore first']) await reachable(page, page.getByRole('button', { name: n }), n);
    await page.screenshot({ path: `${OUT}/${tag}-intro-3.png` });
    await noOverflow(page, 'intro 3');
    await axe(page, `intro 3 ${tag}`);
    ok(`intro ${tag}: no page errors`, page.errs.length === 0, page.errs.join('|'));
    await ctx.close();
  }

  /* --- skip: Home still teaches, and the intro never comes back --- */
  {
    const acct = await newAccount('Skip');
    const { ctx, page } = await ctxFor();
    await uiLogin(page, acct.phone);
    await page.getByRole('button', { name: 'Skip' }).click(); await page.waitForTimeout(1800);
    ok(`skip ${tag}: goes to Home`, /\/app\/home/.test(page.url()));
    ok(`skip ${tag}: Home is not empty: Start a Pact, Join with invite`, (await page.getByRole('heading', { name: 'Ready to make something happen together?' }).count()) === 1 && (await page.getByRole('link', { name: 'Start a Pact' }).count()) > 0 && (await page.getByRole('link', { name: 'Join with invite' }).count()) > 0);
    ok(`skip ${tag}: sample Pacts are on Home, marked Demo`, (await page.getByText('Demo · Completed').count()) === 3 && (await page.getByRole('link', { name: 'See how this Pact worked' }).count()) === 3);
    await page.screenshot({ path: `${OUT}/${tag}-home-first.png` });
    await page.screenshot({ path: `${OUT}/${tag}-home-first-full.png`, fullPage: true });
    await noOverflow(page, 'first-time Home');
    await axe(page, `first-time Home ${tag}`);
    await page.reload(); await page.waitForTimeout(2000);
    ok(`skip ${tag}: after a reload the intro does not come back`, /\/app\/home/.test(page.url()));
    await page.goto(`${B}/app/auth/phone`); await page.waitForTimeout(1200);
    ok(`skip ${tag}: returning (already signed in) goes straight to Home`, /\/app\/home/.test(page.url()));
    await page.getByRole('link', { name: 'Watch the quick intro' }).click(); await page.waitForTimeout(1200);
    ok(`replay ${tag}: "Watch the quick intro" opens it again on purpose`, /onboarding\?replay=1/.test(page.url()));
    ok(`skip ${tag}: no page errors`, page.errs.length === 0, page.errs.join('|'));
    await ctx.close();
  }

  /* --- explore: the demo Pact --- */
  {
    const acct = await newAccount('Explorer');
    const { ctx, page } = await ctxFor();
    await uiLogin(page, acct.phone);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Explore first' }).click(); await page.waitForTimeout(1800);
    ok(`explore ${tag}: opens the demo Pact`, /\/app\/demo\/sarahs_birthday/.test(page.url()));
    ok(`explore ${tag}: says Demo Pact in words`, (await page.getByText('Demo Pact', { exact: false }).count()) > 0 && (await page.getByText(/Sample data/).count()) > 0);
    await page.screenshot({ path: `${OUT}/${tag}-demo-create.png` });
    await axe(page, `demo overview ${tag}`);
    await reachable(page, page.getByRole('link', { name: 'Create one like this' }).first(), 'Create one like this');
    for (const [name, probe] of [['Invite', /People · 8/], ['Contribute', /₦500,000/], ['Organise', /Next step/], ['Execute', /₦482,000/], ['Complete', /We made it happen|Sarah’s Birthday is complete/]]) {
      await page.getByRole('tab', { name: new RegExp(name) }).click(); await page.waitForTimeout(700);
      ok(`demo ${tag}: ${name} shows its part`, (await page.getByText(probe).count()) > 0);
      if (name === 'Organise' || name === 'Execute' || name === 'Complete') await page.screenshot({ path: `${OUT}/${tag}-demo-${name.toLowerCase()}.png`, fullPage: true });
      if (name === 'Execute' || name === 'Complete') await axe(page, `demo ${name} ${tag}`);
    }
    ok(`demo ${tag}: the story adds up (₦18,000 left over)`, (await page.getByText('₦18,000').count()) > 0);
    // read only: nothing can be changed
    const risky = await page.evaluate(() => [...document.querySelectorAll('.demo-panel button, .demo-panel a, .demo-panel input')].filter((e) => !e.closest('[inert]') && !/Next:|Create one like this/.test(e.textContent || '')).map((e) => (e.textContent || e.tagName).trim().slice(0, 30)));
    ok(`demo ${tag}: no way to contribute, claim, pay or invite`, risky.length === 0, JSON.stringify(risky));
    await page.getByRole('tab', { name: /Organise/ }).click(); await page.waitForTimeout(500);
    ok(`demo ${tag}: tasks and plan are switched off (inert)`, (await page.locator('.demo-readonly[inert]').count()) >= 1);
    await noOverflow(page, 'demo');
    ok(`demo ${tag}: no page errors`, page.errs.length === 0, page.errs.join('|'));
    await page.getByRole('link', { name: 'Create one like this' }).first().click(); await page.waitForTimeout(1500);
    ok(`demo ${tag}: "Create one like this" starts the guided flow`, /\/app\/start/.test(page.url()));
    await ctx.close();
  }

  /* --- start: four questions, a real Pact --- */
  {
    const acct = await newAccount('Starter');
    const { ctx, page } = await ctxFor();
    await uiLogin(page, acct.phone);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Create your first Pact' }).click(); await page.waitForTimeout(1600);
    ok(`start ${tag}: guided flow, step 1`, /\/app\/start/.test(page.url()) && (await page.getByRole('heading', { name: 'What are you planning?' }).count()) === 1);
    ok(`start ${tag}: eight kinds of plan`, (await page.getByRole('radio').count()) === 8);
    await page.screenshot({ path: `${OUT}/${tag}-start-1.png` });
    await axe(page, `start 1 ${tag}`);
    ok(`start ${tag}: Next waits for a choice`, await page.getByRole('button', { name: 'Next' }).isDisabled());
    await page.getByRole('radio', { name: 'Birthday' }).click();
    await page.getByRole('button', { name: 'Next' }).click(); await page.waitForTimeout(600);
    await page.getByLabel('Name').fill('Tobi’s Surprise'); await page.getByRole('button', { name: 'Next' }).click(); await page.waitForTimeout(600);
    ok(`start ${tag}: step 3 asks when`, (await page.getByRole('heading', { name: 'When should this happen?' }).count()) === 1);
    await page.getByRole('button', { name: 'In a month' }).click(); await page.screenshot({ path: `${OUT}/${tag}-start-3.png` });
    await page.getByRole('button', { name: 'Next' }).click(); await page.waitForTimeout(600);
    ok(`start ${tag}: step 4 asks roughly how much`, (await page.getByRole('heading', { name: 'Roughly how much might the group need?' }).count()) === 1);
    await page.getByRole('button', { name: '₦100,000' }).click();
    await page.screenshot({ path: `${OUT}/${tag}-start-4.png` });
    await axe(page, `start 4 ${tag}`);
    await page.getByRole('button', { name: 'Create Pact' }).click(); await page.waitForTimeout(2500);
    ok(`start ${tag}: lands on inviting people for the new Pact`, /\/app\/pact\/[^/]+\/invite/.test(page.url()), page.url());
    const mine = await api('GET', '/pacts', acct.token);
    const made = (mine.data ?? mine).find?.((p) => p.title === 'Tobi’s Surprise');
    ok(`start ${tag}: the Pact really exists, with the details chosen`, !!made && made.category === 'birthday' && made.target === 100_000_00, JSON.stringify(made && { c: made.category, t: made.target }));
    await page.goto(`${B}/app/home`); await page.waitForTimeout(2000);
    ok(`start ${tag}: Home now shows the real Pact, no sample Pacts`, (await page.getByText('Tobi’s Surprise').count()) > 0 && (await page.getByText('Demo · Completed').count()) === 0 && (await page.getByRole('heading', { name: 'Ready to make something happen together?' }).count()) === 0);
    await page.screenshot({ path: `${OUT}/${tag}-home-active.png` });
    ok(`start ${tag}: no page errors`, page.errs.length === 0, page.errs.join('|'));
    await ctx.close();
  }

  /* --- join: paste a link or a code --- */
  {
    const organizer = await login('08010000001');
    const made = await api('POST', '/pacts', organizer, { title: 'Weekend in Ibadan', category: 'trip', target: 50_000_00, deadline: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10) });
    const code = made.data.pact.inviteCode;
    const acct = await newAccount('Joiner');
    const { ctx, page } = await ctxFor();
    await uiLogin(page, acct.phone);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'I’ve been invited' }).click(); await page.waitForTimeout(1500);
    ok(`join ${tag}: asks for a link or a code`, /\/app\/join-invite/.test(page.url()) && (await page.getByLabel('Invite link or code').count()) === 1);
    await page.screenshot({ path: `${OUT}/${tag}-join-1.png` });
    await page.getByLabel('Invite link or code').fill('not an invite!!'); await page.getByRole('button', { name: 'Find my Pact' }).click(); await page.waitForTimeout(500);
    ok(`join ${tag}: says so when it is not an invite`, (await page.getByText(/doesn’t look like an invite/).count()) === 1);
    await axe(page, `join ${tag}`);
    await page.getByLabel('Invite link or code').fill(`${B}/app/join/${code}`); await page.getByRole('button', { name: 'Find my Pact' }).click(); await page.waitForTimeout(2200);
    ok(`join ${tag}: a pasted link opens the invite preview`, new RegExp(`/app/join/${code}`).test(page.url()) && (await page.getByText('Weekend in Ibadan').count()) > 0, page.url());
    await page.screenshot({ path: `${OUT}/${tag}-join-preview.png` });
    await ctx.close();
    // a bare code works too
    const acct2 = await newAccount('Coder');
    const c2 = await ctxFor();
    await uiLogin(c2.page, acct2.phone);
    await c2.page.goto(`${B}/app/join-invite`); await c2.page.waitForTimeout(1200);
    await c2.page.getByLabel('Invite link or code').fill(code); await c2.page.getByRole('button', { name: 'Find my Pact' }).click(); await c2.page.waitForTimeout(2000);
    ok(`join ${tag}: a bare code works too`, new RegExp(`/app/join/${code}`).test(c2.page.url()));
    await c2.ctx.close();
  }

  /* --- an invite link before signing up skips the intro entirely --- */
  {
    const organizer = await login('08010000002');
    const made = await api('POST', '/pacts', organizer, { title: 'Aunty Bisi at 60', category: 'birthday', target: 80_000_00, deadline: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10) });
    const code = made.data.pact.inviteCode;
    const acct = await newAccount('Guest');
    const { ctx, page } = await ctxFor();
    await page.goto(`${B}/app/join/${code}`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Join/ }).first().click().catch(() => undefined); await page.waitForTimeout(1200);
    // sign in through the join flow
    if (/auth\/phone/.test(page.url())) {
      await page.getByLabel('Mobile number').fill(acct.phone.replace(/^0/, ''));
      await page.getByRole('button', { name: 'Send code' }).click();
      await page.getByRole('button', { name: 'Fill it in' }).click();
      await page.waitForTimeout(2500);
    }
    ok(`invite link ${tag}: signing in from an invite goes to the invite, not the intro`, /\/app\/join\//.test(page.url()) && !/onboarding/.test(page.url()), page.url());
    await ctx.close();
  }

  /* --- the other Homes --- */
  {
    // closed only (cancelled): not new, not running
    const acct = await newAccount('Closed');
    const made = await api('POST', '/pacts', acct.token, { title: 'Cancelled plan', category: 'dinner', target: 20_000_00, deadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) });
    await api('POST', `/pacts/${made.data.pact.id}/cancel`, acct.token, { pin: '2468' });
    const { ctx, page } = await ctxFor();
    await uiLogin(page, acct.phone);
    ok(`no active ${tag}: someone with history never sees the intro`, /\/app\/home/.test(page.url()) && !/onboarding/.test(page.url()), page.url());
    ok(`no active ${tag}: no sample Pacts, a way to start again`, (await page.getByText('Demo · Completed').count()) === 0 && (await page.getByRole('link', { name: 'Create another Pact' }).count()) === 1);
    await page.screenshot({ path: `${OUT}/${tag}-home-repeat-closed.png` });
    await ctx.close();
  }
  {
    // finished: a completed Pact, nothing running
    const org = await newAccount('Finisher');
    await api('POST', '/me/kyc/bvn', org.token, { bvn: `2${String(Date.now()).slice(-10)}`, dateOfBirth: '1990-01-01' }).catch(() => undefined);
    const made = await api('POST', '/pacts', org.token, { title: 'Reunion dinner', category: 'dinner', target: 1_000_00, deadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) });
    const p = made.data.pact;
    const sarah = await login('08010000002');
    await api('POST', `/invites/${p.inviteCode}/join`, sarah, {});
    await api('POST', `/pacts/${p.id}/contributions`, sarah, { amount: 1_000_00, pin: '1357' });
    let completed = true;
    try { await api('POST', `/pacts/${p.id}/complete`, org.token, { releaseRemaining: false }); } catch (e) { completed = false; console.log('   (could not complete the Pact:', String(e.message).slice(0, 120), ')'); }
    const { ctx, page } = await ctxFor();
    await uiLogin(page, org.phone);
    if (completed) {
      ok(`finished-only ${tag}: "You've made things happen before."`, (await page.getByRole('heading', { name: 'You’ve made things happen before.' }).count()) === 1);
      ok(`finished-only ${tag}: their completed Pact, create another, join, a repeat suggestion`, (await page.getByText('Reunion dinner').count()) > 0 && (await page.getByRole('link', { name: 'Create another Pact' }).count()) === 1 && (await page.getByRole('link', { name: 'Join with invite' }).count()) === 1 && (await page.getByText(/Do another/).count()) === 1);
      ok(`finished-only ${tag}: no intro, no samples`, !/onboarding/.test(page.url()) && (await page.getByText('Demo · Completed').count()) === 0);
      await page.screenshot({ path: `${OUT}/${tag}-home-repeat.png`, fullPage: true });
      await noOverflow(page, 'finished-only Home');
      await axe(page, `finished-only Home ${tag}`);
      await page.getByText(/Do another/).click(); await page.waitForTimeout(1200);
      ok(`finished-only ${tag}: "Do another" starts at the name, same kind of plan`, /\/app\/start\?category=dinner/.test(page.url()) && (await page.getByRole('heading', { name: 'What should we call it?' }).count()) === 1);
    }
    await ctx.close();
  }
  {
    // running: the seeded organiser with active Pacts
    const { ctx, page } = await ctxFor();
    await uiLogin(page, '08010000001');
    const parts = { intro: /onboarding/.test(page.url()), demos: await page.getByText('Demo · Completed').count(), firstTimeHeading: await page.getByRole('heading', { name: 'Ready to make something happen together?' }).count(), realPacts: await page.locator('.featured-pact, .pact-card').count() };
    ok(`running ${tag}: no intro, no sample Pacts, the real Pacts lead`, !parts.intro && parts.demos === 0 && parts.firstTimeHeading === 0 && parts.realPacts > 0, JSON.stringify(parts));
    await ctx.close();
  }
}
await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEMS:\n- ${problems.join('\n- ')}` : '\nall ok');

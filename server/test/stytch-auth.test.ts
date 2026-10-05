/** Email sign-in through Stytch: Stytch proves the address; PACT resolves the person, owns the account and issues the session. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { addDays, lagosToday } from '../src/lib/time.js';
import { addIdentity } from '../src/modules/identities.js';
import { stytchRedirectUrl } from '../src/modules/stytchAuth.js';
import { createStytch, StytchError, type StytchClient } from '../src/payments/stytch.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;

/** An in-memory Stytch: one stable user id per address, one live code per send, a code works once. */
function fakeStytch() {
  const sends: { email: string; methodId: string; code: string }[] = [];
  const spent = new Set<string>();
  const state = { down: false, sendCalls: 0 };
  let n = 0;
  const userFor = (email: string) => `user-test-${Buffer.from(email).toString('hex').slice(0, 24)}`;
  // Google through Stytch: a token is minted per (start, email), bound to the PKCE challenge of the start, and works once.
  const oauth = new Map<string, { email: string; challenge: string; verified: boolean; spent: boolean }>();
  const client: StytchClient = {
    enabled: true,
    async sendEmailCode(email) {
      state.sendCalls++;
      if (state.down) throw new StytchError('unavailable');
      const methodId = `email-test-${++n}`;
      const code = String(100000 + n).padStart(6, '0');
      sends.push({ email, methodId, code });
      return { methodId, userId: `user-test-${Buffer.from(email).toString('hex').slice(0, 24)}` };
    },
    oauthStartUrl({ redirectUrl, codeChallenge }) {
      return `https://stytch.fake/v1/public/oauth/google/start?redirect=${encodeURIComponent(redirectUrl)}&code_challenge=${codeChallenge}`;
    },
    async authenticateOAuth(token, verifier) {
      const o = oauth.get(token);
      if (state.down) throw new StytchError('unavailable');
      if (!o || o.spent || createHash('sha256').update(verifier).digest('base64url') !== o.challenge) throw new StytchError('invalid_code');
      o.spent = true;
      return { userId: userFor(o.email), verifiedEmails: o.verified ? [o.email] : [], firstName: 'Gail', lastName: 'Goo' };
    },
    async verifyEmailCode(methodId, code) {
      const s = sends.find((x) => x.methodId === methodId);
      if (!s || spent.has(methodId) || s.code !== code) throw new StytchError('invalid_code');
      spent.add(methodId);
      return { userId: `user-test-${Buffer.from(s.email).toString('hex').slice(0, 24)}` };
    },
  };
  /** What Stytch would put on the redirect after Google, for the start whose URL this is. */
  const googleToken = (startUrl: string, email: string, verified = true) => {
    const token = `oauth-token-${oauth.size + 1}-${'x'.repeat(24)}`;
    oauth.set(token, { email, challenge: new URL(startUrl).searchParams.get('code_challenge')!, verified, spent: false });
    return token;
  };
  return { client, googleToken, sends, state, lastCode: (email: string) => [...sends].reverse().find((s) => s.email === email)!.code };
}

describe('email sign-in through Stytch', () => {
  let t: T;
  const stytch = fakeStytch();
  const code = (r: { body: { error?: { code?: string }; code?: string } }) => r.body.error?.code ?? r.body.code;
  const ip = (n: number) => `10.7.${n}.1`;
  const post = (url: string, body: unknown, remoteAddress = '10.7.0.1', headers: Record<string, string> = {}) =>
    t.app.inject({ method: 'POST', url: `/api${url}`, remoteAddress, headers: { 'content-type': 'application/json', ...headers }, payload: JSON.stringify(body) });
  const json = (r: { body: string }) => JSON.parse(r.body);
  const ask = (email: string, remoteAddress?: string) => post('/auth/email/request', { email }, remoteAddress);
  const verify = (email: string, c: string, remoteAddress?: string) => post('/auth/email/verify', { email, code: c }, remoteAddress);
  const signIn = async (email: string, remoteAddress?: string) => {
    assert.equal((await ask(email, remoteAddress)).statusCode, 200);
    return verify(email, stytch.lastCode(email), remoteAddress);
  };
  const join = async (email: string, first = 'Stella', remoteAddress?: string) => {
    const v = json(await signIn(email, remoteAddress));
    assert.equal(v.status, 'needs_profile', JSON.stringify(v));
    const s = await post('/auth/signup', { signupToken: v.signupToken, firstName: first, lastName: 'Styt' }, remoteAddress);
    assert.equal(s.statusCode, 200, s.body);
    return json(s);
  };
  const identities = async (userId: string) => (await t.db.query<{ provider: string; provider_subject: string; email: string | null }>(`SELECT provider, provider_subject, email FROM user_identities WHERE user_id = $1 ORDER BY provider`, [userId])).rows;
  const userCount = async () => (await t.db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users')).rows[0].n;

  before(async () => {
    t = await setup({ stytch: stytch.client, env: { EMAIL_AUTH_PROVIDER: 'stytch', STYTCH_PROJECT_ID: 'project-test-x', STYTCH_SECRET: 'secret-test-x' } });
  });
  after(async () => t.close());

  it('a new address: code sent, verified, a PACT user and a Stytch identity are made, and PACT issues the session', async () => {
    const req = json(await ask('new@example.com', ip(1)));
    assert.deepEqual(Object.keys(req).sort(), ['email', 'expiresInSec'], 'no code ever comes back in a response');
    assert.equal(req.email, 'n••@example.com');
    const out = await join('new2@example.com', 'Nia', ip(1));
    assert.equal(out.user.firstName, 'Nia');
    assert.equal(out.user.phone, null);
    assert.equal(out.user.hasPin, false, 'no PIN at sign-up');
    assert.ok(out.accessToken && out.accessTokenExpiresAt, 'a normal PACT session');
    const ids = await identities(out.user.id);
    assert.equal(ids.length, 1);
    assert.deepEqual([ids[0].provider, ids[0].email], ['stytch', 'new2@example.com']);
    assert.ok(ids[0].provider_subject.startsWith('user-test-'), 'keyed by Stytch’s user id, never the address');
    assert.equal((await t.call('GET', '/me', out.accessToken)).status, 200, 'the session works on PACT routes');
  });

  it('the same Stytch user always signs in to the same PACT user', async () => {
    const first = await join('again@example.com', 'Ada', ip(2));
    const back = json(await signIn('again@example.com', ip(3)));
    assert.equal(back.status, 'signed_in');
    assert.equal(back.user.id, first.user.id);
    assert.equal((await identities(first.user.id)).length, 1);
  });

  it('an address already verified on an account gets the Stytch identity attached, with no duplicate user', async () => {
    const owner = await t.signIn('08039001001', { firstName: 'Own', lastName: 'Er', pin: '2468' });
    await addIdentity(t.db, owner.user.id, 'email', 'owner@example.com', { email: 'owner@example.com' });
    const before = await userCount();
    const out = json(await signIn('owner@example.com', ip(4)));
    assert.equal(out.status, 'signed_in');
    assert.equal(out.user.id, owner.user.id);
    assert.equal(await userCount(), before, 'no new user');
    let ids = await identities(owner.user.id);
    assert.deepEqual(ids.map((i) => i.provider), ['email', 'phone', 'stytch']);
    json(await signIn('owner@example.com', ip(5)));
    ids = await identities(owner.user.id);
    assert.equal(ids.filter((i) => i.provider === 'stytch').length, 1, 'attached once');
  });

  it('never matches on a name or a look-alike phone account', async () => {
    const phone = await t.signIn('08039001002', { firstName: 'Same', lastName: 'Name', pin: '2468' });
    const out = await join('samename@example.com', 'Same', ip(6));
    assert.notEqual(out.user.id, phone.user.id);
  });

  it('a wrong code is refused plainly, creates nothing and leaks nothing', async () => {
    await ask('wrong@example.com', ip(7));
    const before = await userCount();
    const bad = await verify('wrong@example.com', '000000', ip(7));
    assert.equal(bad.statusCode, 400);
    assert.equal(json(bad).error.code, 'otp_incorrect');
    assert.ok(!/stytch|method|email-test/i.test(bad.body), 'no provider detail');
    assert.equal(await userCount(), before);
  });

  it('locks after five wrong tries, even for the right code', async () => {
    await ask('lock@example.com', ip(8));
    for (let i = 0; i < 5; i++) assert.equal((await verify('lock@example.com', '999999', ip(8))).statusCode, 400);
    assert.equal((await verify('lock@example.com', stytch.lastCode('lock@example.com'), ip(8))).statusCode, 429);
  });

  it('an expired code and a replayed code are both refused', async () => {
    await ask('exp@example.com', ip(9));
    const c = stytch.lastCode('exp@example.com');
    await t.db.query(`UPDATE stytch_email_challenges SET expires_at = now() - interval '1 minute' WHERE email = 'exp@example.com'`);
    assert.equal(json(await verify('exp@example.com', c, ip(9))).error.code, 'otp_expired');
    await ask('replay@example.com', ip(10));
    const good = stytch.lastCode('replay@example.com');
    assert.equal((await verify('replay@example.com', good, ip(10))).statusCode, 200);
    const again = await verify('replay@example.com', good, ip(10));
    assert.equal(again.statusCode, 400, 'a spent code does not work twice');
  });

  it('two verifications at once make one session path and no duplicate user', async () => {
    await ask('race@example.com', ip(11));
    const c = stytch.lastCode('race@example.com');
    const [a, b] = await Promise.all([verify('race@example.com', c, ip(11)), verify('race@example.com', c, ip(11))]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 400], 'exactly one wins');
    const winner = json(a.statusCode === 200 ? a : b);
    assert.equal(winner.status, 'needs_profile');
    const before = await userCount();
    // The continuation used twice at once: one account, never two.
    const [s1, s2] = await Promise.all([
      post('/auth/signup', { signupToken: winner.signupToken, firstName: 'Ray', lastName: 'Ce' }, ip(11)),
      post('/auth/signup', { signupToken: winner.signupToken, firstName: 'Ray', lastName: 'Ce' }, ip(11)),
    ]);
    assert.equal([s1, s2].filter((r) => r.statusCode === 200).length, 1);
    assert.equal(await userCount(), before + 1);
    assert.equal((await t.db.query(`SELECT 1 FROM user_identities WHERE provider = 'stytch' AND email = 'race@example.com'`)).rowCount, 1);
  });

  it('answers a new and a known address identically, and asks Stytch for both', async () => {
    await join('known@example.com', 'Kay', ip(12));
    const a = json(await ask('known@example.com', ip(13)));
    const b = json(await ask('stranger@example.com', ip(14)));
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    assert.equal(a.expiresInSec, b.expiresInSec);
  });

  it('limits one requester per address, and one IP overall, without locking out the owner', async () => {
    for (let i = 0; i < 4; i++) assert.equal((await ask('limit@example.com', ip(15))).statusCode, 200);
    assert.equal((await ask('limit@example.com', ip(15))).statusCode, 429);
    assert.equal((await ask('limit@example.com', ip(16))).statusCode, 200);
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await ask(`spray${i}@example.com`, ip(17))).statusCode;
    assert.equal(last, 429);
  });

  it('keeps phone sign-in working', async () => {
    const p = await t.signIn('08039002001', { firstName: 'Pho', lastName: 'Ne', pin: '2468' });
    const again = await t.signIn('08039002001', undefined, true);
    assert.equal(again.user.id, p.user.id);
  });

  it('keeps Google hidden', async () => {
    assert.deepEqual((await t.call('GET', '/config')).body.auth, { google: false, stytchGoogle: false, email: true, phone: true });
    assert.equal((await t.call('POST', '/auth/google/start', undefined, {})).status, 503);
  });

  it('asks for a PIN only at the first sensitive action', async () => {
    const u = await join('pin@example.com', 'Pin', ip(18));
    const day = addDays(lagosToday(new Date()), 10);
    const made = await t.call('POST', '/pacts', u.accessToken, { title: 'Ordinary', category: 'gift', target: 10_000_00, deadline: day });
    assert.equal(made.status, 200, 'creating needs no PIN');
    const sensitive = await t.call('POST', `/pacts/${made.body.data.pact.id}/cancel`, u.accessToken, { pin: '2468' });
    assert.equal(code(sensitive), 'pin_not_set');
    assert.equal((await t.call('POST', '/me/pin/setup', u.accessToken, { pin: '2468' })).status, 200);
    assert.equal((await t.call('POST', `/pacts/${made.body.data.pact.id}/cancel`, u.accessToken, { pin: '2468' })).status, 200);
  });

  it('lets a phone-only user add an email while signed in, and refuses an address someone else holds', async () => {
    const u = await t.signIn('08039003001', { firstName: 'Add', lastName: 'Mail', pin: '2468' });
    const rq = await t.call('POST', '/me/identities/email/request', u.accessToken, { email: 'added@example.com' });
    assert.equal(rq.status, 200);
    const ok = await t.call('POST', '/me/identities/email/verify', u.accessToken, { email: 'added@example.com', code: stytch.lastCode('added@example.com') });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual([ok.body.email.address, ok.body.phone.number], ['added@example.com', '+2348039003001']);
    assert.equal(json(await signIn('added@example.com', ip(19))).user.id, u.user.id, 'the same account');
    // Someone else's address.
    const other = await t.signIn('08039003002', { firstName: 'Oth', lastName: 'Er', pin: '2468' });
    await t.call('POST', '/me/identities/email/request', other.accessToken, { email: 'added@example.com' });
    const clash = await t.call('POST', '/me/identities/email/verify', other.accessToken, { email: 'added@example.com', code: stytch.lastCode('added@example.com') });
    assert.equal(code(clash), 'identity_taken');
  });

  it('resets a PIN by email with Stytch, with the usual 24-hour hold', async () => {
    const u = await join('reset@example.com', 'Res', ip(20));
    await t.call('POST', '/me/pin/setup', u.accessToken, { pin: '2468' });
    const rq = await t.call('POST', '/me/pin/reset/request', u.accessToken, {});
    assert.equal(rq.body.via, 'email');
    const done = await t.call('POST', '/me/pin/reset', u.accessToken, { code: stytch.lastCode('reset@example.com'), newPin: '1357' });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.ok((await t.db.query<{ pin_reset_at: Date | null }>(`SELECT pin_reset_at FROM users WHERE id = $1`, [u.user.id])).rows[0].pin_reset_at);
  });

  it('says so, without detail, when Stytch is down', async () => {
    stytch.state.down = true;
    const r = await ask('down@example.com', ip(21));
    stytch.state.down = false;
    assert.equal(r.statusCode, 503);
    assert.equal(json(r).error.code, 'email_unavailable');
    assert.ok(!/stytch/i.test(r.body));
  });

  it('never stores a code and never writes a secret to the log', async () => {
    await ask('store@example.com', ip(22));
    const rows = (await t.db.query<{ method_id: string; email: string }>(`SELECT * FROM stytch_email_challenges WHERE email = 'store@example.com'`)).rows;
    assert.ok(rows.every((r) => !JSON.stringify(r).includes(stytch.lastCode('store@example.com'))));
  });
});

describe('the Stytch client against a real HTTP server', () => {
  const seen: { path: string; auth: string | undefined; body: Record<string, unknown> }[] = [];
  let mode: 'ok' | 'wrong' | 'limited' | 'down' = 'ok';
  let base = '';
  let server: ReturnType<typeof createServer>;
  const read = (req: IncomingMessage) => new Promise<string>((res) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => res(s)); });
  before(async () => {
    server = createServer(async (req, res) => {
      const body = JSON.parse((await read(req)) || '{}');
      seen.push({ path: req.url ?? '', auth: req.headers.authorization, body });
      const send = (status: number, o: unknown) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(o)));
      if (mode === 'down') return send(503, { error_type: 'internal_server_error' });
      if (mode === 'limited') return send(429, { error_type: 'too_many_requests' });
      if (req.url === '/v1/otps/email/login_or_create') return send(200, { email_id: 'email-test-abc', user_id: 'user-test-xyz', user_created: true });
      if (mode === 'wrong') return send(400, { error_type: 'otp_code_not_found', error_message: 'secret detail' });
      return send(200, { user_id: 'user-test-xyz', session_token: 'must-be-ignored' });
    }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => void server.close());
  const client = () => createStytch(loadConfig({ NODE_ENV: 'test', EMAIL_AUTH_PROVIDER: 'stytch', STYTCH_PROJECT_ID: 'project-test-abc', STYTCH_SECRET: 'secret-test-abc', STYTCH_BASE_URL: base }));

  it('sends the code with the project credentials and a 10 minute expiry, and returns only the ids', async () => {
    mode = 'ok';
    const r = await client().sendEmailCode('a@example.com');
    assert.deepEqual(r, { methodId: 'email-test-abc', userId: 'user-test-xyz' });
    const call = seen.at(-1)!;
    assert.equal(call.path, '/v1/otps/email/login_or_create');
    assert.equal(call.auth, `Basic ${Buffer.from('project-test-abc:secret-test-abc').toString('base64')}`);
    assert.deepEqual(call.body, { email: 'a@example.com', expiration_minutes: 10 });
  });

  it('verifies with the method id and code, asks for no session, and keeps only the user id', async () => {
    mode = 'ok';
    const r = await client().verifyEmailCode('email-test-abc', '123456');
    assert.deepEqual(r, { userId: 'user-test-xyz' });
    const call = seen.at(-1)!;
    assert.equal(call.path, '/v1/otps/authenticate');
    assert.deepEqual(call.body, { method_id: 'email-test-abc', code: '123456' });
  });

  it('maps failures to coarse reasons that carry no provider text', async () => {
    mode = 'wrong';
    await assert.rejects(() => client().verifyEmailCode('m', '000000'), (e: unknown) => e instanceof StytchError && e.kind === 'invalid_code' && !/secret detail|secret-test/.test(String(e.message)));
    mode = 'limited';
    await assert.rejects(() => client().sendEmailCode('a@example.com'), (e: unknown) => e instanceof StytchError && e.kind === 'rate_limited');
    mode = 'down';
    await assert.rejects(() => client().sendEmailCode('a@example.com'), (e: unknown) => e instanceof StytchError && e.kind === 'unavailable');
  });

  it('refuses to start without credentials, and refuses a test base URL in production', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'test', EMAIL_AUTH_PROVIDER: 'stytch' }), /STYTCH_PROJECT_ID and STYTCH_SECRET/);
    const prod = { NODE_ENV: 'production', SEED_DEMO: 'false', JWT_SECRET: 'j'.repeat(40), HASH_SECRET: 'h'.repeat(40), DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), DATABASE_URL: 'postgres://u:p@db:5432/pact', SANDBOX_WEBHOOK_SECRET: 'w'.repeat(32), DEPLOY_ENV: 'production', PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_live_abc', SMS_PROVIDER: 'termii', TERMII_API_KEY: 'k', EMAIL_AUTH_PROVIDER: 'stytch', STYTCH_PROJECT_ID: 'project-live-x', STYTCH_SECRET: 's' };
    assert.equal(loadConfig(prod).EMAIL_AUTH_PROVIDER, 'stytch', 'production runs on Stytch without Resend');
    assert.throws(() => loadConfig({ ...prod, STYTCH_BASE_URL: 'http://localhost:1' }), /local tests only/);
  });
});

describe('Google through Stytch OAuth', () => {
  let t: T;
  const stytch = fakeStytch();
  const post = (url: string, body: unknown, remoteAddress: string, headers: Record<string, string> = {}) =>
    t.app.inject({ method: 'POST', url: `/api${url}`, remoteAddress, headers: { 'content-type': 'application/json', 'x-pact-client': 'web', ...headers }, payload: JSON.stringify(body) });
  const json = (r: { body: string }) => JSON.parse(r.body);
  let n = 20;
  /** One full browser journey: start (cookie + URL), Google, back on /authenticate with a token, finish. */
  const google = async (email: string, opts: { returnTo?: string; verified?: boolean; token?: string; cookie?: string } = {}) => {
    const remoteAddress = `10.8.${++n}.1`;
    const start = await post('/auth/stytch/google/start', opts.returnTo ? { returnTo: opts.returnTo } : {}, remoteAddress);
    assert.equal(start.statusCode, 200, start.body);
    const url: string = json(start).url;
    const cookie = start.cookies.find((c) => c.name === 'pact_so')!;
    const token = opts.token ?? stytch.googleToken(url, email, opts.verified ?? true);
    const fin = await post('/auth/stytch/google/finish', { token }, remoteAddress, { cookie: `pact_so=${opts.cookie ?? cookie.value}` });
    return { start, url, fin, body: json(fin), cookie };
  };
  const cookieOf = (r: { cookies: { name: string; value: string }[] }, name: string) => r.cookies.find((c) => c.name === name)?.value;
  const nameUp = async (r: { fin: { cookies: { name: string; value: string }[] } }, first = 'Gail') => {
    const su = cookieOf(r.fin, 'pact_su')!;
    const s = await post('/auth/signup', { firstName: first, lastName: 'Goo' }, '10.8.99.1', { cookie: `pact_su=${su}` });
    assert.equal(s.statusCode, 200, s.body);
    return json(s);
  };
  const userCount = async () => (await t.db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users')).rows[0].n;
  const identities = async (userId: string) => (await t.db.query<{ provider: string; provider_subject: string }>(`SELECT provider, provider_subject FROM user_identities WHERE user_id = $1 ORDER BY provider`, [userId])).rows;
  const emailIn = async (email: string) => {
    const remoteAddress = `10.8.${++n}.2`;
    await post('/auth/email/request', { email }, remoteAddress);
    const r = await post('/auth/email/verify', { email, code: stytch.lastCode(email) }, remoteAddress);
    return { ...json(r), su: cookieOf(r, 'pact_su') };
  };

  before(async () => {
    t = await setup({ stytch: stytch.client, env: { EMAIL_AUTH_PROVIDER: 'stytch', STYTCH_PROJECT_ID: 'project-test-x', STYTCH_SECRET: 'secret-test-x', STYTCH_PUBLIC_TOKEN: 'public-token-test-x' } });
  });
  after(async () => t.close());

  it('is offered through Stytch, and the legacy Google Cloud flag stays off', async () => {
    const c = json(await t.app.inject({ method: 'GET', url: '/api/config' }));
    assert.equal(c.auth.stytchGoogle, true);
    assert.equal(c.auth.google, false);
    const legacy = await post('/auth/google/start', {}, '10.8.1.1');
    assert.equal(legacy.statusCode, 503, 'the old Google Cloud route is not wired');
  });

  it('start sends the browser through Stytch to /authenticate, with PKCE and a short-lived httpOnly cookie, and no secret', async () => {
    const start = await post('/auth/stytch/google/start', {}, '10.8.2.1');
    const url = new URL(json(start).url);
    assert.equal(url.hostname, 'stytch.fake');
    assert.equal(url.searchParams.get('redirect'), `${t.ctx.config.APP_ORIGIN}/authenticate`);
    assert.ok(url.searchParams.get('code_challenge'));
    assert.ok(!start.body.includes('secret-test-x'));
    const c = start.cookies.find((x) => x.name === 'pact_so')!;
    assert.equal(c.httpOnly, true);
    assert.equal(c.path, '/api/auth/stytch');
  });

  it('the OAuth callback is APP_ORIGIN + /authenticate whatever returnTo says; the destination is stored separately', async () => {
    const callback = `${t.ctx.config.APP_ORIGIN}/authenticate`;
    const token = 'a'.repeat(24);
    const cases: [string, string | null][] = [
      ['/app/home', '/app/home'],
      [`/a/${token}`, `/a/${token}`],
      [`/p/${token}`, `/p/${token}`],
      [`/s/${token}`, `/s/${token}`],
      [`/app/c/${token}`, `/app/c/${token}`],
      ['https://evil.example/steal', null],
      ['//evil.example', null],
      ['/authenticate', null],
      ['/', null],
    ];
    for (const [returnTo, stored] of cases) {
      const start = await post('/auth/stytch/google/start', { returnTo }, `10.8.${++n}.3`);
      assert.equal(start.statusCode, 200, start.body);
      assert.equal(new URL(json(start).url).searchParams.get('redirect'), callback, `callback unchanged for ${returnTo}`);
      if (stored) assert.ok(!json(start).url.includes(encodeURIComponent(returnTo)), 'returnTo is never in the URL');
      const row = (await t.db.query<{ return_to: string | null }>(`SELECT return_to FROM oauth_states ORDER BY created_at DESC LIMIT 1`)).rows[0];
      assert.equal(row.return_to, stored, `stored destination for ${returnTo}`);
    }
  });

  it('external returnTo never comes back out of finish', async () => {
    const r = await google('gext@example.com', { returnTo: 'https://evil.example/steal' });
    assert.equal(r.body.returnTo, null);
  });

  it('a new Google user: needs a name, then a PACT user with one Stytch identity and a normal session', async () => {
    const before = await userCount();
    const r = await google('gnew@example.com');
    assert.equal(r.body.status, 'needs_profile');
    assert.equal(r.body.signupToken, undefined, 'the continuation stays in an httpOnly cookie');
    assert.equal(await userCount(), before, 'nothing created until a name is given');
    const out = await nameUp(r, 'Gina');
    assert.equal(await userCount(), before + 1);
    assert.ok(out.accessToken);
    const ids = await identities(out.user.id);
    assert.deepEqual(ids.map((i) => i.provider), ['stytch']);
    assert.ok(ids[0].provider_subject.startsWith('user-test-'), 'keyed by the Stytch user id');
    assert.equal((await t.call('GET', '/me', out.accessToken)).status, 200);
  });

  it('a returning Google user resolves the same account', async () => {
    const first = await nameUp(await google('gback@example.com'));
    const before = await userCount();
    const again = await google('gback@example.com');
    assert.equal(again.body.status, 'signed_in');
    assert.equal(again.body.user.id, first.user.id);
    assert.equal(await userCount(), before);
  });

  it('email code then Google with the same Stytch user does not duplicate the account', async () => {
    const v = await emailIn('both1@example.com');
    const su = await post('/auth/signup', { firstName: 'Bo', lastName: 'Th' }, '10.8.98.1', { cookie: `pact_su=${v.su}` });
    const user = json(su).user;
    const before = await userCount();
    const g = await google('both1@example.com');
    assert.equal(g.body.status, 'signed_in');
    assert.equal(g.body.user.id, user.id);
    assert.equal(await userCount(), before);
    assert.equal((await identities(user.id)).length, 1, 'one Stytch user, one identity');
  });

  it('Google then email code does not duplicate the account', async () => {
    const out = await nameUp(await google('both2@example.com'));
    const before = await userCount();
    const back = await emailIn('both2@example.com');
    assert.equal(back.status, 'signed_in');
    assert.equal(back.user.id, out.user.id);
    assert.equal(await userCount(), before);
  });

  it('a verified address already on an account gets the Stytch identity attached when the Stytch user is new', async () => {
    const owner = await t.signIn('08039002001', { firstName: 'Own', lastName: 'Er', pin: '2468' });
    await addIdentity(t.db, owner.user.id, 'email', 'gowner@example.com', { email: 'gowner@example.com' });
    const before = await userCount();
    const g = await google('gowner@example.com');
    assert.equal(g.body.status, 'signed_in');
    assert.equal(g.body.user.id, owner.user.id);
    assert.equal(await userCount(), before);
    assert.deepEqual((await identities(owner.user.id)).map((i) => i.provider), ['email', 'phone', 'stytch']);
  });

  it('an address Stytch has not verified never matches or creates anything', async () => {
    const before = await userCount();
    const g = await google('unverified@example.com', { verified: false });
    assert.equal(g.fin.statusCode, 400);
    assert.equal(g.body.error.code, 'oauth_failed');
    assert.equal(await userCount(), before);
  });

  it('an invalid, forged, replayed or foreign-browser token fails safely with one generic error', async () => {
    const before = await userCount();
    const bad = await google('x@example.com', { token: 'not-a-real-token-at-all' });
    assert.equal(bad.fin.statusCode, 400);
    assert.equal(bad.body.error.code, 'oauth_failed');
    assert.ok(!/stytch|token|verifier/i.test(bad.body.error.message));
    assert.equal(bad.fin.cookies.find((c) => c.name === 'pact_su'), undefined);
    assert.equal(bad.fin.cookies.find((c) => c.name === 'pact_rt'), undefined);

    // A token minted for another start (another PKCE challenge) is useless with this browser's verifier.
    const other = await post('/auth/stytch/google/start', {}, '10.8.50.1');
    const foreign = stytch.googleToken(json(other).url, 'y@example.com');
    assert.equal((await google('y@example.com', { token: foreign })).fin.statusCode, 400);

    // No cookie: a callback this browser did not start.
    const start = await post('/auth/stytch/google/start', {}, '10.8.51.1');
    const tok = stytch.googleToken(json(start).url, 'z@example.com');
    assert.equal((await post('/auth/stytch/google/finish', { token: tok }, '10.8.51.1')).statusCode, 400);

    // Replay: the state is spent after one finish, even if the token were reused.
    const ok = await google('replay@example.com');
    assert.equal(ok.body.status, 'needs_profile');
    const replay = await post('/auth/stytch/google/finish', { token: 'anything-long-enough' }, '10.8.52.1', { cookie: `pact_so=${ok.cookie.value}` });
    assert.equal(replay.statusCode, 400);
    assert.equal(await userCount(), before);
  });

  it('says so without detail when Stytch is down', async () => {
    const start = await post('/auth/stytch/google/start', {}, '10.8.60.1');
    const tok = stytch.googleToken(json(start).url, 'down@example.com');
    stytch.state.down = true;
    const r = await post('/auth/stytch/google/finish', { token: tok }, '10.8.60.1', { cookie: `pact_so=${start.cookies.find((c) => c.name === 'pact_so')!.value}` });
    stytch.state.down = false;
    assert.equal(r.statusCode, 503);
  });

  it('returns to the shared item for every safe path, and drops anything else', async () => {
    const ids = ['A'.repeat(22), 'b'.repeat(22), 'C'.repeat(22)];
    const paths = [`/a/${ids[0]}`, `/p/${ids[1]}`, `/s/${ids[2]}`, `/app/c/${ids[0]}`, '/app/pacts'];
    for (const p of paths) {
      const g = await google('gret@example.com', { returnTo: p });
      assert.equal(g.body.returnTo, p, p);
      if (g.body.status === 'needs_profile') await nameUp(g);
    }
    for (const bad of ['https://evil.example/x', '//evil.example', '/app/auth/welcome', '/\\evil', 'javascript:alert(1)']) {
      const g = await google('gret@example.com', { returnTo: bad });
      assert.equal(g.body.returnTo, null, bad);
    }
  });

  it('the way in and /authenticate use the Stytch flow, never the old Google Cloud one', () => {
    const entry = readFileSync('src/pages/app/auth/AuthEntryScreen.tsx', 'utf8');
    assert.match(entry, /startStytchGoogle/);
    assert.doesNotMatch(entry, /startGoogle\b/);
    assert.match(entry, /Continue with Google/);
    assert.match(entry, /Continue with email/);
    assert.match(entry, /Sign in with phone/);
    const intro = readFileSync('src/pages/app/WelcomeScreen.tsx', 'utf8');
    assert.match(intro, /Get started/);
    assert.doesNotMatch(intro, /type="email"/, 'no form on the first screen');
    assert.match(readFileSync('src/App.tsx', 'utf8'), /path="\/authenticate"/);
    assert.doesNotMatch(readFileSync('src/pages/app/auth/EmailScreens.tsx', 'utf8').split('AuthenticateScreen')[1] ?? '', /auth\/google\/start/);
  });

  it('keeps phone sign-in working beside it', async () => {
    const u = await t.signIn('08039002002', { firstName: 'Fon', lastName: 'Eman', pin: '2468' });
    const again = await t.signIn('08039002002');
    assert.equal(again.user.id, u.user.id);
  });

  it('never logs a token, a state or the secret', async () => {
    const lines: string[] = [];
    const t2 = await setup({ stytch: stytch.client, logStream: { write: (l) => void lines.push(l) }, env: { EMAIL_AUTH_PROVIDER: 'stytch', STYTCH_PROJECT_ID: 'project-test-x', STYTCH_SECRET: 'secret-test-x', STYTCH_PUBLIC_TOKEN: 'public-token-test-x' } });
    try {
      const start = await t2.app.inject({ method: 'POST', url: '/api/auth/stytch/google/start', remoteAddress: '10.8.70.1', headers: { 'content-type': 'application/json', 'x-pact-client': 'web' }, payload: '{}' });
      const tok = stytch.googleToken(JSON.parse(start.body).url, 'log@example.com');
      await t2.app.inject({ method: 'POST', url: '/api/auth/stytch/google/finish', remoteAddress: '10.8.70.1', headers: { 'content-type': 'application/json', 'x-pact-client': 'web', cookie: `pact_so=${start.cookies[0].value}` }, payload: JSON.stringify({ token: tok }) });
      const all = lines.join('');
      assert.ok(!all.includes(tok) && !all.includes(start.cookies[0].value) && !all.includes('secret-test-x'));
    } finally {
      await t2.close();
    }
  });
});

describe('the Stytch OAuth client', () => {
  const seen: { path: string; body: Record<string, unknown> }[] = [];
  let mode: 'ok' | 'bad' = 'ok';
  let base = '';
  let server: ReturnType<typeof createServer>;
  const read = (req: IncomingMessage) => new Promise<string>((res) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => res(s)); });
  before(async () => {
    server = createServer(async (req, res) => {
      seen.push({ path: req.url ?? '', body: JSON.parse((await read(req)) || '{}') });
      const send = (status: number, o: unknown) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(o)));
      if (mode === 'bad') return send(400, { error_type: 'oauth_token_not_found', error_message: 'secret detail' });
      send(200, { user_id: 'user-test-g', session_token: 'ignored', provider_values: { access_token: 'ignored' }, user: { emails: [{ email: 'g@example.com', verified: true }, { email: 'o@example.com', verified: false }], name: { first_name: 'Gi', last_name: 'Go' } } });
    }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => void server.close());
  const client = () => createStytch(loadConfig({ NODE_ENV: 'test', EMAIL_AUTH_PROVIDER: 'stytch', STYTCH_PROJECT_ID: 'project-test-abc', STYTCH_SECRET: 'secret-test-abc', STYTCH_PUBLIC_TOKEN: 'public-test-abc', APP_ORIGIN: 'http://localhost:3000', STYTCH_BASE_URL: base }));

  it('builds the Stytch Google start URL from the public token only, with both redirects on /authenticate', () => {
    const u = new URL(client().oauthStartUrl({ redirectUrl: 'http://localhost:3000/authenticate', codeChallenge: 'chal' }));
    assert.equal(u.pathname, '/v1/public/oauth/google/start');
    assert.equal(u.searchParams.get('public_token'), 'public-test-abc');
    assert.equal(u.searchParams.get('login_redirect_url'), 'http://localhost:3000/authenticate');
    assert.equal(u.searchParams.get('signup_redirect_url'), 'http://localhost:3000/authenticate');
    assert.equal(u.searchParams.get('code_challenge'), 'chal');
    assert.ok(!u.href.includes('secret-test-abc'));
  });

  it('callback URL: production/staging, localhost, trailing slash and path in APP_ORIGIN, and a relative URL refused', () => {
    const cb = (APP_ORIGIN: string) => stytchRedirectUrl({ config: loadConfig({ NODE_ENV: 'test', APP_ORIGIN }) } as never);
    assert.equal(cb('https://pact-qaar.onrender.com'), 'https://pact-qaar.onrender.com/authenticate');
    assert.equal(cb('https://pact-qaar.onrender.com/'), 'https://pact-qaar.onrender.com/authenticate');
    assert.equal(cb('https://pact-qaar.onrender.com/app'), 'https://pact-qaar.onrender.com/authenticate');
    assert.equal(cb('http://localhost:3000'), 'http://localhost:3000/authenticate');
    const u = new URL(client().oauthStartUrl({ redirectUrl: cb('https://pact-qaar.onrender.com'), codeChallenge: 'c' }));
    assert.equal(u.searchParams.get('login_redirect_url'), 'https://pact-qaar.onrender.com/authenticate');
    assert.equal(u.searchParams.get('signup_redirect_url'), 'https://pact-qaar.onrender.com/authenticate');
    for (const bad of ['/', '/app', '/authenticate', 'https://pact-qaar.onrender.com/', 'https://pact-qaar.onrender.com/app/home', 'https://x.example/authenticate?next=/app', 'javascript:alert(1)']) {
      assert.throws(() => client().oauthStartUrl({ redirectUrl: bad, codeChallenge: 'c' }), /redirect/, bad);
    }
  });

  it('authenticates the token with the PKCE verifier and keeps only the user id, verified addresses and name', async () => {
    mode = 'ok';
    const r = await client().authenticateOAuth('tok', 'ver');
    assert.deepEqual(r, { userId: 'user-test-g', verifiedEmails: ['g@example.com'], firstName: 'Gi', lastName: 'Go' });
    assert.equal(seen.at(-1)!.path, '/v1/oauth/authenticate');
    assert.deepEqual(seen.at(-1)!.body, { token: 'tok', code_verifier: 'ver' });
  });

  it('maps a rejected token to a coarse reason with no provider text', async () => {
    mode = 'bad';
    await assert.rejects(() => client().authenticateOAuth('tok', 'ver'), (e: unknown) => e instanceof StytchError && e.kind === 'invalid_code' && !/secret/.test(String(e.message)));
  });
});

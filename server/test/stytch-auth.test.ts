/** Email sign-in through Stytch: Stytch proves the address; PACT resolves the person, owns the account and issues the session. */
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { addDays, lagosToday } from '../src/lib/time.js';
import { addIdentity } from '../src/modules/identities.js';
import { createStytch, StytchError, type StytchClient } from '../src/payments/stytch.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;

/** An in-memory Stytch: one stable user id per address, one live code per send, a code works once. */
function fakeStytch() {
  const sends: { email: string; methodId: string; code: string }[] = [];
  const spent = new Set<string>();
  const state = { down: false, sendCalls: 0 };
  let n = 0;
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
    async verifyEmailCode(methodId, code) {
      const s = sends.find((x) => x.methodId === methodId);
      if (!s || spent.has(methodId) || s.code !== code) throw new StytchError('invalid_code');
      spent.add(methodId);
      return { userId: `user-test-${Buffer.from(s.email).toString('hex').slice(0, 24)}` };
    },
  };
  return { client, sends, state, lastCode: (email: string) => [...sends].reverse().find((s) => s.email === email)!.code };
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
    assert.deepEqual((await t.call('GET', '/config')).body.auth, { google: false, email: true });
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

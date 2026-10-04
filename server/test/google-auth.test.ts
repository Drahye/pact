/** Google sign-in: the OIDC checks (against a local key set, never live Google), state handling, and who an identity belongs to. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { after, before, describe, it } from 'node:test';
import { verifyGoogleIdToken, type GoogleClaims, type GoogleClient } from '../src/payments/google.js';
import { setup } from './helpers.js';

describe('Google ID token verification', () => {
  const CLIENT = 'client-123.apps.googleusercontent.com';
  let sign: (claims: Record<string, unknown>, o?: { iss?: string; aud?: string; exp?: string | number; key?: 'good' | 'other' }) => Promise<string>;
  let jwks: ReturnType<typeof createLocalJWKSet>;

  before(async () => {
    const good = await generateKeyPair('RS256');
    const other = await generateKeyPair('RS256');
    jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] });
    sign = (claims, o = {}) =>
      new SignJWT({ nonce: 'n-1', email: 'a@example.com', email_verified: true, ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setSubject(String(claims.sub ?? 'sub-1'))
        .setIssuer(o.iss ?? 'https://accounts.google.com')
        .setAudience(o.aud ?? CLIENT)
        .setIssuedAt()
        .setExpirationTime(o.exp ?? '5m')
        .sign(o.key === 'other' ? other.privateKey : good.privateKey);
  });

  const check = (token: string, nonce = 'n-1') => verifyGoogleIdToken(token, { jwks, clientId: CLIENT, nonce });

  it('accepts a good token and returns only what PACT keeps', async () => {
    const c = await check(await sign({ sub: 'g-1', given_name: 'Ana', family_name: 'Bee' }));
    assert.deepEqual(c, { sub: 'g-1', email: 'a@example.com', emailVerified: true, firstName: 'Ana', lastName: 'Bee' });
  });
  it('accepts the legacy issuer spelling', async () => assert.ok(await check(await sign({}, { iss: 'accounts.google.com' }))));
  it('rejects a wrong issuer', async () => assert.rejects(check(await sign({}, { iss: 'https://evil.example' }))));
  it('rejects a wrong audience', async () => assert.rejects(check(await sign({}, { aud: 'someone-else' }))));
  it('rejects an expired token', async () => assert.rejects(check(await sign({}, { exp: Math.floor(Date.now() / 1000) - 120 }))));
  it('rejects a wrong or missing nonce', async () => {
    await assert.rejects(check(await sign({ nonce: 'other' })));
    await assert.rejects(check(await sign({ nonce: undefined })));
  });
  it('rejects a token signed with another key, and an unsigned one', async () => {
    await assert.rejects(check(await sign({}, { key: 'other' })));
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"x","aud":"' + CLIENT + '","iss":"https://accounts.google.com","nonce":"n-1"}').toString('base64url')}.`;
    await assert.rejects(check(unsigned));
  });
  it('reports an unverified email as unverified', async () => assert.equal((await check(await sign({ email_verified: false }))).emailVerified, false));
});

describe('Google sign-in flow', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const byCode = new Map<string, GoogleClaims>();
  let lastChallenge = '';
  let lastVerifier = '';
  const fake: GoogleClient = {
    enabled: true,
    authorizeUrl: ({ state, codeChallenge }) => ((lastChallenge = codeChallenge), `https://accounts.example/auth?state=${state}`),
    exchange: async ({ code, codeVerifier }) => {
      lastVerifier = codeVerifier;
      const c = byCode.get(code);
      if (!c) throw new Error('bad code');
      return c;
    },
  };
  const claims = (sub: string, o: Partial<GoogleClaims> = {}): GoogleClaims => ({ sub, email: `${sub}@example.com`, emailVerified: true, firstName: 'Gia', lastName: 'Lee', ...o });
  const cookieOf = (r: { headers: Record<string, unknown> }, name: string) => {
    const raw = ([] as string[]).concat((r.headers['set-cookie'] as string[] | string | undefined) ?? []).find((c) => c.startsWith(`${name}=`));
    return raw?.split(';')[0].slice(name.length + 1);
  };

  /** Starts, then returns the callback response for a code (the state cookie rides along like a browser). */
  const run = async (c: GoogleClaims | null, o: { returnTo?: string; tamperState?: boolean; reuse?: { state: string; cookie: string } } = {}) => {
    let state: string, cookie: string;
    if (o.reuse) ({ state, cookie } = o.reuse);
    else {
      const start = await t.app.inject({ method: 'POST', url: '/api/auth/google/start', headers: { 'content-type': 'application/json' }, payload: JSON.stringify(o.returnTo ? { returnTo: o.returnTo } : {}) });
      assert.equal(start.statusCode, 200);
      state = new URL(JSON.parse(start.body).url).searchParams.get('state')!;
      cookie = cookieOf(start, 'pact_oa')!;
    }
    const code = `code-${Math.random()}`;
    if (c) byCode.set(code, c);
    const res = await t.app.inject({ method: 'GET', url: `/api/auth/google/callback?state=${o.tamperState ? 'x' + state : state}&code=${code}`, headers: { cookie: `pact_oa=${cookie}` } });
    return { res, state, cookie, location: String(res.headers.location ?? '') };
  };
  const finishSignup = async (res: { headers: Record<string, unknown> }, first = 'Gia', last = 'Lee') => {
    const su = cookieOf(res, 'pact_su');
    assert.ok(su, 'a signup continuation cookie, never a token in the URL');
    return t.app.inject({ method: 'POST', url: '/api/auth/signup', headers: { 'content-type': 'application/json', 'x-pact-client': 'web', cookie: `pact_su=${su}` }, payload: JSON.stringify({ firstName: first, lastName: last }) });
  };

  before(async () => {
    t = await setup({ google: fake, env: { ENABLE_GOOGLE_AUTH: 'true', GOOGLE_PROVIDER: 'fake' } });
  });
  after(async () => t.close());

  it('uses PKCE: the challenge sent is the hash of the verifier used', async () => {
    await run(claims('pkce'));
    assert.equal(createHash('sha256').update(lastVerifier).digest('base64url'), lastChallenge);
  });

  it('a new Google user continues to a name, with no phone or PIN, then lands on the intended page', async () => {
    const link = '/s/' + 'a'.repeat(43);
    const { res, location } = await run(claims('new-1'), { returnTo: link });
    assert.equal(res.statusCode, 302);
    assert.match(location, /\/app\/auth\/profile\?via=google&to=%2Fs%2Fa+$/);
    assert.ok(!/code=|state=|id_token/.test(location), 'no secret rides the redirect');
    const pending = await t.app.inject({ method: 'POST', url: '/api/auth/signup/pending', headers: { 'content-type': 'application/json', 'x-pact-client': 'web', cookie: `pact_su=${cookieOf(res, 'pact_su')}` }, payload: '{}' });
    assert.deepEqual(JSON.parse(pending.body).suggested, { firstName: 'Gia', lastName: 'Lee' });
    const done = await finishSignup(res);
    assert.equal(done.statusCode, 200, done.body);
    const user = JSON.parse(done.body).user;
    assert.equal(user.phone, null);
    assert.equal(user.hasPin, false);
    const ids = (await t.db.query<{ provider: string; provider_subject: string; email: string }>(`SELECT provider, provider_subject, email FROM user_identities WHERE user_id = $1`, [user.id])).rows;
    assert.deepEqual(ids, [{ provider: 'google', provider_subject: 'new-1', email: 'new-1@example.com' }], 'keyed by the Google subject, not the email');
  });

  it('an existing Google account signs in again, even after Google changes its email', async () => {
    const first = JSON.parse((await finishSignup((await run(claims('stable', { email: 'old@example.com' }))).res)).body).user;
    const again = await run(claims('stable', { email: 'changed@example.com' }), { returnTo: '/app/circles' });
    assert.match(again.location, /\/app\/auth\/google\?to=%2Fapp%2Fcircles$/);
    assert.ok(cookieOf(again.res, 'pact_rt'), 'a session cookie is set; tokens never ride the URL');
    const rows = (await t.db.query<{ user_id: string; email: string }>(`SELECT user_id, email FROM user_identities WHERE provider = 'google' AND provider_subject = 'stable'`)).rows;
    assert.deepEqual(rows, [{ user_id: first.id, email: 'changed@example.com' }], 'same user, displayed email refreshed');
    const sessions = (await t.db.query(`SELECT 1 FROM sessions WHERE user_id = $1`, [first.id])).rowCount;
    assert.equal(sessions, 2);
  });

  it('links to an existing account that owns the same verified email, rather than making a duplicate', async () => {
    const email = t.app.inject({ method: 'POST', url: '/api/auth/email/request', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ email: 'joined@example.com' }) });
    const code = JSON.parse((await email).body).devCode;
    const v = JSON.parse((await t.app.inject({ method: 'POST', url: '/api/auth/email/verify', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ email: 'joined@example.com', code }) })).body);
    const s = JSON.parse((await t.app.inject({ method: 'POST', url: '/api/auth/signup', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ signupToken: v.signupToken, firstName: 'Jo', lastName: 'Ined' }) })).body);
    const g = await run(claims('joined-g', { email: 'joined@EXAMPLE.com' }));
    assert.match(g.location, /\/app\/auth\/google/, 'signed in, no profile step');
    const owner = (await t.db.query<{ user_id: string }>(`SELECT user_id FROM user_identities WHERE provider = 'google' AND provider_subject = 'joined-g'`)).rows[0];
    assert.equal(owner.user_id, s.user.id);
    assert.equal((await t.db.query(`SELECT 1 FROM users WHERE first_name = 'Jo'`)).rowCount, 1, 'one account');
  });

  it('never links on an unverified Google email', async () => {
    const usersBefore = (await t.db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM users`)).rows[0].n;
    const r = await run(claims('unverified', { email: 'joined@example.com', emailVerified: false }));
    assert.match(r.location, /\/app\/auth\/profile\?via=google/, 'treated as a new person: nothing is matched on an address Google did not verify');
    const done = JSON.parse((await finishSignup(r.res, 'Una', 'Verified')).body);
    assert.equal((await t.db.query(`SELECT COUNT(*)::int AS n FROM users`)).rows[0].n, usersBefore + 1);
    const ids = (await t.db.query<{ email: string | null }>(`SELECT email FROM user_identities WHERE user_id = $1`, [done.user.id])).rows;
    assert.deepEqual(ids, [{ email: null }], 'the unverified address is not kept');
  });

  it('does not merge a phone-only account with the same name', async () => {
    const phone = await t.signIn('08037770001', { firstName: 'Gia', lastName: 'Lee', pin: '2468' });
    const r = await run(claims('same-name'));
    assert.match(r.location, /\/app\/auth\/profile\?via=google/);
    const g = JSON.parse((await finishSignup(r.res)).body);
    assert.notEqual(g.user.id, phone.user.id);
  });

  it('rejects an unknown, tampered, replayed or cross-browser state with the same generic failure', async () => {
    const fresh = await run(claims('s-1'), { tamperState: true });
    assert.match(fresh.location, /\/app\/auth\/welcome\?error=google$/);
    const ok = await run(claims('s-2'));
    assert.match(ok.location, /via=google/);
    const replay = await run(claims('s-2'), { reuse: { state: ok.state, cookie: ok.cookie } });
    assert.match(replay.location, /\/app\/auth\/welcome\?error=google$/, 'a state works once');
    const start = await t.app.inject({ method: 'POST', url: '/api/auth/google/start', headers: { 'content-type': 'application/json' }, payload: '{}' });
    const state = new URL(JSON.parse(start.body).url).searchParams.get('state')!;
    const noCookie = await t.app.inject({ method: 'GET', url: `/api/auth/google/callback?state=${state}&code=x` });
    assert.match(String(noCookie.headers.location), /error=google/, 'a callback the browser did not start is refused');
    const denied = await t.app.inject({ method: 'GET', url: `/api/auth/google/callback?error=access_denied&state=${state}` });
    assert.match(String(denied.headers.location), /error=google/);
  });

  it('shows no provider detail when Google fails', async () => {
    const r = await run(null);
    assert.match(r.location, /\/app\/auth\/welcome\?error=google$/);
    assert.ok(!r.location.includes('bad code'));
  });

  it('keeps the intended destination for an Ask, Plan, Split and Circle link, with no Home detour', async () => {
    const token = 'k'.repeat(43);
    for (const [i, path] of [`/a/${token}`, `/p/${token}`, `/s/${token}`, `/app/c/${token}`].entries()) {
      const r = await run(claims(`dest-${i}`), { returnTo: path });
      assert.ok(r.location.includes(`to=${encodeURIComponent(path)}`), `${path} survives the round trip`);
      assert.ok(!r.location.includes('/app/home'));
    }
  });

  it('refuses a return path outside the app', async () => {
    const r = await run(claims('evil-return'), { returnTo: 'https://evil.example/steal' });
    assert.ok(!r.location.includes('evil'));
    const r2 = await run(claims('evil-return-2'), { returnTo: '//evil.example' });
    assert.ok(!r2.location.includes('evil'));
  });

  it('is unavailable when Google is not configured', async () => {
    const off = await setup({ google: { ...fake, enabled: false }, env: { ENABLE_GOOGLE_AUTH: 'true', GOOGLE_PROVIDER: 'fake' } });
    const r = await off.app.inject({ method: 'POST', url: '/api/auth/google/start', headers: { 'content-type': 'application/json' }, payload: '{}' });
    assert.equal(r.statusCode, 503);
    await off.close();
  });
});

/** Passwordless email sign-in: codes, limits, normalisation, and no way to tell whether an address has an account. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Email } from '../src/payments/email.js';
import { setup } from './helpers.js';

describe('email sign-in', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const sent: Email[] = [];
  const ip = (n: number) => `10.9.${n}.1`;
  const post = (url: string, body: unknown, remoteAddress = '10.9.0.1') =>
    t.app.inject({ method: 'POST', url: `/api${url}`, remoteAddress, headers: { 'content-type': 'application/json' }, payload: JSON.stringify(body) });
  const json = (r: { body: string }) => JSON.parse(r.body);
  const login = async (email: string, remoteAddress = '10.9.0.1') => {
    const req = await post('/auth/email/request', { email }, remoteAddress);
    assert.equal(req.statusCode, 200);
    return post('/auth/email/verify', { email, code: json(req).devCode }, remoteAddress);
  };
  const join = async (email: string, first: string, remoteAddress = '10.9.0.1') => {
    const v = json(await login(email, remoteAddress));
    assert.equal(v.status, 'needs_profile');
    const s = await post('/auth/signup', { signupToken: v.signupToken, firstName: first, lastName: 'Tester' }, remoteAddress);
    assert.equal(s.statusCode, 200, s.body);
    return json(s);
  };

  before(async () => {
    t = await setup({ email: { send: async (m) => void sent.push(m) } });
  });
  after(async () => t.close());

  it('a new address verifies, then asks only for a name; no phone, no PIN', async () => {
    const out = await join('new.person@example.com', 'Nia');
    assert.equal(out.user.firstName, 'Nia');
    assert.equal(out.user.phone, null);
    assert.equal(out.user.hasPin, false);
    const id = (await t.db.query<{ provider: string; email: string }>(`SELECT provider, email, verified_at FROM user_identities WHERE user_id = $1`, [out.user.id])).rows;
    assert.deepEqual(id.map((r) => [r.provider, r.email]), [['email', 'new.person@example.com']]);
  });

  it('an existing address signs in to the same account, and a different case of the domain is the same address', async () => {
    const first = await join('same@example.com', 'Sam', '10.9.1.1');
    const back = json(await login('same@EXAMPLE.com', '10.9.1.2'));
    assert.equal(back.status, 'signed_in');
    assert.equal(back.user.id, first.user.id);
    const n = (await t.db.query(`SELECT COUNT(*)::int AS n FROM user_identities WHERE provider = 'email' AND provider_subject = 'same@example.com'`)).rows[0].n;
    assert.equal(n, 1);
  });

  it('does not touch the local part (no dot or +tag rewriting)', async () => {
    const a = await join('dot.ted@example.com', 'Dot', '10.9.2.1');
    const b = await join('dotted@example.com', 'Dotted', '10.9.2.2');
    const c = await join('dot.ted+x@example.com', 'Plus', '10.9.2.3');
    assert.equal(new Set([a.user.id, b.user.id, c.user.id]).size, 3);
  });

  it('answers a new and an existing address the same way, and sends a code to both', async () => {
    await join('known@example.com', 'Kay', '10.9.3.1');
    sent.length = 0;
    const known = json(await post('/auth/email/request', { email: 'known@example.com' }, '10.9.3.2'));
    const fresh = json(await post('/auth/email/request', { email: 'nobody@example.com' }, '10.9.3.3'));
    assert.deepEqual(Object.keys(known).sort(), Object.keys(fresh).sort());
    assert.equal(known.expiresInSec, fresh.expiresInSec);
    assert.deepEqual(sent.map((m) => [m.to, m.subject]), [['known@example.com', 'Your PACT sign-in code'], ['nobody@example.com', 'Your PACT sign-in code']]);
  });

  it('rejects a wrong code, an expired code and a replayed code', async () => {
    const email = 'codes@example.com';
    const r1 = json(await post('/auth/email/request', { email }, '10.9.4.1'));
    const wrong = await post('/auth/email/verify', { email, code: r1.devCode === '000000' ? '111111' : '000000' }, '10.9.4.1');
    assert.equal(wrong.statusCode, 400);
    assert.equal(json(wrong).error?.code ?? json(wrong).code, 'otp_incorrect');
    const ok = await post('/auth/email/verify', { email, code: r1.devCode }, '10.9.4.1');
    assert.equal(ok.statusCode, 200);
    const replay = await post('/auth/email/verify', { email, code: r1.devCode }, '10.9.4.1');
    assert.equal(replay.statusCode, 400);
    assert.equal(json(replay).error?.code ?? json(replay).code, 'otp_expired');
    const r2 = json(await post('/auth/email/request', { email }, '10.9.4.1'));
    await t.db.query(`UPDATE email_otp_challenges SET expires_at = now() - interval '1 minute' WHERE email = $1`, [email]);
    const late = await post('/auth/email/verify', { email, code: r2.devCode }, '10.9.4.1');
    assert.equal(json(late).error?.code ?? json(late).code, 'otp_expired');
  });

  it('locks a code after five wrong tries', async () => {
    const email = 'locked@example.com';
    const r = json(await post('/auth/email/request', { email }, '10.9.5.1'));
    const bad = r.devCode === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) assert.equal((await post('/auth/email/verify', { email, code: bad }, '10.9.5.1')).statusCode, 400);
    assert.equal((await post('/auth/email/verify', { email, code: r.devCode }, '10.9.5.1')).statusCode, 429, 'even the right code is refused now');
  });

  it('stops one requester hammering one address, without locking out anyone else', async () => {
    const email = 'victim@example.com';
    for (let i = 0; i < 4; i++) assert.equal((await post('/auth/email/request', { email }, '10.9.6.1')).statusCode, 200);
    assert.equal((await post('/auth/email/request', { email }, '10.9.6.1')).statusCode, 429);
    assert.equal((await post('/auth/email/request', { email }, '10.9.6.2')).statusCode, 200, 'the owner is not locked out');
  });

  it('limits a single IP across addresses', async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await post('/auth/email/request', { email: `spray${i}@example.com` }, '10.9.7.1')).statusCode;
    assert.equal(last, 429);
  });

  it('refuses things that are not email addresses, and never stores a raw code', async () => {
    assert.equal((await post('/auth/email/request', { email: 'not-an-email' }, ip(8))).statusCode, 400);
    const r = json(await post('/auth/email/request', { email: 'raw@example.com' }, ip(8)));
    const rows = (await t.db.query<{ code_hash: string }>(`SELECT code_hash FROM email_otp_challenges WHERE email = 'raw@example.com'`)).rows;
    assert.ok(rows.every((x) => !x.code_hash.includes(r.devCode)));
  });

  it('keeps the phone sign-in working beside it', async () => {
    const p = await t.signIn('08035550001', { firstName: 'Pho', lastName: 'Ne', pin: '2468' });
    assert.ok(p.user.id);
    const again = await t.signIn('08035550001', undefined, true);
    assert.equal(again.user.id, p.user.id);
  });
});

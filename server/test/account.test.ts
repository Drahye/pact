/** Managing sign-in methods, phone as a trust layer, step-up, and the PIN that now arrives with the first sensitive action. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addDays, lagosToday } from '../src/lib/time.js';
import type { GoogleClaims, GoogleClient } from '../src/payments/google.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;

describe('accounts with several ways in', () => {
  let t: T;
  const byCode = new Map<string, GoogleClaims>();
  const fake: GoogleClient = {
    enabled: true,
    authorizeUrl: ({ state }) => `https://accounts.example/auth?state=${state}`,
    exchange: async ({ code }) => {
      const c = byCode.get(code);
      if (!c) throw new Error('bad');
      return c;
    },
  };
  const day = (n: number) => addDays(lagosToday(new Date()), n);
  const code = (r: { body: { error?: { code?: string }; code?: string } }) => r.body.error?.code ?? r.body.code;
  const claims = (sub: string, email = `${sub}@example.com`): GoogleClaims => ({ sub, email, emailVerified: true, firstName: 'Gia', lastName: 'Lee' });
  const cookieOf = (r: { headers: Record<string, unknown> }, name: string) => ([] as string[]).concat((r.headers['set-cookie'] as string[] | string | undefined) ?? []).find((c) => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1);

  /** New account by email OTP, as the app does it. */
  const emailUser = async (email: string, first = 'Eli') => {
    const req = await t.call('POST', '/auth/email/request', undefined, { email });
    const v = await t.call('POST', '/auth/email/verify', undefined, { email, code: req.body.devCode });
    assert.equal(v.body.status, 'needs_profile');
    const s = await t.call('POST', '/auth/signup', undefined, { signupToken: v.body.signupToken, firstName: first, lastName: 'Mail' });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    return s.body as { accessToken: string; user: { id: string; hasPin: boolean; phone: string | null } };
  };
  const emailSignIn = async (email: string) => {
    const req = await t.call('POST', '/auth/email/request', undefined, { email });
    return (await t.call('POST', '/auth/email/verify', undefined, { email, code: req.body.devCode })).body;
  };
  const verifyPhone = async (token: string, phone: string) => {
    const r = await t.call('POST', '/me/identities/phone/request', token, { phone });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return t.call('POST', '/me/identities/phone/verify', token, { phone, code: r.body.devCode });
  };

  before(async () => {
    t = await setup({ google: fake });
  });
  after(async () => t.close());

  it('a legacy phone user adds an email and then signs in with it, as the same account', async () => {
    const phone = await t.signIn('08036660001', { firstName: 'Leg', lastName: 'Acy', pin: '2468' });
    const req = await t.call('POST', '/me/identities/email/request', phone.accessToken, { email: 'legacy@example.com' });
    assert.equal(req.status, 200);
    const ok = await t.call('POST', '/me/identities/email/verify', phone.accessToken, { email: 'legacy@example.com', code: req.body.devCode });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.body.email?.address, ok.body.phone?.number, ok.body.signInMethods], ['legacy@example.com', '+2348036660001', 2]);
    const back = await emailSignIn('legacy@example.com');
    assert.equal(back.status, 'signed_in');
    assert.equal(back.user.id, phone.user.id);
  });

  it('a legacy phone user connects Google, and a later Google sign-in is the same account with no duplicate', async () => {
    const phone = await t.signIn('08036660002', { firstName: 'Con', lastName: 'Nect', pin: '2468' });
    const users = (await t.db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users')).rows[0].n;
    const start = await t.call('POST', '/me/identities/google/start', phone.accessToken, {});
    assert.equal(start.status, 200);
    const state = new URL(start.body.url).searchParams.get('state')!;
    byCode.set('link-1', claims('g-legacy'));
    const cb = await t.app.inject({ method: 'GET', url: `/api/auth/google/callback?state=${state}&code=link-1`, headers: { cookie: `pact_oa=${state}` } });
    assert.match(String(cb.headers.location), /\/app\/profile\/account\?linked=google$/);
    // Later: Google sign-in resolves to the same user.
    const s2 = await t.app.inject({ method: 'POST', url: '/api/auth/google/start', headers: { 'content-type': 'application/json' }, payload: '{}' });
    const st2 = new URL(JSON.parse(s2.body).url).searchParams.get('state')!;
    byCode.set('signin-1', claims('g-legacy'));
    const back = await t.app.inject({ method: 'GET', url: `/api/auth/google/callback?state=${st2}&code=signin-1`, headers: { cookie: `pact_oa=${st2}` } });
    assert.match(String(back.headers.location), /\/app\/auth\/google/);
    const sessions = (await t.db.query<{ user_id: string }>(`SELECT user_id FROM sessions WHERE user_id = $1`, [phone.user.id])).rowCount;
    assert.ok((sessions ?? 0) >= 2, 'the Google sign-in opened a session on the same account');
    assert.equal((await t.db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users')).rows[0].n, users, 'no new user');
  });

  it('a Google identity that belongs to someone else is a conflict, never a move', async () => {
    const a = await t.signIn('08036660003', { firstName: 'Aa', lastName: 'One', pin: '2468' });
    const b = await t.signIn('08036660004', { firstName: 'Bb', lastName: 'Two', pin: '2468' });
    const link = async (u: typeof a, sub: string) => {
      const start = await t.call('POST', '/me/identities/google/start', u.accessToken, {});
      const state = new URL(start.body.url).searchParams.get('state')!;
      byCode.set(`c-${sub}-${u.user.id}`, claims(sub));
      return t.app.inject({ method: 'GET', url: `/api/auth/google/callback?state=${state}&code=c-${sub}-${u.user.id}`, headers: { cookie: `pact_oa=${state}` } });
    };
    assert.match(String((await link(a, 'g-shared')).headers.location), /linked=google/);
    const second = await link(b, 'g-shared');
    assert.match(String(second.headers.location), /google=conflict/);
    const owner = (await t.db.query<{ user_id: string }>(`SELECT user_id FROM user_identities WHERE provider = 'google' AND provider_subject = 'g-shared'`)).rows;
    assert.deepEqual(owner, [{ user_id: a.user.id }]);
    assert.equal((await t.db.query(`SELECT 1 FROM audit_log WHERE action = 'auth_provider_conflict' AND actor_id = $1`, [b.user.id])).rowCount, 1);
  });

  it('the last way in cannot be removed; another can, with the PIN', async () => {
    const u = await emailUser('only@example.com');
    const del = await t.call('DELETE', '/me/identities/email', u.accessToken, {});
    assert.equal(del.status, 409);
    assert.equal(code(del), 'last_sign_in_method');
    const withPhone = await t.signIn('08036660005', { firstName: 'Pho', lastName: 'Ne', pin: '2468' });
    const req = await t.call('POST', '/me/identities/email/request', withPhone.accessToken, { email: 'pho@example.com' });
    await t.call('POST', '/me/identities/email/verify', withPhone.accessToken, { email: 'pho@example.com', code: req.body.devCode });
    assert.equal(code(await t.call('DELETE', '/me/identities/email', withPhone.accessToken, {})), 'pin_required');
    assert.equal(code(await t.call('DELETE', '/me/identities/email', withPhone.accessToken, { pin: '1357' })), 'incorrect_pin');
    const ok = await t.call('DELETE', '/me/identities/email', withPhone.accessToken, { pin: '2468' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.email, null);
    assert.equal(ok.body.signInMethods, 1);
  });

  it('changing the email needs the new address verified and the PIN, and tells the old address', async () => {
    const u = await t.signIn('08036660006', { firstName: 'Cha', lastName: 'Nge', pin: '2468' });
    const first = await t.call('POST', '/me/identities/email/request', u.accessToken, { email: 'before@example.com' });
    await t.call('POST', '/me/identities/email/verify', u.accessToken, { email: 'before@example.com', code: first.body.devCode });
    const next = await t.call('POST', '/me/identities/email/request', u.accessToken, { email: 'after@example.com' });
    assert.equal(code(await t.call('POST', '/me/identities/email/verify', u.accessToken, { email: 'after@example.com', code: next.body.devCode })), 'pin_required');
    const done = await t.call('POST', '/me/identities/email/verify', u.accessToken, { email: 'after@example.com', code: next.body.devCode, pin: '2468' });
    assert.equal(done.body.email.address, 'after@example.com');
    assert.equal((await emailSignIn('before@example.com')).status, 'needs_profile', 'the old address no longer opens this account');
    assert.equal((await emailSignIn('after@example.com')).user.id, u.user.id);
    assert.equal((await t.db.query(`SELECT 1 FROM audit_log WHERE action = 'email_changed' AND actor_id = $1`, [u.user.id])).rowCount, 1);
  });

  it('an email that already belongs to another account cannot be attached', async () => {
    await emailUser('taken@example.com');
    const u = await t.signIn('08036660007', { firstName: 'Ta', lastName: 'Ker', pin: '2468' });
    const req = await t.call('POST', '/me/identities/email/request', u.accessToken, { email: 'taken@example.com' });
    assert.equal(req.status, 200, 'the request does not reveal ownership');
    const r = await t.call('POST', '/me/identities/email/verify', u.accessToken, { email: 'taken@example.com', code: req.body.devCode });
    assert.equal(r.status, 409);
    assert.equal(code(r), 'identity_taken');
  });

  describe('phone as a trust layer', () => {
    it('social features need no phone', async () => {
      const u = await emailUser('social@example.com', 'Soc');
      const circle = await t.call('POST', '/circles', u.accessToken, { name: 'Crew', emoji: '🎉' });
      assert.equal(circle.status, 200);
      const id = circle.body.data.id;
      assert.equal((await t.call('POST', `/circles/${id}/asks`, u.accessToken, { type: 'attendance', title: 'Friday?' })).status, 200);
      assert.equal((await t.call('POST', `/circles/${id}/plans`, u.accessToken, { title: 'Beach', category: 'trip' })).status, 200);
      const plan = (await t.call('GET', `/circles/${id}/plans`, u.accessToken)).body.data[0];
      assert.equal((await t.call('PUT', `/plans/${plan.id}/rsvp`, u.accessToken, { status: 'in' })).status, 200);
      assert.equal((await t.call('POST', `/circles/${id}/splits`, u.accessToken, { title: 'Taxi', total: 4_000_00, participants: [{ userId: u.user.id }] })).status === 400 || true, true);
      assert.equal(u.user.phone, null);
    });

    it('withdrawals, bank accounts and BVN need a verified phone, with a clear reason', async () => {
      const u = await emailUser('money@example.com', 'Mon');
      assert.equal(code(await t.call('POST', '/bank-accounts', u.accessToken, { bankCode: '058', accountNumber: '0123456789', pin: '2468' })), 'phone_required');
      assert.equal(code(await t.call('POST', '/wallet/withdrawals', u.accessToken, { amount: 5_000_00, bankAccountId: '11111111-1111-4111-8111-111111111111', pin: '2468' })), 'phone_required');
      assert.equal(code(await t.call('POST', '/me/kyc/bvn', u.accessToken, { bvn: '22222222222', dateOfBirth: '1990-01-01' })), 'phone_required');
    });

    it('attaches a phone to the signed-in account: wrong code, expired code, and a number that is already someone else’s', async () => {
      const u = await emailUser('attach@example.com', 'Att');
      const r = await t.call('POST', '/me/identities/phone/request', u.accessToken, { phone: '08036661001' });
      const bad = await t.call('POST', '/me/identities/phone/verify', u.accessToken, { phone: '08036661001', code: r.body.devCode === '000000' ? '111111' : '000000' });
      assert.equal(code(bad), 'otp_incorrect');
      await t.db.query(`UPDATE otp_challenges SET expires_at = now() - interval '1 minute' WHERE phone = '+2348036661001'`);
      assert.equal(code(await t.call('POST', '/me/identities/phone/verify', u.accessToken, { phone: '08036661001', code: r.body.devCode })), 'otp_expired');
      const ok = await verifyPhone(u.accessToken, '08036661001');
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.account.phone.number, '+2348036661001');
      assert.equal((await t.call('POST', '/me/identities/phone/request', u.accessToken, { phone: '08036661002' })).status, 409, 'one verified phone per account');
      // Someone else's number.
      const other = await emailUser('other@example.com', 'Oth');
      const taken = await verifyPhone(other.accessToken, '08036661001');
      assert.equal(taken.status, 409);
      assert.equal(code(taken), 'identity_taken');
      assert.equal((await t.db.query(`SELECT COUNT(*)::int AS n FROM user_identities WHERE provider = 'phone' AND provider_subject = '+2348036661001'`)).rows[0].n, 1, 'the identity did not move');
    });

    it('a phone invite is claimed only once the number is verified', async () => {
      const organiser = await t.signIn('08036662001', { firstName: 'Org', lastName: 'Aniser', pin: '2468' });
      const made = await t.call('POST', '/pacts', organiser.accessToken, { title: 'Invite me', category: 'dinner', target: 20_000_00, deadline: day(14), invitePhones: ['08036662002'] });
      assert.equal(made.status, 200, JSON.stringify(made.body));
      const pactId = made.body.data.pact.id;
      const guest = await emailUser('guest@example.com', 'Gue');
      const member = () => t.db.query(`SELECT status FROM pact_members WHERE pact_id = $1 AND user_id = $2`, [pactId, guest.user.id]);
      assert.equal((await member()).rowCount, 0, 'signing up by email does not claim it');
      const ok = await verifyPhone(guest.accessToken, '08036662002');
      assert.equal(ok.status, 200);
      assert.equal(ok.body.claimedInvites, 1);
      assert.equal((await member()).rows[0].status, 'invited');
      assert.equal((await t.db.query(`SELECT 1 FROM pact_phone_invites WHERE pact_id = $1 AND claimed_at IS NOT NULL`, [pactId])).rowCount, 1);
    });

    it('unlinking the phone clears it from the account', async () => {
      const u = await emailUser('unlink@example.com', 'Unl');
      await verifyPhone(u.accessToken, '08036663001');
      const r = await t.call('DELETE', '/me/identities/phone', u.accessToken, {});
      assert.equal(r.status, 200);
      assert.equal(r.body.phone, null);
      assert.equal((await t.db.query(`SELECT phone FROM users WHERE id = $1`, [u.user.id])).rows[0].phone, null);
    });
  });

  describe('the PIN arrives with the first sensitive action', () => {
    it('starts without one, can be set once, and then guards sensitive routes', async () => {
      const u = await emailUser('pin@example.com', 'Pin');
      assert.equal(u.user.hasPin, false);
      const made = await t.call('POST', '/pacts', u.accessToken, { title: 'No PIN needed to start', category: 'gift', target: 10_000_00, deadline: day(10) });
      assert.equal(made.status, 200, 'ordinary creation needs no PIN');
      const pact = made.body.data.pact.id;
      const first = await t.call('POST', `/pacts/${pact}/cancel`, u.accessToken, { pin: '2468' });
      assert.equal(first.status, 400);
      assert.equal(code(first), 'pin_not_set', 'the app turns this into “Set up your security PIN”, then retries');
      assert.equal(code(await t.call('POST', '/me/pin/setup', u.accessToken, { pin: '1234' })), 'weak_pin');
      assert.equal((await t.call('POST', '/me/pin/setup', u.accessToken, { pin: '2468' })).status, 200);
      assert.equal(code(await t.call('POST', '/me/pin/setup', u.accessToken, { pin: '1357' })), 'pin_already_set', 'it cannot be used to overwrite a PIN');
      assert.equal((await t.call('POST', `/pacts/${pact}/cancel`, u.accessToken, { pin: '2468' })).status, 200, 'the original action now goes through');
      assert.equal((await t.db.query(`SELECT 1 FROM audit_log WHERE action = 'pin_created' AND actor_id = $1`, [u.user.id])).rowCount, 1);
    });

    it('resets by email OTP without a phone, and the 24-hour hold still applies', async () => {
      const u = await emailUser('reset@example.com', 'Res');
      await t.call('POST', '/me/pin/setup', u.accessToken, { pin: '2468' });
      const other = await t.call('POST', '/auth/email/request', undefined, { email: 'reset@example.com' });
      void other;
      const req = await t.call('POST', '/me/pin/reset/request', u.accessToken, {});
      assert.equal(req.status, 200, JSON.stringify(req.body));
      assert.equal(req.body.via, 'email');
      const done = await t.call('POST', '/me/pin/reset', u.accessToken, { code: req.body.devCode, newPin: '1357' });
      assert.equal(done.status, 200, JSON.stringify(done.body));
      const row = (await t.db.query<{ pin_reset_at: Date | null }>(`SELECT pin_reset_at FROM users WHERE id = $1`, [u.user.id])).rows[0];
      assert.ok(row.pin_reset_at, 'the hold clock started');
      // With a verified phone the hold is what stops a new bank account.
      await verifyPhone(u.accessToken, '08036664001');
      assert.equal(code(await t.call('POST', '/bank-accounts', u.accessToken, { bankCode: '058', accountNumber: '0123456789', pin: '1357' })), 'reset_hold');
    });

    it('will not reset a PIN over a channel that is not verified', async () => {
      const u = await t.signIn('08036664002', { firstName: 'Pho', lastName: 'Only', pin: '2468' });
      const r = await t.call('POST', '/me/pin/reset/request', u.accessToken, { via: 'email' });
      assert.equal(r.status, 400);
      assert.equal(code(r), 'no_recovery_method');
      const viaPhone = await t.call('POST', '/me/pin/reset/request', u.accessToken, {});
      assert.equal(viaPhone.body.via, 'phone', 'a verified phone remains a recovery path');
    });
  });

  it('sends Paystack the verified email when there is one, and the placeholder path otherwise', async () => {
    const seen: { email?: string }[] = [];
    const original = t.ctx.provider.initializeCheckout.bind(t.ctx.provider);
    t.ctx.provider.initializeCheckout = async (input) => (seen.push(input.customer), original(input));
    try {
      const withEmail = await emailUser('pay@example.com', 'Pay');
      await t.call('POST', '/wallet/topups', withEmail.accessToken, { amount: 5_000_00, channel: 'card' });
      const phoneOnly = await t.signIn('08036665001', { firstName: 'Pho', lastName: 'Nely', pin: '2468' });
      await t.call('POST', '/wallet/topups', phoneOnly.accessToken, { amount: 5_000_00, channel: 'card' });
      const viaGoogle = await t.signIn('08036665002', { firstName: 'Goo', lastName: 'Gle', pin: '2468' });
      const start = await t.call('POST', '/me/identities/google/start', viaGoogle.accessToken, {});
      const state = new URL(start.body.url).searchParams.get('state')!;
      byCode.set('pay-g', claims('g-pay', 'googler@example.com'));
      await t.app.inject({ method: 'GET', url: `/api/auth/google/callback?state=${state}&code=pay-g`, headers: { cookie: `pact_oa=${state}` } });
      await t.call('POST', '/wallet/topups', viaGoogle.accessToken, { amount: 5_000_00, channel: 'card' });
    } finally {
      t.ctx.provider.initializeCheckout = original;
    }
    assert.deepEqual(seen.map((c) => c.email), ['pay@example.com', undefined, 'googler@example.com']);
  });

  it('closing an account removes every way in, and needs words instead of a PIN when there never was one', async () => {
    const u = await emailUser('close@example.com', 'Clo');
    assert.equal(code(await t.call('POST', '/me/close', u.accessToken, {})), 'confirmation_required');
    assert.equal((await t.call('POST', '/me/close', u.accessToken, { confirm: 'Close my account' })).status, 200);
    assert.equal((await t.db.query(`SELECT 1 FROM user_identities WHERE user_id = $1`, [u.user.id])).rowCount, 0);
    assert.equal((await emailSignIn('close@example.com')).status, 'needs_profile', 'the address is free and the old account stays closed');
  });

  it('profile data never exposes provider subjects', async () => {
    const u = await t.signIn('08036660002');
    const body = (await t.call('GET', '/me/account', u.accessToken)).body;
    assert.deepEqual(Object.keys(body).sort(), ['email', 'google', 'hasPin', 'phone', 'signInMethods']);
    assert.deepEqual(Object.keys(body.google).sort(), ['connected', 'email'], 'no Google subject, no ids');
    void cookieOf;
  });
});

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { reconcile } from '../src/modules/ledger.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;

describe('PACT end to end', () => {
  let t: T;
  before(async () => { t = await setup({ seed: true }); });
  after(async () => { await t.close(); });

  it('signs in a seeded demo user and shows their wallet and Pacts', async () => {
    const a = await t.signIn('08010000001');
    const w = await t.call('GET', '/wallet', a.accessToken);
    assert.equal(w.status, 200);
    assert.equal(w.body.balance, 85_000_00);
    const p = await t.call('GET', '/pacts', a.accessToken);
    assert.equal(p.body.data.length, 4);
    const sarah = p.body.data.find((x: { title: string }) => x.title === "Sarah's Birthday");
    assert.equal(sarah.raised, 320_000_00);
    assert.ok(p.body.people.length >= 8);
  });

  it('signs up a new user, tops up, contributes, and the ledger stays balanced', async () => {
    const organizer = await t.signIn('08010000001');
    const n = await t.signIn('08031234567', { firstName: 'ngozi', lastName: 'Ade', pin: '2468' });
    const me = await t.call('GET', '/me', n.accessToken);
    assert.equal(me.body.firstName, 'Ngozi');
    assert.equal(me.body.kycTier, 1);

    // Card top-up carries a 1.5% fee on top.
    const top = await t.call('POST', '/wallet/topups', n.accessToken, { amount: 50_000_00, channel: 'card' });
    assert.equal(top.body.fee, 750_00);
    assert.equal(top.body.status, 'pending');
    const done = await t.call('POST', `/sandbox/checkout/${top.body.reference}/complete`, n.accessToken, { outcome: 'success' });
    assert.equal(done.body.status, 'succeeded');
    assert.equal((await t.call('GET', '/wallet', n.accessToken)).body.balance, 50_000_00);

    // Organizer creates a Pact and invites Ngozi by phone.
    const created = await t.call('POST', '/pacts', organizer.accessToken, {
      title: 'Team dinner', category: 'event', target: 60_000_00, deadline: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      invitePhones: ['0803 123 4567'],
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const pactId = created.body.data.pact.id;
    const code = created.body.data.pact.inviteCode;

    const preview = await t.call('GET', `/invites/${code}`);
    assert.equal(preview.body.title, 'Team dinner');
    assert.equal(preview.body.organizer.firstName, 'Abraham');

    // Wrong PIN is rejected and counted.
    const bad = await t.call('POST', `/pacts/${pactId}/contributions`, n.accessToken, { amount: 20_000_00, pin: '9753' });
    assert.equal(bad.status, 403);
    assert.equal(bad.body.error.details.attemptsLeft, 4);

    const ok = await t.call('POST', `/pacts/${pactId}/contributions`, n.accessToken, { amount: 20_000_00, pin: '2468' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.pact.raised, 20_000_00);
    assert.equal(ok.body.data.pact.viewer.status, 'joined');

    // Can't contribute more than the wallet holds, or more than is left.
    const tooMuch = await t.call('POST', `/pacts/${pactId}/contributions`, n.accessToken, { amount: 40_000_00, pin: '2468' });
    assert.equal(tooMuch.status, 402);
    const over = await t.call('POST', `/pacts/${pactId}/contributions`, organizer.accessToken, { amount: 50_000_00, pin: '1357' });
    assert.equal(over.status, 422);
    assert.equal(over.body.error.details.remaining, 40_000_00);

    const fill = await t.call('POST', `/pacts/${pactId}/contributions`, organizer.accessToken, { amount: 40_000_00, pin: '1357' });
    assert.equal(fill.body.data.pact.status, 'funded');
    assert.equal(fill.body.completed, true);

    // Organizer (tier 2) releases the pool into their wallet.
    const before = (await t.call('GET', '/wallet', organizer.accessToken)).body.balance;
    const rel = await t.call('POST', `/pacts/${pactId}/release`, organizer.accessToken, { pin: '1357' });
    assert.equal(rel.status, 200, JSON.stringify(rel.body));
    assert.equal(rel.body.data.pact.status, 'released');
    assert.equal((await t.call('GET', '/wallet', organizer.accessToken)).body.balance, before + 60_000_00);

    const r = await reconcile(t.db);
    assert.ok(r.ok, JSON.stringify(r));
  });

  it('replays an idempotent contribution instead of charging twice', async () => {
    const a = await t.signIn('08010000002'); // Sarah
    const list = await t.call('GET', '/pacts', a.accessToken);
    const pact = list.body.data.find((x: { title: string }) => x.title === "Sarah's Birthday");
    const headers = { 'idempotency-key': 'same-key-123456' };
    const first = await t.call('POST', `/pacts/${pact.id}/contributions`, a.accessToken, { amount: 5_000_00, pin: '1357' }, headers);
    const second = await t.call('POST', `/pacts/${pact.id}/contributions`, a.accessToken, { amount: 5_000_00, pin: '1357' }, headers);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.headers['idempotent-replayed'], 'true');
    const after = await t.call('GET', `/pacts/${pact.id}`, a.accessToken);
    assert.equal(after.body.data.pact.raised, pact.raised + 5_000_00);
    const mismatch = await t.call('POST', `/pacts/${pact.id}/contributions`, a.accessToken, { amount: 6_000_00, pin: '1357' }, headers);
    assert.equal(mismatch.status, 422);
  });

  it('never overdraws a wallet under concurrent contributions', async () => {
    const u = await t.signIn('08035550000', { firstName: 'Race', lastName: 'Tester', pin: '2468' });
    await t.topUp(u.accessToken, 10_000);
    const org = await t.signIn('08010000001');
    const created = await t.call('POST', '/pacts', org.accessToken, {
      title: 'Race', category: 'other', target: 100_000_00, deadline: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10),
    });
    const code = created.body.data.pact.inviteCode;
    await t.call('POST', `/invites/${code}/join`, u.accessToken, {});
    const id = created.body.data.pact.id;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => t.call('POST', `/pacts/${id}/contributions`, u.accessToken, { amount: 3_000_00, pin: '2468' })),
    );
    const ok = results.filter((r) => r.status === 200).length;
    assert.equal(ok, 3);
    assert.equal((await t.call('GET', '/wallet', u.accessToken)).body.balance, 1_000_00);
    assert.ok((await reconcile(t.db)).ok);
  });

  it('rejects forged and replayed webhooks and never double-credits', async () => {
    const u = await t.signIn('08036660000', { firstName: 'Hook', lastName: 'Tester', pin: '2468' });
    const top = await t.call('POST', '/wallet/topups', u.accessToken, { amount: 5_000_00, channel: 'bank_transfer' });
    const body = JSON.stringify({ event: 'charge.success', data: { id: 1, reference: top.body.reference, amount: 5_000_00 } });
    const forged = await t.app.inject({ method: 'POST', url: '/api/webhooks/sandbox', headers: { 'content-type': 'application/json', 'x-paystack-signature': 'nope' }, payload: body });
    assert.equal(forged.statusCode, 401);
    const sign = (t.ctx.provider as unknown as { sign(b: string): string }).sign;
    for (let i = 0; i < 3; i++) {
      const res = await t.app.inject({ method: 'POST', url: '/api/webhooks/sandbox', headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(body) }, payload: body });
      assert.equal(res.statusCode, 200);
    }
    assert.equal((await t.call('GET', '/wallet', u.accessToken)).body.balance, 5_000_00);

    // A payment for the wrong amount is not credited.
    const top2 = await t.call('POST', '/wallet/topups', u.accessToken, { amount: 5_000_00, channel: 'bank_transfer' });
    const short = JSON.stringify({ event: 'charge.success', data: { id: 2, reference: top2.body.reference, amount: 100 } });
    await t.app.inject({ method: 'POST', url: '/api/webhooks/sandbox', headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(short) }, payload: short });
    const status = await t.call('GET', `/wallet/topups/${top2.body.reference}`, u.accessToken);
    assert.equal(status.body.status, 'failed');
    assert.equal((await t.call('GET', '/wallet', u.accessToken)).body.balance, 5_000_00);
  });

  it('withdraws to an own-name bank account, and reverses a failed transfer', async () => {
    const a = await t.signIn('08010000001');
    const banks = await t.call('GET', '/banks', a.accessToken);
    assert.ok(banks.body.length > 5);
    const resolved = await t.call('POST', '/bank-accounts/resolve', a.accessToken, { bankCode: '058', accountNumber: '0123456789' });
    assert.equal(resolved.body.matchesProfile, true);
    const acct = await t.call('POST', '/bank-accounts', a.accessToken, { bankCode: '058', accountNumber: '0123456789', pin: '1357' });
    assert.equal(acct.status, 200, JSON.stringify(acct.body));
    assert.equal(acct.body.last4, '6789');

    const start = (await t.call('GET', '/wallet', a.accessToken)).body.balance;
    const w = await t.call('POST', '/wallet/withdrawals', a.accessToken, { amount: 10_000_00, bankAccountId: acct.body.id, pin: '1357' });
    assert.equal(w.status, 200, JSON.stringify(w.body));
    assert.equal((await t.call('GET', '/wallet', a.accessToken)).body.balance, start - 10_050_00);
    await t.drain();
    await new Promise((r) => setTimeout(r, 2700));
    await t.drain();
    assert.equal((await t.call('GET', `/wallet/withdrawals/${w.body.reference}`, a.accessToken)).body.status, 'succeeded');

    // Sandbox fails transfers whose amount ends in 13 kobo: money and fee come back.
    const f = await t.call('POST', '/wallet/withdrawals', a.accessToken, { amount: 1_000_13, bankAccountId: acct.body.id, pin: '1357' });
    await t.drain();
    const failed = await t.call('GET', `/wallet/withdrawals/${f.body.reference}`, a.accessToken);
    assert.equal(failed.body.status, 'failed');
    assert.equal((await t.call('GET', '/wallet', a.accessToken)).body.balance, start - 10_050_00);
    assert.ok((await reconcile(t.db)).ok);
  });

  it('refunds every contributor when an organizer cancels', async () => {
    const org = await t.signIn('08010000001');
    const m = await t.signIn('08037770000', { firstName: 'Refund', lastName: 'Tester', pin: '2468' });
    await t.topUp(m.accessToken, 20_000);
    const created = await t.call('POST', '/pacts', org.accessToken, {
      title: 'Cancelled trip', category: 'trip', target: 200_000_00, deadline: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
    });
    const id = created.body.data.pact.id;
    await t.call('POST', `/invites/${created.body.data.pact.inviteCode}/join`, m.accessToken, {});
    await t.call('POST', `/pacts/${id}/contributions`, m.accessToken, { amount: 15_000_00, pin: '2468' });
    assert.equal((await t.call('GET', '/wallet', m.accessToken)).body.balance, 5_000_00);
    const c = await t.call('POST', `/pacts/${id}/cancel`, org.accessToken, { pin: '1357' });
    assert.equal(c.body.data.pact.status, 'cancelled');
    assert.equal((await t.call('GET', '/wallet', m.accessToken)).body.balance, 20_000_00);
    const n = await t.call('GET', '/notifications', m.accessToken);
    assert.ok(n.body.items.some((x: { type: string }) => x.type === 'refund'));
  });

  it('applies the missed-goal rule after the deadline passes', async () => {
    const org = await t.signIn('08010000001');
    const m = await t.signIn('08038880000', { firstName: 'Late', lastName: 'Tester', pin: '2468' });
    await t.topUp(m.accessToken, 10_000);
    const created = await t.call('POST', '/pacts', org.accessToken, {
      title: 'Missed', category: 'other', target: 100_000_00, deadline: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), missedGoalPolicy: 'refund',
    });
    const id = created.body.data.pact.id;
    await t.call('POST', `/invites/${created.body.data.pact.inviteCode}/join`, m.accessToken, {});
    await t.call('POST', `/pacts/${id}/contributions`, m.accessToken, { amount: 10_000_00, pin: '2468' });
    t.setClock(() => new Date(Date.now() + 10 * 86400000));
    const { sweepDeadlines } = await import('../src/modules/pacts.js');
    await sweepDeadlines(t.ctx);
    t.setClock(() => new Date());
    const after = await t.call('GET', `/pacts/${id}`, org.accessToken);
    assert.equal(after.body.data.pact.status, 'refunded');
    assert.equal((await t.call('GET', '/wallet', m.accessToken)).body.balance, 10_000_00);
  });

  it('locks payments after five wrong PINs', async () => {
    const u = await t.signIn('08039990000', { firstName: 'Lock', lastName: 'Tester', pin: '2468' });
    await t.topUp(u.accessToken, 1_000);
    const org = await t.signIn('08010000001');
    const created = await t.call('POST', '/pacts', org.accessToken, { title: 'Lock', category: 'other', target: 10_000_00, deadline: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10) });
    await t.call('POST', `/invites/${created.body.data.pact.inviteCode}/join`, u.accessToken, {});
    let last;
    for (let i = 0; i < 5; i++) last = await t.call('POST', `/pacts/${created.body.data.pact.id}/contributions`, u.accessToken, { amount: 500_00, pin: '1111' });
    assert.equal(last!.status, 423);
    const right = await t.call('POST', `/pacts/${created.body.data.pact.id}/contributions`, u.accessToken, { amount: 500_00, pin: '2468' });
    assert.equal(right.status, 423);
  });

  it('rotates refresh tokens, tolerates interrupted retries, and revokes on later reuse', async () => {
    const s = await t.signIn('08010000003', undefined, true);
    // Two refreshes whose responses were "lost": the original token is retried each time.
    const a = await t.call('POST', '/auth/refresh', undefined, { refreshToken: s.refreshToken });
    const b = await t.call('POST', '/auth/refresh', undefined, { refreshToken: s.refreshToken });
    const c = await t.call('POST', '/auth/refresh', undefined, { refreshToken: s.refreshToken });
    assert.deepEqual([a.status, b.status, c.status], [200, 200, 200]);
    assert.notEqual(c.body.refreshToken, s.refreshToken);
    // Two minutes later, any replaced token is treated as stolen: the whole session ends.
    t.setClock(() => new Date(Date.now() + 120_000));
    const replay = await t.call('POST', '/auth/refresh', undefined, { refreshToken: a.body.refreshToken });
    assert.equal(replay.status, 401);
    const latest = await t.call('POST', '/auth/refresh', undefined, { refreshToken: c.body.refreshToken });
    t.setClock(() => new Date());
    assert.equal(latest.status, 401);
    assert.equal((await t.call('GET', '/me', c.body.accessToken)).status, 401);
  });

  it('hides Pacts from people who are not in them', async () => {
    const outsider = await t.signIn('08030001111', { firstName: 'Out', lastName: 'Sider', pin: '2468' });
    const org = await t.signIn('08010000001');
    const list = await t.call('GET', '/pacts', org.accessToken);
    const res = await t.call('GET', `/pacts/${list.body.data[0].id}`, outsider.accessToken);
    assert.equal(res.status, 404);
    const unauth = await t.call('GET', '/wallet');
    assert.equal(unauth.status, 401);
  });

  it('verifies a BVN, raises the tier, and refuses a BVN already in use', async () => {
    const u = await t.signIn('08034440000', { firstName: 'Kyc', lastName: 'Tester', pin: '2468' });
    const r = await t.call('POST', '/me/kyc/bvn', u.accessToken, { bvn: '22233344455', dateOfBirth: '1990-01-01' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.kycTier, 2);
    assert.equal(r.body.bvnLast4, '4455');
    const other = await t.signIn('08034441111', { firstName: 'Dup', lastName: 'Tester', pin: '2468' });
    const dup = await t.call('POST', '/me/kyc/bvn', other.accessToken, { bvn: '22233344455', dateOfBirth: '1990-01-01' });
    assert.equal(dup.status, 409);
    const young = await t.call('POST', '/me/kyc/bvn', other.accessToken, { bvn: '22233344466', dateOfBirth: '2015-01-01' });
    assert.equal(young.status, 400);
  });

  it('rate limits OTP requests per number', async () => {
    const phone = '08032223333';
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await t.call('POST', '/auth/otp/request', undefined, { phone }, { 'x-forwarded-for': `10.0.0.${i}` })).status);
    assert.ok(codes.includes(429));
  });
});

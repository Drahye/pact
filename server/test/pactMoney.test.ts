/**
 * Paying a Pact by bank transfer (members matched by name, guests by bank name) and
 * paying vendors straight from the pool, with approval, reversals, receipts and refunds.
 * Includes attempts to break each rule by calling the API or the database directly.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { reconcile } from '../src/modules/ledger.js';
import { prorate } from '../src/modules/pacts.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type Session = { accessToken: string; user: { id: string } };

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const PIN = '1357';

describe('Pact accounts, bank transfers and vendor payments', () => {
  let t: T;
  let abraham: Session; // organiser, BVN verified
  let sarah: Session; // member, BVN verified: Sarah Adeyemi
  let david: Session; // member: David Eze
  let outsider: Session;

  const pactOf = async (id: string, who = abraham) => (await t.call('GET', `/pacts/${id}`, who.accessToken)).body.data.pact;
  /** Runs queued jobs, including the sandbox's delayed transfer webhooks. */
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await t.drain();
      await t.db.query('UPDATE jobs SET run_at = now() WHERE done_at IS NULL');
    }
    await t.drain();
  };
  const transfer = (accountNumber: string, amount: number, senderName: string, senderAccount?: string) =>
    t.call('POST', `/sandbox/pact-accounts/${accountNumber}/transfers`, abraham.accessToken, { amount, senderName, ...(senderAccount ? { senderAccount } : {}) });
  const newPact = async (opts: { target: number; policy: 'refund' | 'release'; title: string }) => {
    const r = await t.call('POST', '/pacts', abraham.accessToken, { title: opts.title, category: 'event', target: opts.target, deadline: future(30), missedGoalPolicy: opts.policy });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const pact = r.body.data.pact;
    for (const s of [sarah, david]) assert.equal((await t.call('POST', `/invites/${pact.inviteCode}/join`, s.accessToken, {})).status, 200);
    const acct = await t.call('POST', `/pacts/${pact.id}/bank-account`, abraham.accessToken, {});
    assert.equal(acct.status, 200, JSON.stringify(acct.body));
    return acct.body.data.pact as { id: string; inviteCode: string; bankAccount: { accountNumber: string } };
  };

  before(async () => {
    t = await setup({ seed: true });
    abraham = await t.signIn('08010000001');
    sarah = await t.signIn('08010000002');
    david = await t.signIn('08010000003');
    outsider = await t.signIn('08035550101', { firstName: 'Olu', lastName: 'Outsider', pin: '2468' });
  });
  after(async () => {
    await t.close();
  });

  /* ---------------- money in ---------------- */

  let party: { id: string; inviteCode: string; bankAccount: { accountNumber: string } };

  it('gives a Pact an account number that only organisers set up, shown on the invite', async () => {
    const r = await t.call('POST', '/pacts', abraham.accessToken, { title: 'Owambe', category: 'event', target: 100_000_00, deadline: future(30) });
    const id = r.body.data.pact.id;
    await t.call('POST', `/invites/${r.body.data.pact.inviteCode}/join`, sarah.accessToken, {});
    assert.equal((await t.call('POST', `/pacts/${id}/bank-account`, sarah.accessToken, {})).status, 403);
    assert.equal((await t.call('POST', `/pacts/${id}/bank-account`, outsider.accessToken, {})).status, 404);

    party = await newPact({ target: 100_000_00, policy: 'refund', title: 'Class of 2016 reunion' });
    assert.match(party.bankAccount.accountNumber, /^\d{10}$/);
    // Asking again returns the same number.
    const again = await t.call('POST', `/pacts/${party.id}/bank-account`, abraham.accessToken, {});
    assert.equal(again.body.data.pact.bankAccount.accountNumber, party.bankAccount.accountNumber);
    const preview = await t.call('GET', `/invites/${party.inviteCode}`);
    assert.equal(preview.body.bankAccount.accountNumber, party.bankAccount.accountNumber);
  });

  it('counts a transfer for the member whose name matches, and shows strangers as guests', async () => {
    assert.equal((await transfer(party.bankAccount.accountNumber, 20_000_00, 'Adeyemi Sarah Tolani')).status, 200);
    assert.equal((await transfer(party.bankAccount.accountNumber, 5_000_00, 'OKONKWO JANE')).status, 200);
    const p = await pactOf(party.id);
    assert.equal(p.raised, 25_000_00);
    assert.equal(p.members.find((m: { userId: string }) => m.userId === sarah.user.id).contributed, 20_000_00);
    const guest = p.transfers.find((x: { userId: string | null }) => x.userId === null);
    assert.equal(guest.senderName, 'OKONKWO JANE');
    assert.equal(guest.amount, 5_000_00);
    const feed = (await t.call('GET', '/activity', abraham.accessToken)).body.data;
    assert.ok(feed.some((a: { type: string; detail: string }) => a.type === 'guest_contribution' && a.detail === 'Okonkwo Jane'));
  });

  it('credits a redelivered transfer once, and never an unsigned or unknown one', async () => {
    const sign = (t.ctx.provider as unknown as { sign(b: string): string }).sign;
    const body = JSON.stringify({
      event: 'charge.success',
      data: { id: 1, reference: 'DVA_replay_1', amount: 1_000_00, currency: 'NGN', channel: 'dedicated_nuban', authorization: { channel: 'dedicated_nuban', receiver_bank_account_number: party.bankAccount.accountNumber, sender_name: 'BELLO TUNDE' } },
    });
    const send = (sig: string) => t.app.inject({ method: 'POST', url: '/api/webhooks/sandbox', headers: { 'content-type': 'application/json', 'x-paystack-signature': sig }, payload: body });
    for (let i = 0; i < 3; i++) assert.equal((await send(sign(body))).statusCode, 200);
    assert.equal((await send('0'.repeat(128))).statusCode, 401);
    assert.equal((await pactOf(party.id)).raised, 26_000_00);

    // A transfer to a number that isn't a Pact goes to suspense for a person to look at.
    await transfer('8800000001', 3_000_00, 'SOMEONE ELSE');
    assert.equal((await pactOf(party.id)).raised, 26_000_00);
    const suspense = await t.db.query<{ balance: number }>(`SELECT balance FROM accounts WHERE code = 'suspense'`);
    assert.equal(suspense.rows[0].balance, 3_000_00);
    assert.ok((await reconcile(t.db)).ok);
  });

  it('lets organisers say who a transfer was from, and nobody else', async () => {
    const guest = (await pactOf(party.id)).transfers.find((x: { senderName: string }) => x.senderName === 'OKONKWO JANE');
    assert.equal((await t.call('PATCH', `/pacts/${party.id}/transfers/${guest.id}`, david.accessToken, { userId: david.user.id })).status, 403);
    assert.equal((await t.call('PATCH', `/pacts/${party.id}/transfers/${guest.id}`, outsider.accessToken, { userId: outsider.user.id })).status, 404);
    assert.equal((await t.call('PATCH', `/pacts/${party.id}/transfers/${guest.id}`, abraham.accessToken, { userId: outsider.user.id })).status, 400);

    const moved = await t.call('PATCH', `/pacts/${party.id}/transfers/${guest.id}`, abraham.accessToken, { userId: david.user.id });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.pact.members.find((m: { userId: string }) => m.userId === david.user.id).contributed, 5_000_00);
    const back = await t.call('PATCH', `/pacts/${party.id}/transfers/${guest.id}`, abraham.accessToken, { userId: null });
    assert.equal(back.body.data.pact.members.find((m: { userId: string }) => m.userId === david.user.id).contributed, 0);
    assert.equal(back.body.data.pact.raised, 26_000_00, 'reassigning never moves money');
  });

  it('keeps sender account numbers and other Pacts’ transfers out of reach, even from raw SQL', async () => {
    const asOutsider = await t.db.asUser(outsider.user.id, (q) => q.query('SELECT id FROM pact_transfers'));
    assert.equal(asOutsider.rowCount, 0);
    for (const sql of ['SELECT sender_account_enc FROM pact_transfers', 'SELECT account_number_enc FROM pact_payouts', 'SELECT receipt FROM pact_payouts', 'UPDATE pact_transfers SET user_id = NULL', 'INSERT INTO pact_bank_accounts (pact_id, provider, provider_ref, account_number, bank_name, account_name) VALUES (gen_random_uuid(), $$x$$, $$x$$, $$1$$, $$x$$, $$x$$)']) {
      await assert.rejects(t.db.asUser(sarah.user.id, (q) => q.query(sql)), (e: { code?: string }) => e.code === '42501', sql);
    }
  });

  it('refunds every bank transfer to the account it came from, and sends late transfers back', async () => {
    const before = (await t.call('GET', '/wallet', sarah.accessToken)).body.balance;
    const c = await t.call('POST', `/pacts/${party.id}/cancel`, abraham.accessToken, { pin: PIN });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    // Sarah paid by transfer, so her refund goes to her bank, not her wallet.
    assert.equal((await t.call('GET', '/wallet', sarah.accessToken)).body.balance, before);
    await settle();
    const p = await pactOf(party.id);
    assert.equal(p.transfers.find((x: { userId: string | null }) => x.userId === sarah.user.id).status, 'refunded');
    assert.equal(p.bankAccount.status, 'closed');
    const guests = Object.fromEntries(p.transfers.filter((x: { userId: string | null }) => !x.userId).map((x: { senderName: string; status: string }) => [x.senderName, x.status]));
    // Back to the account it came from; a transfer with no sender account on file waits in suspense for a person.
    assert.deepEqual(guests, { 'OKONKWO JANE': 'refunded', 'BELLO TUNDE': 'held' });
    assert.equal((await t.call('GET', `/invites/${party.inviteCode}`)).body.bankAccount, null);

    await transfer(party.bankAccount.accountNumber, 2_000_00, 'LATE PAYER', '0123456781');
    await settle();
    const late = (await pactOf(party.id)).transfers.find((x: { senderName: string }) => x.senderName === 'LATE PAYER');
    assert.equal(late.status, 'returned');
    assert.equal((await pactOf(party.id)).raised, 26_000_00);
    assert.ok((await reconcile(t.db)).ok);
  });

  /* ---------------- money out ---------------- */

  let trip: { id: string; bankAccount: { accountNumber: string } };
  const pay = (who: Session, body: Record<string, unknown>) =>
    t.call('POST', `/pacts/${trip.id}/payouts`, who.accessToken, { bankCode: '058', accountNumber: '0123456780', purpose: 'Bus hire', pin: PIN, ...body });

  it('pays a vendor from the pool: organisers only, and only when the refund promise allows', async () => {
    // A Pact that promised refunds can't pay deposits before it's funded.
    const safe = await newPact({ target: 100_000_00, policy: 'refund', title: 'Refund promised' });
    await transfer(safe.bankAccount.accountNumber, 50_000_00, 'OKAFOR ABRAHAM');
    const early = await t.call('POST', `/pacts/${safe.id}/payouts`, abraham.accessToken, { bankCode: '058', accountNumber: '0123456780', amount: 10_000_00, purpose: 'Deposit', pin: PIN });
    assert.equal(early.status, 422);
    assert.equal(early.body.error.code, 'refund_promised');

    trip = await newPact({ target: 1_000_000_00, policy: 'release', title: 'Ibadan trip' });
    await transfer(trip.bankAccount.accountNumber, 500_000_00, 'OKAFOR ABRAHAM C');
    assert.equal((await pay(david, { amount: 10_000_00 })).status, 403);
    assert.equal((await pay(outsider, { amount: 10_000_00 })).status, 404);
    assert.equal((await pay(abraham, { amount: 10_000_00, pin: '0000' })).status, 403);

    const resolved = await t.call('POST', `/pacts/${trip.id}/payouts/resolve`, abraham.accessToken, { bankCode: '058', accountNumber: '0123456780' });
    assert.equal(resolved.status, 200);
    const r = await pay(abraham, { amount: 50_000_00 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.pact.poolBalance, 500_000_00 - 50_050_00);
    await settle();
    const p = await pactOf(trip.id, david);
    assert.equal(p.payouts[0].status, 'succeeded');
    assert.equal(p.payouts[0].accountName, resolved.body.accountName);
    const notes = (await t.call('GET', '/notifications', david.accessToken)).body.items;
    assert.ok(notes.some((n: { type: string }) => n.type === 'vendor_paid'));
  });

  it('needs a co-organiser to approve large payments, and never the person who asked', async () => {
    const big = await pay(abraham, { amount: 250_000_00, purpose: 'Hotel' });
    assert.equal(big.status, 422);
    assert.equal(big.body.error.code, 'needs_co_organizer');

    assert.equal((await t.call('PUT', `/pacts/${trip.id}/co-organizer`, david.accessToken, { userId: david.user.id })).status, 403);
    assert.equal((await t.call('PUT', `/pacts/${trip.id}/co-organizer`, abraham.accessToken, { userId: outsider.user.id })).status, 400);
    // David hasn't verified a BVN: he could be the organiser's second account.
    const unverified = await t.call('PUT', `/pacts/${trip.id}/co-organizer`, abraham.accessToken, { userId: david.user.id });
    assert.equal(unverified.status, 422);
    assert.equal(unverified.body.error.code, 'co_organizer_unverified');
    assert.equal((await t.call('PUT', `/pacts/${trip.id}/co-organizer`, abraham.accessToken, { userId: sarah.user.id })).status, 200);

    const asked = await pay(abraham, { amount: 250_000_00, purpose: 'Hotel' });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const waiting = asked.body.data.pact.payouts.find((x: { status: string }) => x.status === 'awaiting_approval');
    assert.equal(asked.body.data.pact.poolBalance, 500_000_00 - 50_050_00 - 250_050_00, 'held as soon as it is asked for');
    assert.equal((await t.call('POST', `/pacts/${trip.id}/payouts/${waiting.id}/approve`, abraham.accessToken, { pin: PIN })).status, 403);
    assert.equal((await t.call('POST', `/pacts/${trip.id}/payouts/${waiting.id}/approve`, david.accessToken, { pin: PIN })).status, 403);
    assert.equal((await t.call('POST', `/pacts/${trip.id}/cancel`, abraham.accessToken, { pin: PIN })).body.error.code, 'payment_waiting');

    const no = await t.call('POST', `/pacts/${trip.id}/payouts/${waiting.id}/reject`, sarah.accessToken, {});
    assert.equal(no.status, 200);
    assert.equal(no.body.data.pact.poolBalance, 500_000_00 - 50_050_00, 'money back in the pool');
    assert.equal((await t.call('POST', `/pacts/${trip.id}/payouts/${waiting.id}/approve`, sarah.accessToken, { pin: PIN })).status, 400);

    const again = await pay(abraham, { amount: 250_000_00, purpose: 'Hotel' });
    const id = again.body.data.pact.payouts.find((x: { status: string }) => x.status === 'awaiting_approval').id;
    assert.equal((await t.call('POST', `/pacts/${trip.id}/payouts/${id}/approve`, sarah.accessToken, { pin: PIN })).status, 200);
    await settle();
    assert.equal((await pactOf(trip.id)).payouts.find((x: { id: string }) => x.id === id).status, 'succeeded');
  });

  it('puts money back when a vendor transfer fails, and never pays out more than the pool', async () => {
    const before = (await pactOf(trip.id)).poolBalance;
    const r = await pay(abraham, { amount: 20_000_00, accountNumber: '0123459999' });
    assert.equal(r.status, 200);
    await settle();
    const p = await pactOf(trip.id);
    assert.equal(p.payouts.at(-1).status, 'failed');
    assert.equal(p.poolBalance, before);

    const tooMuch = await pay(abraham, { amount: before, purpose: 'Everything' });
    assert.equal(tooMuch.status, 422);
    assert.equal(tooMuch.body.error.code, 'insufficient_pool');
    assert.ok((await reconcile(t.db)).ok);
  });

  it('keeps receipts private to the Pact and lets only organisers add them', async () => {
    const paid = (await pactOf(trip.id)).payouts.find((x: { status: string }) => x.status === 'succeeded');
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#3dd68c' } }).png().toBuffer();
    const upload = (who: Session, data: Buffer, type = 'image/png') =>
      t.app.inject({ method: 'POST', url: `/api/pacts/${trip.id}/payouts/${paid.id}/receipt`, headers: { authorization: `Bearer ${who.accessToken}`, 'content-type': type }, payload: data });
    assert.equal((await upload(david, png)).statusCode, 403);
    assert.equal((await upload(abraham, Buffer.from('#!/bin/sh\nrm -rf /'), 'image/png')).statusCode, 415);
    assert.equal((await upload(abraham, png)).statusCode, 200);
    assert.equal((await upload(abraham, png)).statusCode, 409, 'a receipt members have seen can’t be swapped');
    assert.equal((await pactOf(trip.id)).payouts.find((x: { id: string }) => x.id === paid.id).hasReceipt, true);
    const url = `/pacts/${trip.id}/payouts/${paid.id}/receipt`;
    const seen = await t.app.inject({ method: 'GET', url: `/api/${url.slice(1)}`, headers: { authorization: `Bearer ${david.accessToken}` } });
    assert.equal(seen.statusCode, 200);
    assert.equal(seen.headers['content-type'], 'image/webp');
    assert.equal((await t.call('GET', url, outsider.accessToken)).status, 404);
    assert.equal((await t.call('GET', url)).status, 401);
  });

  it('shares what is left fairly when a Pact closes after paying vendors', async () => {
    await transfer(trip.bankAccount.accountNumber, 100_000_00, 'ZAINAB GUEST');
    const p = await pactOf(trip.id);
    const pool = p.poolBalance;
    const abrahamIn = p.members.find((m: { userId: string }) => m.userId === abraham.user.id).contributed;
    assert.equal((await t.call('POST', `/pacts/${trip.id}/cancel`, abraham.accessToken, { pin: PIN })).status, 200);
    await settle();
    // Both paid by transfer: each gets the same share of what's left, back to their bank.
    const refunds = (await pactOf(trip.id)).payouts.filter((x: { kind: string }) => x.kind === 'guest_refund');
    assert.ok(refunds.every((x: { status: string }) => x.status === 'succeeded'));
    assert.equal(refunds.reduce((s: number, x: { amount: number }) => s + x.amount, 0), pool);
    const share = Math.floor((abrahamIn * pool) / (abrahamIn + 100_000_00));
    assert.ok(refunds.some((x: { amount: number }) => Math.abs(x.amount - share) <= 1), `expected a refund of about ${share}`);
    assert.ok((await reconcile(t.db)).ok);
  });

  it('refunds bank transfers to the bank they came from, whoever they were counted for', async () => {
    // Attack: an organiser says a stranger's transfer was theirs, then closes the Pact to collect the refund.
    const bait = await newPact({ target: 500_000_00, policy: 'refund', title: 'Bait' });
    await transfer(bait.bankAccount.accountNumber, 50_000_00, 'STRANGER DANGER', '0123456782');
    const g = (await pactOf(bait.id)).transfers[0];
    assert.equal((await t.call('PATCH', `/pacts/${bait.id}/transfers/${g.id}`, abraham.accessToken, { userId: abraham.user.id })).status, 200);
    const before = (await t.call('GET', '/wallet', abraham.accessToken)).body.balance;
    assert.equal((await t.call('POST', `/pacts/${bait.id}/cancel`, abraham.accessToken, { pin: PIN })).status, 200);
    await settle();
    assert.equal((await t.call('GET', '/wallet', abraham.accessToken)).body.balance, before, 'the organiser got nothing');
    const back = (await pactOf(bait.id)).payouts.find((x: { kind: string }) => x.kind === 'guest_refund');
    assert.equal(back.amount, 50_000_00);
    assert.equal(back.status, 'succeeded');
    assert.equal(back.last4, '6782');
  });

  it('counts payments over a day, so a large one can’t be split into small ones to skip approval', async () => {
    const p = await newPact({ target: 2_000_000_00, policy: 'release', title: 'Split attempt' });
    await transfer(p.bankAccount.accountNumber, 1_000_000_00, 'OKAFOR ABRAHAM');
    const payTo = (amount: number) => t.call('POST', `/pacts/${p.id}/payouts`, abraham.accessToken, { bankCode: '058', accountNumber: '0123456780', amount, purpose: 'Chairs', pin: PIN });
    assert.equal((await payTo(190_000_00)).status, 200);
    const second = await payTo(20_000_00);
    assert.equal(second.status, 422);
    assert.equal(second.body.error.code, 'needs_co_organizer');
  });

  it('sends tiny late transfers to a person instead of paying a fee to return each one', async () => {
    const before = (await t.db.query<{ balance: number }>(`SELECT balance FROM accounts WHERE code = 'suspense'`)).rows[0].balance;
    await transfer(party.bankAccount.accountNumber, 1_00, 'PENNY SPAMMER', '0123456783');
    await settle();
    const late = (await pactOf(party.id)).transfers.find((x: { senderName: string }) => x.senderName === 'PENNY SPAMMER');
    assert.equal(late.status, 'held');
    assert.equal((await t.db.query<{ balance: number }>(`SELECT balance FROM accounts WHERE code = 'suspense'`)).rows[0].balance, before + 1_00);
  });

  it('needs the co-organiser to approve releasing the pool to the organiser', async () => {
    const p = await newPact({ target: 100_000_00, policy: 'refund', title: 'Release check' });
    await transfer(p.bankAccount.accountNumber, 100_000_00, 'OKAFOR ABRAHAM');
    assert.equal((await pactOf(p.id)).status, 'funded');
    assert.equal((await t.call('PUT', `/pacts/${p.id}/co-organizer`, abraham.accessToken, { userId: sarah.user.id })).status, 200);
    const walletBefore = (await t.call('GET', '/wallet', abraham.accessToken)).body.balance;

    const asked = await t.call('POST', `/pacts/${p.id}/release`, abraham.accessToken, { pin: PIN });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    assert.equal(asked.body.data.pact.status, 'funded', 'nothing moves until approved');
    assert.equal(asked.body.data.pact.releaseRequest.requestedBy, abraham.user.id);
    assert.equal((await t.call('GET', '/wallet', abraham.accessToken)).body.balance, walletBefore);

    // Nobody else can approve: not the organiser, not a member, not an outsider.
    assert.equal((await t.call('POST', `/pacts/${p.id}/release/approve`, abraham.accessToken, { pin: PIN })).status, 403);
    assert.equal((await t.call('POST', `/pacts/${p.id}/release/approve`, david.accessToken, { pin: PIN })).status, 403);
    assert.equal((await t.call('POST', `/pacts/${p.id}/release/approve`, outsider.accessToken, { pin: PIN })).status, 404);
    assert.equal((await t.call('POST', `/pacts/${p.id}/release/approve`, sarah.accessToken, { pin: '0000' })).status, 403);

    // Declined: the request goes away and the money stays.
    assert.equal((await t.call('POST', `/pacts/${p.id}/release/decline`, sarah.accessToken, {})).body.data.pact.releaseRequest, null);
    // Asked again, then the co-organiser is swapped out: the old request can't be approved by anyone.
    await t.call('POST', `/pacts/${p.id}/release`, abraham.accessToken, { pin: PIN });
    await t.call('PUT', `/pacts/${p.id}/co-organizer`, abraham.accessToken, { userId: null });
    assert.equal((await pactOf(p.id)).releaseRequest, null);
    await t.call('PUT', `/pacts/${p.id}/co-organizer`, abraham.accessToken, { userId: sarah.user.id });
    assert.equal((await t.call('POST', `/pacts/${p.id}/release/approve`, sarah.accessToken, { pin: PIN })).body.error.code, 'no_release_request');

    await t.call('POST', `/pacts/${p.id}/release`, abraham.accessToken, { pin: PIN });
    const ok = await t.call('POST', `/pacts/${p.id}/release/approve`, sarah.accessToken, { pin: PIN });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.pact.status, 'released');
    assert.equal((await t.call('GET', '/wallet', abraham.accessToken)).body.balance, walletBefore + 100_000_00);
    assert.ok((await reconcile(t.db)).ok);
  });

  it('splits to the kobo with nothing lost to rounding', () => {
    const out = prorate([{ key: 'a', amount: 1 }, { key: 'b', amount: 1 }, { key: 'c', amount: 1 }], 2);
    assert.equal([...out.values()].reduce((s, v) => s + v, 0), 2);
    assert.deepEqual([...prorate([{ key: 'a', amount: 500 }, { key: 'b', amount: 300 }], 1_000).values()], [500, 300]);
  });
});

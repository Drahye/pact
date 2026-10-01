/**
 * Funded is not finished. A Pact that reached its target has the money; it is completed when the
 * organiser says the plan happened. These tests walk that lifecycle through the real API: paying
 * budget lines from the pool, partial and failed payments, approval, completing with and without
 * money left, what members can and cannot do, and that refunds still work as before.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { syncProductEvents } from '../src/modules/events.js';
import { reconcile } from '../src/modules/ledger.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type Session = { accessToken: string; user: { id: string } };
type Line = { id: string; name: string; amount: number; funded: number; paid: number; pending: number; waiting: number };

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const PIN = '1357';
const FEE = 50_00;

describe('Execution: funded is not finished', () => {
  let t: T;
  let abraham: Session; // organiser, BVN verified
  let sarah: Session; // member, BVN verified (can be co-organiser)
  let david: Session; // member
  let outsider: Session;

  const pactOf = async (id: string, who = abraham) => (await t.call('GET', `/pacts/${id}`, who.accessToken)).body.data.pact;
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await t.drain();
      await t.db.query('UPDATE jobs SET run_at = now() WHERE done_at IS NULL');
    }
    await t.drain();
  };
  const line = (pact: { budget: Line[] }, name: string) => pact.budget.find((b) => b.name === name)!;

  /** A Pact with a four-line budget (₦500k), joined by Sarah and David, funded by a bank transfer. */
  const fundedPact = async (title: string, fund = true) => {
    const r = await t.call('POST', '/pacts', abraham.accessToken, {
      title,
      category: 'trip',
      deadline: future(30),
      missedGoalPolicy: 'refund',
      budget: [
        { name: 'Hotel', amount: 200_000_00 },
        { name: 'Bus', amount: 140_000_00 },
        { name: 'Food', amount: 90_000_00 },
        { name: 'Emergency', amount: 70_000_00 },
      ],
      tasks: [{ title: 'Book the hotel' }, { title: 'Confirm the bus' }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const pact = r.body.data.pact;
    for (const s of [sarah, david]) assert.equal((await t.call('POST', `/invites/${pact.inviteCode}/join`, s.accessToken, {})).status, 200);
    const acct = await t.call('POST', `/pacts/${pact.id}/bank-account`, abraham.accessToken, {});
    assert.equal(acct.status, 200, JSON.stringify(acct.body));
    if (fund) {
      const res = await t.call('POST', `/sandbox/pact-accounts/${acct.body.data.pact.bankAccount.accountNumber}/transfers`, abraham.accessToken, { amount: 500_000_00, senderName: 'OKAFOR ABRAHAM' });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    }
    return { id: pact.id as string, inviteCode: pact.inviteCode as string };
  };
  const payFrom = (id: string, who: Session, body: Record<string, unknown>) =>
    t.call('POST', `/pacts/${id}/payouts`, who.accessToken, { bankCode: '058', accountNumber: '0123456780', purpose: 'Payment', pin: PIN, ...body });
  const complete = (id: string, who: Session, body: Record<string, unknown> = {}) => t.call('POST', `/pacts/${id}/complete`, who.accessToken, body);

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

  it('A: reaching the target makes a Pact funded and ready, not completed', async () => {
    const p = await fundedPact('A funded');
    const pact = await pactOf(p.id);
    assert.equal(pact.status, 'funded');
    assert.equal(pact.completedAt, null, 'funded is the money, not the outcome');
    assert.equal(pact.poolBalance, 500_000_00, 'all of it is available to use');
    assert.equal(line(pact, 'Hotel').paid, 0);
    // The member's view is the same Pact.
    assert.equal((await pactOf(p.id, david)).completedAt, null);
  });

  it('B: paying a budget line from the pool marks it paid, reduces the pool and is visible to members', async () => {
    const p = await fundedPact('B pay a line');
    const hotel = line(await pactOf(p.id), 'Hotel');
    const r = await payFrom(p.id, abraham, { amount: 200_000_00, purpose: 'Hotel', budgetItemId: hotel.id });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const mid = r.body.data.pact;
    assert.equal(mid.poolBalance, 500_000_00 - 200_000_00 - FEE, 'held as soon as it is asked for');
    assert.equal(line(mid, 'Hotel').paid, 0, 'not paid until the bank says so');
    assert.equal(line(mid, 'Hotel').pending, 200_000_00);
    await settle();
    const done = await pactOf(p.id, david);
    assert.equal(line(done, 'Hotel').paid, 200_000_00);
    assert.equal(line(done, 'Hotel').pending, 0);
    assert.equal(done.payouts[0].status, 'succeeded');
    assert.equal(done.payouts[0].budgetItemId, hotel.id);
    assert.equal(done.status, 'funded', 'still going: paying is not completing');
    assert.equal(done.completedAt, null);
    assert.ok(!('accountNumber' in done.payouts[0]), 'members never see bank account numbers');
    assert.ok((await reconcile(t.db)).ok);
  });

  it('C: a partial payment leaves the rest of the line to pay', async () => {
    const p = await fundedPact('C partial');
    const hotel = line(await pactOf(p.id), 'Hotel');
    await payFrom(p.id, abraham, { amount: 100_000_00, purpose: 'Hotel deposit', budgetItemId: hotel.id });
    await settle();
    const l = line(await pactOf(p.id), 'Hotel');
    assert.equal(l.paid, 100_000_00);
    assert.equal(l.amount - l.paid, 100_000_00, '₦100k still to pay');
    // The organiser can then pay the rest; the amount is theirs to choose.
    await payFrom(p.id, abraham, { amount: 100_000_00, purpose: 'Hotel balance', budgetItemId: hotel.id });
    await settle();
    assert.equal(line(await pactOf(p.id), 'Hotel').paid, 200_000_00);
  });

  it('D: a failed payment never marks the line paid and puts the money back', async () => {
    const p = await fundedPact('D failed');
    const bus = line(await pactOf(p.id), 'Bus');
    const before = (await pactOf(p.id)).poolBalance;
    await payFrom(p.id, abraham, { amount: 50_000_00, purpose: 'Bus', budgetItemId: bus.id, accountNumber: '0123459999' });
    await settle();
    const after = await pactOf(p.id);
    assert.equal(after.payouts[0].status, 'failed');
    assert.equal(line(after, 'Bus').paid, 0, 'a failed payment is not a paid line');
    assert.equal(line(after, 'Bus').pending, 0);
    assert.equal(after.poolBalance, before, 'the money is back in the pool');
    // And it can simply be tried again.
    const retry = await payFrom(p.id, abraham, { amount: 50_000_00, purpose: 'Bus', budgetItemId: bus.id });
    assert.equal(retry.status, 200);
    await settle();
    assert.equal(line(await pactOf(p.id), 'Bus').paid, 50_000_00);
    assert.ok((await reconcile(t.db)).ok);
  });

  it('E: a payment that needs approval shows as waiting and only counts as paid after it lands', async () => {
    const p = await fundedPact('E approval');
    const hotel = line(await pactOf(p.id), 'Hotel');
    const big = await payFrom(p.id, abraham, { amount: 250_000_00, purpose: 'Hotel', budgetItemId: hotel.id });
    assert.equal(big.body.error.code, 'needs_co_organizer', 'over the limit and nobody to approve');
    assert.equal((await t.call('PUT', `/pacts/${p.id}/co-organizer`, abraham.accessToken, { userId: sarah.user.id })).status, 200);
    const asked = await payFrom(p.id, abraham, { amount: 250_000_00, purpose: 'Hotel', budgetItemId: hotel.id });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const waiting = line(asked.body.data.pact, 'Hotel');
    assert.equal(waiting.waiting, 250_000_00, 'the request is waiting for approval');
    assert.equal(waiting.paid, 0);
    const id = asked.body.data.pact.payouts.find((x: { status: string }) => x.status === 'awaiting_approval').id;
    // The organiser cannot complete while it waits, and cannot approve their own request.
    assert.equal((await complete(p.id, abraham, { releaseRemaining: false })).body.error.code, 'payment_pending');
    assert.equal((await t.call('POST', `/pacts/${p.id}/payouts/${id}/approve`, abraham.accessToken, { pin: PIN })).status, 403);
    assert.equal((await t.call('POST', `/pacts/${p.id}/payouts/${id}/approve`, sarah.accessToken, { pin: PIN })).status, 200);
    await settle();
    const done = await pactOf(p.id);
    assert.equal(line(done, 'Hotel').paid, 250_000_00);
    assert.equal(line(done, 'Hotel').waiting, 0);
  });

  it('F: completing with money left makes the organiser choose, and never releases it silently', async () => {
    const p = await fundedPact('F remaining');
    const hotel = line(await pactOf(p.id), 'Hotel');
    await payFrom(p.id, abraham, { amount: 120_000_00, purpose: 'Hotel', budgetItemId: hotel.id });
    await settle();
    const poolBefore = (await pactOf(p.id)).poolBalance;
    assert.ok(poolBefore > 0);
    const wallet = (await t.call('GET', '/wallet', abraham.accessToken)).body.balance;

    // Only the organiser; no silent default.
    assert.equal((await complete(p.id, david, { releaseRemaining: true, pin: PIN })).status, 403);
    assert.equal((await complete(p.id, outsider)).status, 404);
    const silent = await complete(p.id, abraham);
    assert.equal(silent.status, 422);
    assert.equal(silent.body.error.code, 'remaining_balance');
    assert.equal(silent.body.error.details.remaining, poolBefore);
    const stillOpen = await pactOf(p.id);
    assert.equal(stillOpen.completedAt, null, 'nothing changed');
    assert.equal(stillOpen.poolBalance, poolBefore);
    assert.equal((await t.call('GET', '/wallet', abraham.accessToken)).body.balance, wallet, 'no money moved');

    // Releasing needs the PIN like any release.
    assert.equal((await complete(p.id, abraham, { releaseRemaining: true })).body.error.code, 'pin_required');
    assert.equal((await complete(p.id, abraham, { releaseRemaining: true, pin: '0000' })).status, 403);

    const ok = await complete(p.id, abraham, { releaseRemaining: true, pin: PIN });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.ok(ok.body.data.pact.completedAt);
    assert.equal(ok.body.data.pact.status, 'released');
    // Only what was left moved: not the ₦500k that was raised.
    assert.equal((await t.call('GET', '/wallet', abraham.accessToken)).body.balance, wallet + poolBefore);
    assert.equal(poolBefore, 500_000_00 - 120_000_00 - FEE);
    assert.ok((await reconcile(t.db)).ok);
  });

  it('F2: with a co-organiser, completing and releasing waits for approval and the release amount is the pool', async () => {
    const p = await fundedPact('F2 approval release');
    assert.equal((await t.call('PUT', `/pacts/${p.id}/co-organizer`, abraham.accessToken, { userId: sarah.user.id })).status, 200);
    const hotel = line(await pactOf(p.id), 'Hotel');
    await payFrom(p.id, abraham, { amount: 150_000_00, purpose: 'Hotel', budgetItemId: hotel.id });
    await settle();
    const pool = (await pactOf(p.id)).poolBalance;
    const wallet = (await t.call('GET', '/wallet', abraham.accessToken)).body.balance;
    const asked = await complete(p.id, abraham, { releaseRemaining: true, pin: PIN });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    assert.ok(asked.body.data.pact.completedAt, 'the outcome is recorded');
    assert.equal(asked.body.data.pact.status, 'funded', 'the money has not moved');
    assert.ok(asked.body.data.pact.releaseRequest);
    assert.equal((await t.call('GET', '/wallet', abraham.accessToken)).body.balance, wallet);
    const approved = await t.call('POST', `/pacts/${p.id}/release/approve`, sarah.accessToken, { pin: PIN });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal((await t.call('GET', '/wallet', abraham.accessToken)).body.balance, wallet + pool);
    assert.ok((await reconcile(t.db)).ok);
  });

  it('G: with nothing left, completing needs no release step', async () => {
    const p = await fundedPact('G zero');
    // More than ₦200k in a day needs the co-organiser, so Sarah approves each payment.
    assert.equal((await t.call('PUT', `/pacts/${p.id}/co-organizer`, abraham.accessToken, { userId: sarah.user.id })).status, 200);
    const payAndApprove = async (amount: number, purpose: string, item: string) => {
      const r = await payFrom(p.id, abraham, { amount, purpose, budgetItemId: item });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const waiting = r.body.data.pact.payouts.find((x: { status: string }) => x.status === 'awaiting_approval');
      if (waiting) assert.equal((await t.call('POST', `/pacts/${p.id}/payouts/${waiting.id}/approve`, sarah.accessToken, { pin: PIN })).status, 200);
      await settle();
    };
    const pact0 = await pactOf(p.id);
    await payAndApprove(200_000_00, 'Hotel', line(pact0, 'Hotel').id);
    await payAndApprove(140_000_00, 'Bus', line(pact0, 'Bus').id);
    // Pay the last of the pool, whatever the fee leaves.
    await payAndApprove((await pactOf(p.id)).poolBalance - FEE, 'Food and the rest', line(pact0, 'Food').id);
    const drained = await pactOf(p.id);
    assert.equal(drained.poolBalance, 0);
    const wallet = (await t.call('GET', '/wallet', abraham.accessToken)).body.balance;
    const done = await complete(p.id, abraham);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.ok(done.body.data.pact.completedAt);
    assert.equal(done.body.data.pact.status, 'funded', 'completed with nothing to release: no release step');
    assert.equal((await t.call('GET', '/wallet', abraham.accessToken)).body.balance, wallet);
    assert.equal((await complete(p.id, abraham)).body.error.code, 'already_completed');
    assert.ok((await reconcile(t.db)).ok);
  });

  it('H: members see what the money was used for but cannot pay, complete or release', async () => {
    const p = await fundedPact('H member');
    const hotel = line(await pactOf(p.id), 'Hotel');
    await payFrom(p.id, abraham, { amount: 50_000_00, purpose: 'Deposit', budgetItemId: hotel.id });
    await settle();
    const asMember = await pactOf(p.id, david);
    assert.equal(asMember.payouts.length, 1);
    assert.equal(asMember.payouts[0].purpose, 'Deposit');
    assert.equal((await payFrom(p.id, david, { amount: 1_000_00 })).status, 403);
    assert.equal((await complete(p.id, david, { releaseRemaining: true, pin: PIN })).status, 403);
    assert.equal((await t.call('POST', `/pacts/${p.id}/release`, david.accessToken, { pin: PIN })).status, 403);
  });

  it('I: cancelling and refunding behave as before, and a completed Pact cannot be cancelled or paid from', async () => {
    // Not completed: cancel refunds what is left, pro rata, exactly as it did.
    const c = await fundedPact('I cancel');
    const hotel = line(await pactOf(c.id), 'Hotel');
    await payFrom(c.id, abraham, { amount: 100_000_00, purpose: 'Deposit', budgetItemId: hotel.id });
    await settle();
    const cancelled = await t.call('POST', `/pacts/${c.id}/cancel`, abraham.accessToken, { pin: PIN });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.data.pact.status, 'cancelled');

    // Completed: nothing left to call off.
    const d = await fundedPact('I completed');
    const done = await complete(d.id, abraham, { releaseRemaining: true, pin: PIN });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const again = await fundedPact('I completed zero');
    await payFrom(again.id, abraham, { amount: 100_000_00, purpose: 'Something' });
    assert.ok((await reconcile(t.db)).ok);
    // A completed-but-not-released Pact (the co-organiser has not decided) refuses cancel and new payments.
    const e = await fundedPact('I completed unreleased');
    assert.equal((await t.call('PUT', `/pacts/${e.id}/co-organizer`, abraham.accessToken, { userId: sarah.user.id })).status, 200);
    assert.equal((await complete(e.id, abraham, { releaseRemaining: true, pin: PIN })).status, 200);
    assert.equal((await t.call('POST', `/pacts/${e.id}/cancel`, abraham.accessToken, { pin: PIN })).body.error.code, 'pact_completed');
    assert.equal((await payFrom(e.id, abraham, { amount: 10_000_00 })).body.error.code, 'pact_completed');
  });

  it('J: a completed Pact keeps its story: outcome, payments, people, tasks and what was released', async () => {
    const p = await fundedPact('J story');
    const pact0 = await pactOf(p.id);
    await payFrom(p.id, abraham, { amount: 200_000_00, purpose: 'Hotel', budgetItemId: line(pact0, 'Hotel').id });
    await settle();
    const tasks = pact0.tasks as { id: string }[];
    assert.equal((await t.call('PATCH', `/pacts/${p.id}/tasks/${tasks[0].id}`, abraham.accessToken, { status: 'done' })).status, 200);
    const poolBefore = (await pactOf(p.id)).poolBalance;
    const done = await complete(p.id, abraham, { releaseRemaining: true, pin: PIN });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const pact = await pactOf(p.id, sarah);
    assert.ok(pact.completedAt);
    assert.equal(pact.raised, 500_000_00);
    assert.equal(pact.payouts.filter((x: { status: string }) => x.status === 'succeeded').length, 1);
    assert.equal(line(pact, 'Hotel').paid, 200_000_00);
    assert.equal(pact.tasks.filter((x: { status: string }) => x.status === 'done').length, 1);
    assert.equal(pact.members.filter((m: { status: string }) => m.status === 'joined').length, 3);
    const feed = (await t.call('GET', `/pacts/${p.id}`, sarah.accessToken)).body.data.activities.map((a: { type: string }) => a.type);
    assert.ok(feed.includes('vendor_paid'));
    assert.ok(feed.includes('pact_completed'));
    assert.ok(feed.includes('released'));
    // What was released is the pool at that moment, not the raised total.
    const released = (await t.call('GET', `/pacts/${p.id}`, sarah.accessToken)).body.data.activities.find((a: { type: string }) => a.type === 'released');
    assert.equal(released.amount, poolBefore);
    assert.notEqual(released.amount, pact.raised);
  });

  it('K: it is refused while the Pact is still collecting, and a completed Pact is not completed twice', async () => {
    const open = await fundedPact('K open', false);
    const early = await complete(open.id, abraham);
    assert.equal(early.status, 400);
    assert.equal(early.body.error.code, 'not_funded');
  });

  it('L: execution shows up in the product funnel, with bands and no payment details', async () => {
    const p = await fundedPact('L analytics');
    const hotel = line(await pactOf(p.id), 'Hotel');
    await payFrom(p.id, abraham, { amount: 120_000_00, purpose: 'Secret vendor deposit', budgetItemId: hotel.id, accountNumber: '0123456780' });
    await settle();
    assert.equal((await complete(p.id, abraham, { releaseRemaining: true, pin: PIN })).status, 200);
    await syncProductEvents(t.ctx);
    const rows = (await t.db.query<{ name: string; props: Record<string, unknown> }>(`SELECT name, props FROM product_events WHERE name IN ('pact_execution_started', 'pact_payment_completed', 'pact_outcome_completed') ORDER BY id`)).rows;
    const names = new Set(rows.map((r) => r.name));
    for (const n of ['pact_execution_started', 'pact_payment_completed', 'pact_outcome_completed']) assert.ok(names.has(n), n);
    const payment = rows.find((r) => r.name === 'pact_payment_completed' && r.props.amount_band === 'over_100k');
    assert.ok(payment, 'the amount is a band, not a number');
    const dump = JSON.stringify(rows);
    assert.ok(!/0123456780|Secret vendor|ABC|Events|120000|12000000/.test(dump), 'no account, purpose, name or exact amount');
    // Running it again records nothing twice.
    const before = (await t.db.query(`SELECT 1 FROM product_events WHERE name = 'pact_outcome_completed'`)).rowCount;
    await syncProductEvents(t.ctx);
    assert.equal((await t.db.query(`SELECT 1 FROM product_events WHERE name = 'pact_outcome_completed'`)).rowCount, before);
  });
});

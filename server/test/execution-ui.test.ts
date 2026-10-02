/**
 * Funded is not finished, in the product's own logic: lifecycle, phases, the money story, budget line
 * states and the guidance that carries on after funding. Pure functions on fixtures.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BudgetLine, Pact, PactPayout } from '../../src/data/types.js';
import { setFixedClock } from '../../src/lib/clock.js';
import { cardStatus, isOutcomeComplete, lineLeftToPay, lineState, looksHandled, moneyOf, nextLineToPay, paymentsInFlight, phaseOf, progressOf } from '../../src/lib/execution.js';
import { lifecycleOf } from '../../src/lib/lifecycle.js';
import { summarize } from '../../src/lib/pact.js';
import { attentionFor, nextStepFor, stageOf } from '../../src/lib/plan.js';
import { lagosDay } from './helpers.js';

setFixedClock(false);
const day = (n: number) => lagosDay(n);
const line = (id: string, name: string, amount: number, paid = 0, pending = 0, waiting = 0): BudgetLine => ({ id, name, amount, funded: amount, paid, pending, waiting });
const task = (id: string, title: string, assigneeId: string | null, status: 'open' | 'in_progress' | 'done' = 'open') =>
  ({ id, title, assigneeId, status, budgetItemId: null, createdBy: 'org', completedAt: null }) as unknown as NonNullable<Pact['tasks']>[number];
const payout = (status: PactPayout['status'], amount: number, budgetItemId: string | null = null, requestedBy = 'org'): PactPayout =>
  ({ id: `${status}${amount}`, kind: 'vendor', amount, fee: 50, accountName: 'ABC Events', bankName: 'GTB', last4: '6780', purpose: 'Hotel', budgetItemId, status, requestedBy, decidedBy: null, hasReceipt: false, failureReason: null, createdAt: new Date().toISOString(), completedAt: null }) as PactPayout;

function pact(over: Partial<Pact> = {}, me = 'org'): Pact {
  const members = ['org', 'a', 'b'].map((userId) => ({ userId, role: userId === 'org' ? 'organizer' : 'member', status: 'joined', contributed: 100_000, participation: 'both', color: '#000' }));
  return {
    id: 'p', slug: 'p', title: 'Trip', category: 'trip', target: 300_000, raised: 300_000, poolBalance: 300_000, deadline: day(10), createdAt: day(-20), organizerId: 'org',
    members, status: 'funded', mode: 'goal', completedAt: null, budget: [], tasks: [], payouts: [], pendingPhoneInvites: 0,
    viewer: { role: userId(me), status: 'joined', suggestedShare: 0 },
    ...over,
  } as unknown as Pact;
}
const userId = (me: string) => (me === 'org' ? 'organizer' : 'member');

describe('funded is not finished', () => {
  it('A: reaching the target is funded and ready, and the Pact stays Active', () => {
    const p = pact();
    assert.equal(summarize(p).isFunded, true);
    assert.equal(isOutcomeComplete(p), false);
    assert.equal(phaseOf(p), 'ready');
    assert.equal(lifecycleOf(p), 'active');
    assert.equal(cardStatus(p, '10 days left').line, 'Funded · Ready to use');
    assert.equal(stageOf(p, 'org'), 'ready');
  });

  it('completing the outcome is what moves a Pact to Completed (and an old released Pact still counts)', () => {
    assert.equal(lifecycleOf(pact({ completedAt: new Date().toISOString() })), 'completed');
    assert.equal(phaseOf(pact({ completedAt: new Date().toISOString() })), 'completed');
    assert.equal(lifecycleOf(pact({ status: 'released' })), 'completed', 'released before completion existed');
    assert.equal(lifecycleOf(pact({ status: 'cancelled' })), 'closed');
    assert.equal(phaseOf(pact({ status: 'open', raised: 0, poolBalance: 0 })), 'planning');
    assert.equal(phaseOf(pact({ status: 'open', raised: 50_000 })), 'funding');
  });

  it('paying or finishing a task makes it Making it happen', () => {
    assert.equal(phaseOf(pact({ payouts: [payout('pending', 100_000)] })), 'in_progress');
    assert.equal(phaseOf(pact({ tasks: [task('1', 'Book', 'a', 'done')] })), 'in_progress');
    assert.equal(cardStatus(pact({ payouts: [payout('succeeded', 100_000)] }), '').line, 'Making it happen');
    assert.equal(phaseOf(pact({ payouts: [payout('failed', 100_000)] })), 'ready', 'a failed payment did not start anything');
  });

  it('the money reads as raised = used + left, and release is only what was left', () => {
    const p = pact({ payouts: [payout('succeeded', 100_000)], poolBalance: 300_000 - 100_050 });
    const m = moneyOf(p);
    assert.equal(m.raised, 300_000);
    assert.equal(m.used, 100_050, 'fee counts as used');
    assert.equal(m.left, 199_950);
    assert.equal(m.used + m.left, m.raised);
    const done = moneyOf(pact({ status: 'released', completedAt: new Date().toISOString(), payouts: [payout('succeeded', 100_000)], poolBalance: 0 }));
    assert.equal(done.released, 199_950, 'what moved to the wallet, never the raised total');
    assert.equal(done.left, 0);
  });

  it('B/C/D/E: budget line states follow what the bank has confirmed', () => {
    assert.equal(lineState(line('1', 'Hotel', 200_000)), 'not_paid');
    assert.equal(lineState(line('1', 'Hotel', 200_000, 100_000)), 'partly_paid');
    assert.equal(lineLeftToPay(line('1', 'Hotel', 200_000, 100_000)), 100_000);
    assert.equal(lineState(line('1', 'Hotel', 200_000, 200_000)), 'paid');
    assert.equal(lineState(line('1', 'Hotel', 200_000, 0, 200_000)), 'sending', 'on its way is not paid');
    assert.equal(lineState(line('1', 'Hotel', 200_000, 0, 200_000, 200_000)), 'waiting', 'waiting for approval is not paid');
    assert.equal(lineState(line('1', 'Hotel', 200_000, 0, 0)), 'not_paid', 'a failed payment leaves the line unpaid');
    assert.equal(lineLeftToPay(line('1', 'Hotel', 200_000, 0, 200_000)), 0, 'nothing to pay twice');
  });

  it('progress and the next line to pay', () => {
    const p = pact({ budget: [line('1', 'Hotel', 200_000, 200_000), line('2', 'Bus', 140_000, 50_000), line('3', 'Food', 90_000), line('4', 'Spare', 50_000, 0, 50_000)], tasks: [task('1', 'A', 'a', 'done'), task('2', 'B', null)] });
    assert.deepEqual(progressOf(p), { lines: { done: 1, total: 4 }, tasks: { done: 1, total: 2 } });
    assert.equal(nextLineToPay(p)?.name, 'Food', 'unpaid before partly paid, and a line on its way is skipped');
    assert.equal(looksHandled(p), false);
    assert.equal(looksHandled(pact({ budget: [line('1', 'Hotel', 200_000, 200_000)], tasks: [task('1', 'A', 'a', 'done')] })), true);
    assert.equal(looksHandled(pact({ budget: [line('1', 'Hotel', 200_000, 200_000)], payouts: [payout('awaiting_approval', 1)] })), false, 'a payment in flight is not handled');
    assert.equal(paymentsInFlight(pact({ payouts: [payout('awaiting_approval', 1), payout('succeeded', 2)] })).length, 1);
  });
});

describe('execution guidance after funding', () => {
  const step = (p: Pact, me = 'org') => nextStepFor(p, me);

  it('newly funded organiser: the money is ready, use it', () => {
    const none = step(pact());
    assert.equal(none?.title, 'The money is ready. Start paying for the plan.');
    assert.equal(none?.action?.label, 'Use Pact funds');
    assert.equal(none?.action?.kind, 'pay');
    const planned = step(pact({ budget: [line('1', 'Hotel', 200_000), line('2', 'Bus', 100_000)] }));
    assert.equal(planned?.action?.label, 'Pay Hotel');
    assert.equal(planned?.action?.lineId, '1');
  });

  it('an unpaid line, then several handled, then the next one', () => {
    const first = step(pact({ budget: [line('1', 'Hotel', 200_000, 0), line('2', 'Bus', 100_000, 0)], tasks: [task('1', 'Book', 'a', 'done')] }));
    assert.equal(first?.title, 'Hotel still needs to be paid.');
    assert.equal(first?.action?.label, 'Pay Hotel');
    const many = step(pact({ budget: [line('1', 'Hotel', 200_000, 200_000), line('2', 'Bus', 100_000, 100_000), line('3', 'Food', 90_000), line('4', 'Spare', 50_000)], payouts: [payout('succeeded', 200_000, '1')] }));
    assert.equal(many?.title, '2 of 4 planned costs are handled.');
    assert.equal(many?.action?.label, 'Pay the next one');
  });

  it('tasks stay meaningful: yours to finish, or one nobody has', () => {
    const mine = step(pact({ budget: [line('1', 'Hotel', 200_000, 200_000)], tasks: [task('1', 'Pick up decorations', 'org')], payouts: [payout('succeeded', 200_000, '1')] }));
    assert.equal(mine?.action?.kind, 'done');
    const open = attentionFor(pact({ budget: [line('1', 'Hotel', 200_000, 200_000)], tasks: [task('1', 'Pick up decorations', null)], payouts: [payout('succeeded', 200_000, '1')] }), 'a');
    assert.equal(open.find((i) => i.key.startsWith('claim'))?.action?.label, 'I’ll do it');
  });

  it('everything handled: the organiser completes; nobody is asked to contribute', () => {
    const all = step(pact({ budget: [line('1', 'Hotel', 200_000, 200_000)], tasks: [task('1', 'A', 'a', 'done')], payouts: [payout('succeeded', 200_000, '1')] }));
    assert.equal(all?.title, 'Everything looks handled.');
    assert.equal(all?.action?.kind, 'complete');
    for (const who of ['org', 'a']) {
      const kinds = attentionFor(pact({ budget: [line('1', 'Hotel', 200_000)] }), who).map((i) => i.action?.kind);
      assert.ok(!kinds.includes('contribute'), 'the target is met');
    }
  });

  it('a payment waiting on approval blocks completing and is explained', () => {
    const waiting = pact({ budget: [line('1', 'Hotel', 200_000, 0, 200_000, 200_000)], payouts: [payout('awaiting_approval', 200_000, '1', 'org')] });
    const items = attentionFor(waiting, 'org');
    assert.ok(!items.some((i) => i.action?.kind === 'complete'));
    assert.equal(items[0].key, 'in-flight');
    const co = { ...waiting, members: waiting.members.map((m) => (m.userId === 'a' ? { ...m, role: 'co_organizer' } : m)), viewer: { role: 'co_organizer', status: 'joined', suggestedShare: 0 } } as Pact;
    assert.equal(attentionFor(co, 'a')[0].key, 'approve', 'the approver is asked');
  });

  it('members can see progress but are never given organiser actions', () => {
    const items = attentionFor(pact({ budget: [line('1', 'Hotel', 200_000)] }), 'a');
    assert.ok(!items.some((i) => i.action?.kind === 'pay' || i.action?.kind === 'complete'));
  });

  it('a completed Pact has no execution guidance', () => {
    assert.deepEqual(attentionFor(pact({ completedAt: new Date().toISOString() }), 'org'), []);
  });
});

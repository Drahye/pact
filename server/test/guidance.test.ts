/**
 * Goal guidance: the Next step is always the first useful prompt, in the agreed order, and it stays out of the way
 * once a Pact is complete. Pure functions, so these run on fixtures.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pact } from '../../src/data/types.js';
import { setFixedClock } from '../../src/lib/clock.js';
import { attentionFor, checkpointsFor, nextStepFor } from '../../src/lib/plan.js';

// The website pins "today"; the app (and these tests) use the real clock.
setFixedClock(false);
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
type M = { userId: string; participation?: 'money' | 'task' | 'both' | 'later' | null; contributed?: number; status?: 'joined' | 'invited'; requestedAmount?: number };

function pact(opts: { me: M; others?: M[]; target?: number; raised?: number; deadline?: number; tasks?: Pact['tasks']; organizer?: string; status?: Pact['status']; phone?: number }): Pact {
  const members = [opts.me, ...(opts.others ?? [])].map((m) => ({ role: m.userId === (opts.organizer ?? 'org') ? 'organizer' : 'member', status: 'joined', contributed: 0, participation: null, color: '#000', ...m })) as unknown as Pact['members'];
  return {
    id: 'p', slug: 'p', title: 'Test', category: 'trip', target: opts.target ?? 500_000, raised: opts.raised ?? 0, deadline: day(opts.deadline ?? 30), createdAt: day(-1),
    organizerId: opts.organizer ?? 'org', members, status: opts.status ?? 'open', mode: 'goal', tasks: opts.tasks ?? [], pendingPhoneInvites: opts.phone ?? 0,
    viewer: { role: opts.me.userId === (opts.organizer ?? 'org') ? 'organizer' : 'member', status: 'joined', suggestedShare: 0 },
  } as unknown as Pact;
}
const task = (id: string, title: string, assigneeId: string | null = null, status: 'open' | 'in_progress' | 'done' = 'open') => ({ id, title, assigneeId, status, budgetItemId: null, createdBy: 'org', completedAt: null }) as unknown as NonNullable<Pact['tasks']>[number];
const label = (p: Pact, me: string) => nextStepFor(p, me)?.action?.label;

describe('goal guidance', () => {
  it('A: a brand new organiser is told to bring people in, and the checkpoint says to invite', () => {
    const p = pact({ me: { userId: 'org', participation: 'both' } });
    assert.equal(nextStepFor(p, 'org')?.title, 'Bring your people in.');
    assert.equal(label(p, 'org'), 'Invite people');
    const rows = checkpointsFor(p);
    assert.deepEqual(rows.map((r) => [r.text, r.done]), [['Pact created', true], ['Invite people', false], ['₦0 of ₦500,000 funded', false]]);
  });

  it('A: even with tasks on the list, a lone organiser is told to invite first', () => {
    const p = pact({ me: { userId: 'org', participation: 'both' }, tasks: [task('1', 'Order the cake')] });
    assert.equal(nextStepFor(p, 'org')?.title, 'Bring your people in.');
    const invited = pact({ me: { userId: 'org', participation: 'both' }, tasks: [task('1', 'Order the cake')], phone: 2 });
    assert.equal(nextStepFor(invited, 'org')?.title, '2 people haven’t joined yet.');
  });

  it('B: an invitee who has not chosen is asked how they are showing up, before anything else', () => {
    const p = pact({ me: { userId: 'me', participation: null }, others: [{ userId: 'org', participation: 'both' }], tasks: [task('1', 'Book the hotel')] });
    assert.equal(label(p, 'me'), 'Choose how you’ll help');
  });

  it('C: someone taking tasks is pointed at a task, not at money', () => {
    const p = pact({ me: { userId: 'me', participation: 'task' }, others: [{ userId: 'org', participation: 'both' }], tasks: [task('1', 'Book the hotel')] });
    assert.equal(label(p, 'me'), 'I’ll do it');
    assert.match(nextStepFor(p, 'me')!.title, /Book the hotel/);
    const mine = pact({ me: { userId: 'me', participation: 'task' }, others: [{ userId: 'org', participation: 'both' }], tasks: [task('1', 'Order the cake', 'me', 'in_progress')] });
    assert.equal(label(mine, 'me'), 'Mark done');
  });

  it('D: someone contributing money who has not paid is asked for their share', () => {
    const p = pact({ me: { userId: 'me', participation: 'money' }, others: [{ userId: 'org', participation: 'both' }] });
    assert.equal(label(p, 'me'), 'Add your share');
    assert.equal(nextStepFor(pact({ me: { userId: 'me', participation: 'money', requestedAmount: 40_000 }, others: [{ userId: 'org', participation: 'both' }] }), 'me')?.action?.amount, 40_000);
  });

  it('E: above 80 percent the step is Cover the rest, and it beats the deadline prompt', () => {
    const p = pact({ me: { userId: 'me', participation: 'money', contributed: 50_000 }, others: [{ userId: 'org', participation: 'both' }], raised: 420_000, deadline: 2 });
    const n = nextStepFor(p, 'me')!;
    assert.equal(n.action?.label, 'Cover the rest');
    assert.equal(n.action?.amount, 80_000);
  });

  it('F: an organiser whose group is in but idle gets a momentum prompt; people still to join come first', () => {
    const idle = pact({ me: { userId: 'org', participation: 'both' }, others: [{ userId: 'a', participation: 'money' }, { userId: 'b', participation: 'task' }, { userId: 'c', participation: 'money' }] });
    assert.equal(nextStepFor(idle, 'org')?.title, 'Everyone’s in. Start moving the plan.');
    const waiting = pact({ me: { userId: 'org', participation: 'both' }, others: [{ userId: 'a', participation: 'money' }, { userId: 'b', participation: 'task' }], phone: 3 });
    assert.equal(nextStepFor(waiting, 'org')?.title, '3 people haven’t joined yet.');
    assert.deepEqual(checkpointsFor(waiting).map((r) => r.text).slice(0, 4), ['Pact created', 'People invited', '3 of 6 joined', '3 of 3 have chosen how they’re taking part']);
  });

  it('F: undecided members and unclaimed tasks show up as stalls for the organiser', () => {
    const p = pact({ me: { userId: 'org', participation: 'both' }, others: [{ userId: 'a', participation: null }, { userId: 'b', participation: 'later' }, { userId: 'c', participation: null }], tasks: [task('1', 'Book flights'), task('2', 'Choose stay')], raised: 10_000 });
    const keys = attentionFor(p, 'org').map((i) => i.key);
    assert.ok(keys.includes('undecided'));
    assert.equal(attentionFor(p, 'org').find((i) => i.key.startsWith('claim'))?.title, '2 tasks still need someone.');
    // Unclaimed tasks come before the stall about participation.
    assert.ok(keys.findIndex((k) => k.startsWith('claim')) < keys.indexOf('undecided'));
  });

  it('F: a close deadline with a short goal asks the organiser to split the rest, others to add', () => {
    const org = pact({ me: { userId: 'org', participation: 'both', contributed: 10_000 }, others: [{ userId: 'a', participation: 'money', contributed: 10_000 }], raised: 200_000, deadline: 2 });
    assert.equal(label(org, 'org'), 'Split the rest');
    const member = pact({ me: { userId: 'a', participation: 'money', contributed: 10_000 }, others: [{ userId: 'org', participation: 'both', contributed: 10_000 }], raised: 200_000, deadline: 2 });
    assert.equal(label(member, 'a'), 'Add to the Pact');
  });

  it('G: a released or closed Pact has no next step and no checkpoint (a funded one has execution guidance: see execution-ui.test.ts)', () => {
    for (const status of ['released', 'cancelled', 'refunded'] as const) {
      const p = pact({ me: { userId: 'org', participation: 'both' }, status });
      assert.equal(nextStepFor(p, 'org'), null);
      assert.deepEqual(checkpointsFor(p), []);
    }
  });

  it('orders Pacts keep their own flow: no money prompts', () => {
    const p = { ...pact({ me: { userId: 'me', participation: 'money' }, others: [{ userId: 'org', participation: 'both' }] }), mode: 'orders' } as Pact;
    assert.equal(nextStepFor(p, 'me'), null);
  });

  it('checkpoint rows only appear when they apply', () => {
    const p = pact({ me: { userId: 'org', participation: 'both', contributed: 100_000 }, others: [{ userId: 'a', participation: 'money', contributed: 220_000 }], raised: 320_000, tasks: [task('1', 'A', 'a', 'done'), task('2', 'B', 'a', 'open')] });
    const texts = checkpointsFor(p).map((r) => r.text);
    assert.ok(texts.includes('2 of 2 joined'));
    assert.ok(texts.includes('2 of 2 have chosen how they’re taking part'));
    assert.ok(texts.includes('1 of 2 tasks done'));
    assert.ok(!checkpointsFor(pact({ me: { userId: 'org', participation: 'both' } })).some((r) => /task/.test(r.text)));
  });
});

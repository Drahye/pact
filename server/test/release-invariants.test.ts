/**
 * Release QA: invariants asserted against the database rather than the API, after a spread of real flows.
 * Split accounting, analytics event names vs the table constraint, and identity uniqueness.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { EVENT_NAMES } from '../src/lib/events.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type U = Awaited<ReturnType<T['signIn']>>;

describe('release invariants', () => {
  let t: T;
  let ana: U, ben: U, cleo: U, dan: U, eve: U;
  let circleId: string;
  const tok = (u: U) => u.accessToken;
  const people = (...us: U[]) => us.map((u) => ({ userId: u.user.id }));

  before(async () => {
    t = await setup({ env: { CREATE_LIMIT_PER_10_MIN: '1000' } });
    ana = await t.signIn('08036660001', { firstName: 'Ana', lastName: 'Payer', pin: '2468' });
    ben = await t.signIn('08036660002', { firstName: 'Ben', lastName: 'Owes', pin: '2468' });
    cleo = await t.signIn('08036660003', { firstName: 'Cleo', lastName: 'Owes', pin: '2468' });
    dan = await t.signIn('08036660004', { firstName: 'Dan', lastName: 'Owes', pin: '2468' });
    eve = await t.signIn('08036660005', { firstName: 'Eve', lastName: 'Owes', pin: '2468' });
    circleId = (await t.call('POST', '/circles', tok(ana), { name: 'QA', emoji: '🧪' })).body.data.id;
    const link = (await t.call('POST', `/circles/${circleId}/invites`, tok(ana), {})).body.data.invite.token;
    for (const u of [ben, cleo, dan, eve]) await t.call('POST', `/circle-invites/${link}/join`, tok(u), {});
  });
  after(async () => t.close());

  it('Split accounting holds in the database for every shape of split, through settle and undo', async () => {
    const mk = async (u: U, body: Record<string, unknown>) => (await t.call('POST', `/circles/${circleId}/splits`, tok(u), body)).body.data;
    const equalIn = await mk(ana, { title: 'Equal, payer in', total: 100_001_00, participants: people(ana, ben, cleo, dan) });
    const equalOut = await mk(ana, { title: 'Equal, payer out', total: 99_999_99, participants: people(ben, cleo, dan) });
    const custom = await mk(ana, { title: 'Custom', total: 60_000_00, mode: 'custom', participants: [{ userId: ana.user.id, amount: 20_000_00 }, { userId: ben.user.id, amount: 25_000_00 }, { userId: cleo.user.id, amount: 15_000_00 }] });
    const other = await mk(ana, { title: 'Someone else paid', total: 7_000_01, paidBy: eve.user.id, participants: people(ben, cleo, eve) });
    const partial = await mk(ana, { title: 'Partial', total: 30_000_00, participants: people(ben, cleo, dan) });
    const full = await mk(ana, { title: 'Full', total: 30_000_00, participants: people(ben, cleo, dan) });
    const undone = await mk(ana, { title: 'Undone', total: 30_000_00, participants: people(ben, cleo) });
    const set = (id: string, who: U, settled: boolean) => t.call('PUT', `/splits/${id}/shares/${who.user.id}`, tok(who), { settled });
    await set(partial.id, ben, true);
    for (const u of [ben, cleo, dan]) await set(full.id, u, true);
    await set(undone.id, ben, true);
    await set(undone.id, cleo, true);
    await set(undone.id, cleo, false);
    for (const s of [equalIn, equalOut, custom, other, partial, full, undone]) assert.ok(s?.id, `split created: ${JSON.stringify(s)?.slice(0, 80)}`);

    const sum = await t.db.query(`SELECT s.title FROM splits s JOIN split_shares sh ON sh.split_id = s.id GROUP BY s.id HAVING SUM(sh.amount) <> MAX(s.total_amount)`);
    assert.deepEqual(sum.rows, [], 'allocations always add up to the total');
    const payerRows = await t.db.query(`SELECT s.title FROM splits s JOIN split_shares sh ON sh.split_id = s.id AND sh.user_id = s.paid_by WHERE sh.status <> 'not_applicable' OR sh.settled_at IS NOT NULL OR sh.settled_by IS NOT NULL`);
    assert.deepEqual(payerRows.rows, [], 'a payer never owes self and never has a faked settlement');
    const nonPayerNA = await t.db.query(`SELECT 1 FROM splits s JOIN split_shares sh ON sh.split_id = s.id WHERE sh.user_id <> s.paid_by AND sh.status = 'not_applicable'`);
    assert.equal(nonPayerNA.rowCount, 0, 'everyone else owes the payer');
    const derived = await t.db.query(`
      SELECT s.title, s.status,
             COUNT(*) FILTER (WHERE sh.user_id <> s.paid_by AND sh.status = 'owed')::int AS owed,
             COUNT(*) FILTER (WHERE sh.user_id <> s.paid_by AND sh.status = 'settled')::int AS settled
        FROM splits s LEFT JOIN split_shares sh ON sh.split_id = s.id WHERE s.status <> 'cancelled' GROUP BY s.id`);
    for (const r of derived.rows as { title: string; status: string; owed: number; settled: number }[]) {
      assert.equal(r.status, r.owed === 0 && r.settled > 0 ? 'settled' : 'open', `${r.title}: status follows the shares`);
    }
    const byTitle = Object.fromEntries((derived.rows as { title: string; status: string }[]).map((r) => [r.title, r.status]));
    assert.deepEqual([byTitle['Partial'], byTitle['Full'], byTitle['Undone']], ['open', 'settled', 'open']);
    const nonPayers = await t.db.query(`SELECT COUNT(*)::int AS n FROM split_shares sh JOIN splits s ON s.id = sh.split_id WHERE s.title = 'Equal, payer in' AND sh.user_id <> s.paid_by`);
    assert.equal(nonPayers.rows[0].n, 3, 'the denominator is the people who owe, plus the payer share only in the total');
    const nobodyTyped = await t.db.query(`SELECT 1 FROM split_shares sh LEFT JOIN users u ON u.id = sh.user_id WHERE u.id IS NULL`);
    assert.equal(nobodyTyped.rowCount, 0, 'no free-text debtors: every share row is a real user');
  });

  it('every analytics event name the app can emit passes the table constraint', async () => {
    for (const name of EVENT_NAMES) {
      await t.db.query(`INSERT INTO product_events (name, props) VALUES ($1, '{}')`, [name]).catch((e: Error) => {
        assert.fail(`${name}: ${e.message}`);
      });
    }
  });

  it('an identity subject can belong to one account only, enforced by the database', async () => {
    await t.db.query(`INSERT INTO user_identities (user_id, provider, provider_subject, email, verified_at) VALUES ($1, 'stytch', 'user-test-dup', 'dup@example.com', now())`, [ana.user.id]);
    await assert.rejects(t.db.query(`INSERT INTO user_identities (user_id, provider, provider_subject, email, verified_at) VALUES ($1, 'stytch', 'user-test-dup', 'dup@example.com', now())`, [ben.user.id]), /unique|duplicate/i);
    await assert.rejects(t.db.query(`INSERT INTO users (phone, first_name, last_name, color, tint, referral_code) VALUES ($1, 'X', 'Y', '#fff', 'sky', 'ZZZZZZZ')`, [(await t.db.query('SELECT phone FROM users WHERE id = $1', [ana.user.id])).rows[0].phone]), /unique|duplicate/i);
  });
});

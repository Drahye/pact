/**
 * Product events: the funnel can be read from them, and they hold nothing private.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { EVENT_NAMES, EVENT_PROPS, personId, track } from '../src/lib/events.js';
import { syncProductEvents } from '../src/modules/events.js';
import { setup, lagosDay } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
const day = (days: number) => lagosDay(days);

describe('product events', () => {
  let t: T;
  before(async () => {
    t = await setup();
  });
  after(async () => {
    await t.close();
  });

  const counts = async () => {
    const r = await t.db.query<{ name: string; n: number }>('SELECT name, COUNT(*)::int AS n FROM product_events GROUP BY name');
    return Object.fromEntries(r.rows.map((x) => [x.name, x.n]));
  };

  it('records the whole funnel for a Pact, once each, and nothing private', async () => {
    const org = await t.signIn('08031110001', { firstName: 'Ola', lastName: 'Organiser', pin: '2468' });
    const friend = await t.signIn('08031110002', { firstName: 'Femi', lastName: 'Friend', pin: '2468' });
    const created = await t.call('POST', '/pacts', org.accessToken, {
      title: 'Kribi trip',
      category: 'trip',
      target: 10_000_00,
      deadline: day(20),
      tasks: [{ title: 'Book the flights' }],
      invitePhones: ['08031110099'],
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const pact = created.body.data.pact;

    // Two previews from the same visitor on the same day count once.
    assert.equal((await t.call('GET', `/invites/${pact.inviteCode}`)).status, 200);
    assert.equal((await t.call('GET', `/invites/${pact.inviteCode}`)).status, 200);

    assert.equal((await t.call('POST', `/invites/${pact.inviteCode}/join`, friend.accessToken, { participation: 'both' })).status, 200);
    await t.topUp(friend.accessToken, 10_000);
    const pay = await t.call('POST', `/pacts/${pact.id}/contributions`, friend.accessToken, { amount: 10_000_00, pin: '2468' });
    assert.equal(pay.status, 200, JSON.stringify(pay.body));
    const task = (await t.call('GET', `/pacts/${pact.id}`, friend.accessToken)).body.data.pact.tasks[0];
    assert.equal((await t.call('PATCH', `/pacts/${pact.id}/tasks/${task.id}`, friend.accessToken, { assigneeId: 'me' })).status, 200);
    assert.equal((await t.call('PATCH', `/pacts/${pact.id}/tasks/${task.id}`, friend.accessToken, { status: 'done' })).status, 200);
    assert.equal((await t.call('PUT', `/pacts/${pact.id}/memory`, org.accessToken, { note: 'Best weekend, nobody chased anybody.' })).status, 200);
    // A second Pact from the organiser; and the friend, who joined the first, starts one too.
    assert.equal((await t.call('POST', '/pacts', org.accessToken, { title: 'Second', category: 'gift', target: 5_000_00, deadline: day(10) })).status, 200);
    assert.equal((await t.call('POST', '/pacts', friend.accessToken, { title: 'Femi’s own', category: 'dinner', target: 5_000_00, deadline: day(10) })).status, 200);

    await syncProductEvents(t.ctx);
    await syncProductEvents(t.ctx); // idempotent
    const c = await counts();
    assert.deepEqual(
      { ...c },
      {
        signup_completed: 2,
        pact_created: 3,
        second_pact_created: 1,
        invite_created: 1,
        invite_previewed: 1,
        pact_joined: 1,
        participation_selected: 1,
        contribution_completed: 1,
        task_claimed: 1,
        task_completed: 1,
        pact_funded: 1,
        memory_added: 1,
      },
    );

    // The friend was a participant before creating a Pact; the organiser was not.
    const created3 = await t.db.query<{ actor: string; props: { was_participant?: boolean } }>(`SELECT actor, props FROM product_events WHERE name = 'pact_created'`);
    const friendPseudo = personId(t.ctx.config, friend.user.id);
    assert.equal(created3.rows.find((r) => r.actor === friendPseudo && r.props.was_participant)?.props.was_participant, true);
    assert.equal(created3.rows.filter((r) => r.props.was_participant).length, 1);

    // Nothing private: no ids, phone numbers, names, amounts or message text anywhere in the table.
    const dump = JSON.stringify((await t.db.query('SELECT * FROM product_events')).rows);
    for (const secret of [org.user.id, friend.user.id, pact.id, '0803111', '803111', 'Ola', 'Femi', 'Kribi', 'chased', '1000000', 'pin']) {
      assert.ok(!dump.includes(secret), `product_events must not contain ${secret}`);
    }
    // Every event has a timestamp and only allow-listed props.
    const all = await t.db.query<{ name: keyof typeof EVENT_PROPS; occurred_at: Date; props: Record<string, unknown> }>('SELECT name, occurred_at, props FROM product_events');
    for (const e of all.rows) {
      assert.ok(e.occurred_at);
      for (const k of Object.keys(e.props)) assert.ok(k in EVENT_PROPS[e.name], `${e.name} has unexpected prop ${k}`);
    }
  });

  it('drops anything not on the allow-list, and refuses unknown events', async () => {
    await track(t.db, t.ctx.config, 'pact_created', { props: { category: 'trip', pin: '1234', bvn: '22222222222', note: 'hello', category_x: 'y', tasks: 3.4 } });
    const r = await t.db.query<{ props: Record<string, unknown> }>(`SELECT props FROM product_events WHERE name = 'pact_created' ORDER BY id DESC LIMIT 1`);
    assert.deepEqual(r.rows[0].props, { category: 'trip', tasks: 3 });
    // Unknown names never reach the table (and never throw).
    await track(t.db, t.ctx.config, 'pin_entered' as never, {});
    assert.equal((await t.db.query(`SELECT 1 FROM product_events WHERE name = 'pin_entered'`)).rowCount, 0);
    assert.equal(EVENT_NAMES.length, 20);
  });

  it('is invisible to the restricted app role', async () => {
    if (t.db.driver !== 'pglite') return;
    await assert.rejects(t.db.asUser((await t.signIn('08031110001')).user.id, (q) => q.query('SELECT * FROM product_events')));
  });
});

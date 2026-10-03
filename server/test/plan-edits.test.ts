/**
 * Plans, edit rules and the RSVP access model: what changes after people have answered, what a link visitor can see and do,
 * closing RSVPs, and why a Plan never rewrites the Pact made from it.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addDays, lagosToday } from '../src/lib/time.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type U = Awaited<ReturnType<T['signIn']>>;

describe('Plan edits and RSVP access', () => {
  let t: T;
  let ana: U, ben: U, dan: U, eve: U;
  let circleId: string;
  const tok = (u: U) => u.accessToken;
  const day = (n: number) => addDays(lagosToday(new Date()), n);
  const code = (r: { body: { error?: { code?: string }; code?: string } }) => r.body.error?.code ?? r.body.code;
  const make = async (body: Record<string, unknown>) => (await t.call('POST', `/circles/${circleId}/plans`, tok(ana), body)).body.data as { id: string; shareToken: string };

  before(async () => {
    t = await setup();
    ana = await t.signIn('08037770001', { firstName: 'Ana', lastName: 'Organiser', pin: '2468' });
    ben = await t.signIn('08037770002', { firstName: 'Ben', lastName: 'Member', pin: '2468' });
    dan = await t.signIn('08037770003', { firstName: 'Dan', lastName: 'Visitor', pin: '2468' });
    eve = await t.signIn('08037770004', { firstName: 'Eve', lastName: 'Another', pin: '2468' });
    circleId = (await t.call('POST', '/circles', tok(ana), { name: 'The Boys', emoji: '🍻' })).body.data.id;
    const link = (await t.call('POST', `/circles/${circleId}/invites`, tok(ana), {})).body.data.invite.token;
    await t.call('POST', `/circle-invites/${link}/join`, tok(ben), {});
  });
  after(async () => t.close());

  it('a change of date or place after people answered needs a yes, is remembered, and tells them', async () => {
    const p = await make({ title: 'Ghana', date: day(30), location: 'Accra' });
    assert.equal((await t.call('PATCH', `/plans/${p.id}`, tok(ana), { date: day(31) })).status, 200, 'nobody else answered: a quiet edit goes through');
    await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ben), { status: 'in' });
    const ask = await t.call('PATCH', `/plans/${p.id}`, tok(ana), { date: day(35) });
    assert.equal(ask.status, 409);
    assert.equal(code(ask), 'confirm_needed');
    assert.equal((await t.call('GET', `/plans/${p.id}`, tok(ana))).body.data.date, day(31), 'nothing changed');
    assert.equal((await t.call('PATCH', `/plans/${p.id}`, tok(ana), { title: 'Ghana trip', roughBudget: 500_000_00 })).status, 200, 'a rename or budget is not important');
    const ok = await t.call('PATCH', `/plans/${p.id}`, tok(ana), { date: day(35), location: 'Kumasi', confirm: true });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.data.activity.slice(0, 2).map((a: { kind: string }) => a.kind).sort(), ['date_changed', 'location_changed']);
    assert.deepEqual(ok.body.data.activity.filter((a: { kind: string }) => a.kind === 'date_changed' || a.kind === 'location_changed').length, 2, 'the early quiet edit and the rename left no trace');
    assert.ok((await t.call('GET', '/notifications', tok(ben))).body.items.some((n: { type: string }) => n.type === 'plan_changed'), 'people who are in are told');
    assert.equal((await t.call('PATCH', `/plans/${p.id}`, tok(ana), { confirm: true })).status, 400, 'confirm alone is not a change');
    const solo = await make({ title: 'Solo', date: day(20) });
    await t.call('POST', `/plans/${solo.id}/status`, tok(ana), { status: 'confirmed' });
    assert.equal(code(await t.call('PATCH', `/plans/${solo.id}`, tok(ana), { location: 'Lekki' })), 'confirm_needed', 'a confirmed plan always asks');
    assert.equal((await t.call('PATCH', `/plans/${solo.id}`, tok(ana), { location: 'Lekki', confirm: true })).status, 200);
  });

  it('closing RSVPs stops new and changed answers, keeps the old ones, and is the organiser\'s alone', async () => {
    const p = await make({ title: 'Brunch', date: day(10) });
    await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ben), { status: 'in' });
    assert.equal((await t.call('PUT', `/plans/${p.id}/rsvp-open`, tok(ben), { open: false })).status, 403);
    assert.equal((await t.call('PUT', `/plans/${p.id}/rsvp-open`, tok(ana), { open: false })).body.data.rsvpOpen, false);
    assert.equal(code(await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ben), { status: 'out' })), 'rsvps_closed');
    assert.equal(code(await t.call('PUT', `/plan-links/${p.shareToken}/rsvp`, tok(dan), { status: 'in' })), 'rsvps_closed');
    const view = await t.call('GET', `/plans/${p.id}`, tok(ben));
    assert.deepEqual([view.body.data.mine, view.body.data.counts.in], ['in', 2], 'answers given stay');
    assert.equal((await t.call('GET', `/plan-links/${p.shareToken}`)).body.data.rsvpOpen, false);
    assert.equal((await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ana), { status: 'maybe' })).body.data.mine, 'maybe', 'the organiser can still answer for themselves');
    assert.equal(code(await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ben), { status: 'maybe' })), 'rsvps_closed');
    await t.call('PUT', `/plans/${p.id}/rsvp-open`, tok(ana), { open: true });
    assert.equal((await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ben), { status: 'maybe' })).status, 200);
  });

  it('a link visitor sees totals, never names; answering shows first names of who is in; none of it makes them a member', async () => {
    const p = await make({ title: 'Ghana', date: day(40), location: 'Accra', roughBudget: 650_000_00 });
    await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ben), { status: 'in' });
    await t.call('POST', `/plans/${p.id}/tasks`, tok(ana), { title: 'Secret hotel task' });
    const pub = await t.call('GET', `/plan-links/${p.shareToken}`);
    assert.deepEqual([pub.body.data.counts.in, pub.body.data.rsvps, pub.body.data.tasks, pub.body.data.roughBudget, pub.body.data.activity], [2, [], [], null, []]);
    assert.deepEqual(pub.body.people.map((x: { firstName: string; lastName: string }) => [x.firstName, x.lastName]), [['Ana', '']], 'only the organiser\'s first name');
    const before = await t.call('GET', `/plan-links/${p.shareToken}/mine`, tok(dan));
    assert.deepEqual([before.body.data.plan.rsvps, before.body.data.plan.isMember, before.body.data.plan.tasks], [[], false, []], 'signed in but not answered: totals only');
    const r = await t.call('PUT', `/plan-links/${p.shareToken}/rsvp`, tok(dan), { status: 'in' });
    assert.equal(r.status, 200);
    const after = r.body.data.plan;
    assert.deepEqual([after.counts.in, after.mine, after.isMember, after.roughBudget, after.tasks.length], [3, 'in', false, null, 0]);
    assert.equal(after.rsvps.length, 3);
    assert.ok(after.rsvps.some((x: { userId: string }) => x.userId === dan.user.id), 'their own answer is theirs');
    assert.ok(!after.rsvps.some((x: { userId: string }) => x.userId === ana.user.id || x.userId === ben.user.id), 'other people are aliases, not account ids');
    assert.deepEqual(r.body.people.map((x: { firstName: string }) => x.firstName).sort(), ['Ana', 'Ben', 'Dan']);
    assert.ok(r.body.people.every((x: { lastName: string }) => x.lastName === ''), 'first names only');
    assert.equal((await t.call('GET', `/plans/${p.id}`, tok(dan))).status, 404, 'the full plan stays closed');
    assert.equal((await t.call('GET', `/circles/${circleId}`, tok(dan))).status, 404, 'so does the Circle');
    assert.equal((await t.call('PUT', `/plans/${p.id}/rsvp`, tok(dan), { status: 'out' })).status, 404, 'the member route is not a side door');
    assert.equal((await t.call('PATCH', `/plans/${p.id}`, tok(dan), { title: 'Mine' })).status, 404);
    assert.equal((await t.call('PUT', `/plan-links/${p.shareToken}/rsvp`, tok(dan), { status: 'maybe' })).body.data.plan.mine, 'maybe', 'they can change their own answer');
    await t.call('POST', `/plans/${p.id}/status`, tok(ana), { status: 'cancelled' });
    assert.equal(code(await t.call('PUT', `/plan-links/${p.shareToken}/rsvp`, tok(eve), { status: 'in' })), 'plan_closed');
  });

  it('once it is a Pact the plan cannot be cancelled, and editing the plan leaves the Pact alone', async () => {
    const p = await make({ title: 'Wedding gift', category: 'gift', date: day(30), roughBudget: 100_000_00 });
    await t.call('POST', `/plans/${p.id}/tasks`, tok(ana), { title: 'Choose gift' });
    const made = await t.call('POST', '/pacts', tok(ana), { title: 'Wedding gift', category: 'gift', deadline: day(28), target: 100_000_00, tasks: [{ title: 'Choose gift' }], planId: p.id });
    assert.equal(made.status, 200);
    const pactId = made.body.data.pact.id;
    const row = async () => (await t.db.query('SELECT * FROM pacts WHERE id = $1', [pactId])).rows[0];
    const was = await row();
    assert.equal((await t.call('PATCH', `/plans/${p.id}`, tok(ana), { title: 'Wedding gift (changed)', roughBudget: 999_000_00, date: day(33), confirm: true })).status, 200);
    await t.call('POST', `/plans/${p.id}/tasks`, tok(ana), { title: 'Another task' });
    assert.deepEqual(await row(), was, 'the Pact\'s terms did not move');
    const c = await t.call('POST', `/plans/${p.id}/status`, tok(ana), { status: 'cancelled' });
    assert.equal(c.status, 409);
    assert.equal(code(c), 'plan_has_pact');
    // Once it is a Pact, the action is in the Pact: Home does not keep asking members to RSVP to the Plan.
    assert.ok(!(await t.call('GET', '/home', tok(ben))).body.data.needsYou.some((n: { sourceId: string }) => n.sourceId === p.id), 'no RSVP card for a converted Plan');
    assert.equal((await t.call('GET', `/plans/${p.id}`, tok(ana))).body.data.status, 'planning');
  });
});

describe('Plan lifecycle corrections', () => {
  let t: T;
  let ana: U, ben: U, dan: U;
  let circleId: string;
  const tok = (u: U) => u.accessToken;
  const day = (n: number) => addDays(lagosToday(new Date()), n);
  const code = (r: { body: { error?: { code?: string }; code?: string } }) => r.body.error?.code ?? r.body.code;
  const kinds = async (id: string, u: U) => (await t.call('GET', `/plans/${id}`, tok(u))).body.data.activity.map((a: { kind: string }) => a.kind);

  before(async () => {
    t = await setup();
    ana = await t.signIn('08036660001', { firstName: 'Ana', lastName: 'Organiser', pin: '2468' });
    ben = await t.signIn('08036660002', { firstName: 'Ben', lastName: 'Member', pin: '2468' });
    dan = await t.signIn('08036660003', { firstName: 'Dan', lastName: 'Visitor', pin: '2468' });
    circleId = (await t.call('POST', '/circles', tok(ana), { name: 'The Boys', emoji: '🍻' })).body.data.id;
    const link = (await t.call('POST', `/circles/${circleId}/invites`, tok(ana), {})).body.data.invite.token;
    await t.call('POST', `/circle-invites/${link}/join`, tok(ben), {});
  });
  after(async () => t.close());

  it('date and place edits are silent until someone else engages, then they are recorded', async () => {
    const p = (await t.call('POST', `/circles/${circleId}/plans`, tok(ana), { title: 'Ghana', date: day(30), location: 'Accra' })).body.data;
    for (const n of [31, 32, 33]) assert.equal((await t.call('PATCH', `/plans/${p.id}`, tok(ana), { date: day(n) })).status, 200);
    await t.call('PATCH', `/plans/${p.id}`, tok(ana), { location: 'Kumasi' });
    const quiet = (await t.call('GET', `/plans/${p.id}`, tok(ana))).body.data;
    assert.equal(quiet.date, day(33), 'the last date is saved');
    assert.ok(!(await kinds(p.id, ana)).some((k: string) => k.endsWith('_changed') && k !== 'rsvp_changed'), 'and nothing was recorded');
    await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ben), { status: 'in' });
    const r = await t.call('PATCH', `/plans/${p.id}`, tok(ana), { date: day(35), confirm: true });
    assert.equal(r.body.data.date, day(35));
    assert.equal((await kinds(p.id, ana)).filter((k: string) => k === 'date_changed').length, 1);
    // A task handed to someone also counts as engagement.
    const q = (await t.call('POST', `/circles/${circleId}/plans`, tok(ana), { title: 'Dinner', date: day(12) })).body.data;
    await t.call('POST', `/plans/${q.id}/tasks`, tok(ana), { title: 'Book', assigneeId: ben.user.id });
    await t.call('PATCH', `/plans/${q.id}`, tok(ana), { date: day(13) });
    assert.equal((await kinds(q.id, ana)).filter((k: string) => k === 'date_changed').length, 1);
  });

  it('closed RSVPs: members and link visitors are turned away, the organiser still answers, reopening restores everyone', async () => {
    const p = (await t.call('POST', `/circles/${circleId}/plans`, tok(ana), { title: 'Brunch', date: day(10) })).body.data;
    await t.call('PUT', `/plans/${p.id}/rsvp-open`, tok(ana), { open: false });
    assert.equal(code(await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ben), { status: 'in' })), 'rsvps_closed');
    assert.equal(code(await t.call('PUT', `/plan-links/${p.shareToken}/rsvp`, tok(dan), { status: 'in' })), 'rsvps_closed');
    assert.equal((await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ana), { status: 'out' })).body.data.mine, 'out');
    await t.call('PUT', `/plans/${p.id}/rsvp-open`, tok(ana), { open: true });
    assert.equal((await t.call('PUT', `/plans/${p.id}/rsvp`, tok(ben), { status: 'in' })).status, 200);
    assert.equal((await t.call('PUT', `/plan-links/${p.shareToken}/rsvp`, tok(dan), { status: 'maybe' })).status, 200);
  });

  it('a Plan with a Pact cannot be marked done by hand; completing the Pact completes the Plan once', async () => {
    const p = (await t.call('POST', `/circles/${circleId}/plans`, tok(ana), { title: 'Gift', category: 'gift', date: day(30) })).body.data;
    const made = await t.call('POST', '/pacts', tok(ana), { title: 'Gift', category: 'gift', deadline: day(28), target: 50_000_00, planId: p.id });
    assert.equal(made.status, 200);
    const pactId = made.body.data.pact.id;
    const manual = await t.call('POST', `/plans/${p.id}/status`, tok(ana), { status: 'done' });
    assert.equal(manual.status, 400);
    assert.equal(code(manual), 'plan_completes_via_pact');
    assert.equal((await t.call('GET', `/plans/${p.id}`, tok(ana))).body.data.status, 'planning');
    // Fund the Pact, then complete it through the ordinary flow.
    await t.db.query(`UPDATE pacts SET status = 'funded', funded_at = now() WHERE id = $1`, [pactId]);
    const done = await t.call('POST', `/pacts/${pactId}/complete`, tok(ana), {});
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const view = (await t.call('GET', `/plans/${p.id}`, tok(ana))).body.data;
    assert.equal(view.status, 'done');
    assert.equal(view.activity.filter((a: { kind: string }) => a.kind === 'done').length, 1, 'one line, not three');
    // Retrying the lifecycle step changes nothing.
    const { completeFromPact } = await import('../src/modules/plans.js');
    await completeFromPact(t.db, pactId, ana.user.id);
    assert.equal((await kinds(p.id, ana)).filter((k: string) => k === 'done').length, 1);
    assert.equal((await t.call('POST', `/plans/${p.id}/status`, tok(ana), { status: 'cancelled' })).status, 409);
  });
});

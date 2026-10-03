/**
 * Plans: the light layer between an idea and a Pact. Creating and editing, RSVPs (members and link visitors), tasks, linked
 * questions, status, what Home and the Circles list surface, and the key moment: turning a Plan into exactly one Pact.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { planPseudo } from '../src/lib/events.js';
import { addDays, lagosToday } from '../src/lib/time.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type U = Awaited<ReturnType<T['signIn']>>;

describe('Plans', () => {
  let t: T;
  let ana: U, ben: U, cleo: U, dan: U;
  let circleId: string;
  let plan: { id: string; token: string };
  const tok = (u: U) => u.accessToken;
  const day = (n: number) => addDays(lagosToday(new Date()), n);
  const err = (r: { body: { error?: { code?: string } ; code?: string } }) => r.body.error?.code ?? r.body.code;

  before(async () => {
    t = await setup();
    ana = await t.signIn('08038880001', { firstName: 'Ana', lastName: 'Organiser', pin: '2468' });
    ben = await t.signIn('08038880002', { firstName: 'Ben', lastName: 'Member', pin: '2468' });
    cleo = await t.signIn('08038880003', { firstName: 'Cleo', lastName: 'Outsider', pin: '2468' });
    dan = await t.signIn('08038880004', { firstName: 'Dan', lastName: 'Visitor', pin: '2468' });
    circleId = (await t.call('POST', '/circles', tok(ana), { name: 'The Boys', emoji: '🍻' })).body.data.id;
    const link = (await t.call('POST', `/circles/${circleId}/invites`, tok(ana), {})).body.data.invite.token;
    await t.call('POST', `/circle-invites/${link}/join`, tok(ben), {});
  });
  after(async () => t.close());

  const create = (u: U, cid: string, body: Record<string, unknown>) => t.call('POST', `/circles/${cid}/plans`, tok(u), body);

  it('creates a plan with only a title, or with everything, and refuses bad ones', async () => {
    const bare = await create(ana, circleId, { title: 'Beach Day' });
    assert.equal(bare.status, 200);
    assert.deepEqual([bare.body.data.status, bare.body.data.date, bare.body.data.location, bare.body.data.roughBudget, bare.body.data.counts], ['planning', null, null, null, { in: 1, maybe: 0, out: 0 }]);
    assert.equal(bare.body.data.mine, 'in', 'the person who made it is in');
    const full = await create(ana, circleId, { title: ' Ghana in December 🇬🇭 ', category: 'trip', date: day(30), endDate: day(34), location: 'Accra', roughBudget: 650_000_00, description: 'Sun and food' });
    assert.equal(full.status, 200);
    assert.deepEqual([full.body.data.title, full.body.data.category, full.body.data.location, full.body.data.roughBudget, full.body.data.canEdit, full.body.data.canMakePact], ['Ghana in December 🇬🇭', 'trip', 'Accra', 650_000_00, true, true]);
    assert.ok(full.body.data.shareToken.length >= 32);
    plan = { id: full.body.data.id, token: full.body.data.shareToken };
    assert.equal((await create(ana, circleId, { title: '' })).status, 400);
    assert.equal((await create(ana, circleId, { title: 'x', date: day(5), endDate: day(2) })).status, 400, 'end before start');
    assert.equal((await create(ana, circleId, { title: 'x', endDate: day(2) })).status, 400, 'an end with no start');
    assert.equal((await create(ana, circleId, { title: 'x', date: day(-3) })).status, 400, 'a date that has passed');
    assert.equal((await create(ana, circleId, { title: 'x', category: 'rave' })).status, 400);
    assert.equal((await create(ana, circleId, { title: '<b>x</b>' })).status, 400);
    assert.equal((await create(cleo, circleId, { title: 'Sneaky' })).status, 404, 'not in the Circle');
    assert.equal((await t.call('POST', `/circles/${circleId}/plans`, undefined, { title: 'x' })).status, 401);
  });

  it('only Circle members can read a plan; guessed ids look like nothing', async () => {
    assert.equal((await t.call('GET', `/plans/${plan.id}`, tok(cleo))).status, 404);
    assert.equal((await t.call('GET', `/circles/${circleId}/plans`, tok(cleo))).status, 404);
    assert.equal((await t.call('PUT', `/plans/${plan.id}/rsvp`, tok(cleo), { status: 'in' })).status, 404, 'the id route is for members only');
    assert.equal((await t.call('PATCH', `/plans/${plan.id}`, tok(cleo), { title: 'Mine' })).status, 404);
    assert.equal((await t.call('POST', `/plans/${plan.id}/tasks`, tok(cleo), { title: 'x' })).status, 404);
    assert.equal((await t.call('GET', '/plans/00000000-0000-0000-0000-000000000000', tok(ana))).status, 404);
    assert.equal((await t.call('GET', '/plans/nope', tok(ana))).status, 404);
    assert.equal((await t.call('GET', `/plans/${plan.id}`)).status, 401);
    if (t.db.driver === 'pglite') {
      const rows = await t.db.asUser(cleo.user.id, (q) => q.query('SELECT * FROM plans'));
      assert.equal(rows.rowCount, 0, 'row-level security hides plans from non-members');
    }
  });

  it('members RSVP in, maybe or can\'t, change it, and see who has not answered', async () => {
    const r = await t.call('PUT', `/plans/${plan.id}/rsvp`, tok(ben), { status: 'maybe' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.data.mine, r.body.data.counts, r.body.data.waiting], ['maybe', { in: 1, maybe: 1, out: 0 }, []]);
    await t.call('PUT', `/plans/${plan.id}/rsvp`, tok(ben), { status: 'maybe' });
    const c = await t.call('PUT', `/plans/${plan.id}/rsvp`, tok(ben), { status: 'in' });
    assert.deepEqual(c.body.data.counts, { in: 2, maybe: 0, out: 0 }, 'changing is not answering twice');
    assert.deepEqual(c.body.data.activity.slice(0, 2).map((a: { kind: string }) => a.kind), ['rsvp_changed', 'rsvp']);
    assert.equal((await t.call('PUT', `/plans/${plan.id}/rsvp`, tok(ben), { status: 'yes' })).status, 400);
    assert.equal((await t.call('PUT', `/plans/${plan.id}/rsvp`, tok(ben), {})).status, 400);
  });

  it('only the person who made it edits it', async () => {
    const r = await t.call('PATCH', `/plans/${plan.id}`, tok(ana), { location: 'Accra, Ghana', roughBudget: 700_000_00, description: null, confirm: true });
    assert.deepEqual([r.status, r.body.data.location, r.body.data.roughBudget, r.body.data.description], [200, 'Accra, Ghana', 700_000_00, null]);
    assert.equal((await t.call('PATCH', `/plans/${plan.id}`, tok(ben), { title: 'Hijacked' })).status, 403);
    assert.equal((await t.call('PATCH', `/plans/${plan.id}`, tok(ana), {})).status, 400);
    assert.equal((await t.call('PATCH', `/plans/${plan.id}`, tok(ana), { date: day(40), endDate: day(35), confirm: true })).status, 400);
    assert.equal((await t.call('POST', `/plans/${plan.id}/status`, tok(ben), { status: 'confirmed' })).status, 403);
  });

  it('tasks: anyone adds, takes an open one, finishes their own; only the organiser assigns others', async () => {
    const a = await t.call('POST', `/plans/${plan.id}/tasks`, tok(ana), { title: 'Pick hotel' });
    assert.equal(a.status, 200);
    const hotel = a.body.data.tasks[0].id;
    const b = await t.call('POST', `/plans/${plan.id}/tasks`, tok(ben), { title: 'Book transport' });
    const transport = b.body.data.tasks.find((x: { title: string }) => x.title === 'Book transport').id;
    assert.equal((await t.call('POST', `/plans/${plan.id}/tasks`, tok(ben), { title: 'Not yours', assigneeId: ana.user.id })).status, 403, 'only the organiser hands tasks to others');
    assert.equal((await t.call('POST', `/plans/${plan.id}/tasks`, tok(ben), { title: 'Mine', assigneeId: ben.user.id })).status, 200);
    assert.equal((await t.call('POST', `/plans/${plan.id}/tasks`, tok(ana), { title: 'Stranger', assigneeId: cleo.user.id })).status, 400, 'only people in the Circle');
    const claim = await t.call('PATCH', `/plans/${plan.id}/tasks/${hotel}`, tok(ben), { assigneeId: ben.user.id });
    assert.equal(claim.body.data.tasks.find((x: { id: string }) => x.id === hotel).assigneeId, ben.user.id);
    assert.equal((await t.call('PATCH', `/plans/${plan.id}/tasks/${hotel}`, tok(ana), { assigneeId: ana.user.id })).status, 200, 'the organiser can reassign');
    assert.equal((await t.call('PATCH', `/plans/${plan.id}/tasks/${hotel}`, tok(ben), { status: 'done' })).status, 403, 'not his any more');
    assert.equal((await t.call('PATCH', `/plans/${plan.id}/tasks/${hotel}`, tok(ben), { assigneeId: ben.user.id })).status, 403, 'cannot take what is taken');
    await t.call('PATCH', `/plans/${plan.id}/tasks/${transport}`, tok(ben), { assigneeId: ben.user.id });
    const done = await t.call('PATCH', `/plans/${plan.id}/tasks/${transport}`, tok(ben), { status: 'done' });
    const task = done.body.data.tasks.find((x: { id: string }) => x.id === transport);
    assert.deepEqual([task.status, !!task.completedAt], ['done', true]);
    assert.ok(done.body.data.activity.some((x: { kind: string; detail: string }) => x.kind === 'task_done' && x.detail === 'Book transport'));
    assert.equal((await t.call('DELETE', `/plans/${plan.id}/tasks/${transport}`, tok(cleo))).status, 404);
    assert.equal((await t.call('DELETE', `/plans/${plan.id}/tasks/${hotel}`, tok(ben))).status, 403, 'not his task, not his plan');
    assert.equal((await t.call('POST', `/plans/${plan.id}/tasks`, tok(ana), { title: 'Confirm dates', assigneeId: ben.user.id })).status, 200);
    const note = await t.call('GET', '/notifications', tok(ben));
    assert.ok(note.body.items.some((n: { type: string }) => n.type === 'plan_task'), 'being given a task is noted');
  });

  it('questions are linked, never copied: created from a plan, or linked after', async () => {
    const q1 = await t.call('POST', `/circles/${circleId}/asks`, tok(ana), { type: 'choice', title: 'Where should we stay?', options: ['Labadi', 'Osu'], planId: plan.id });
    assert.equal(q1.status, 200);
    assert.equal(q1.body.data.planId, plan.id);
    const loose = (await t.call('POST', `/circles/${circleId}/asks`, tok(ben), { type: 'attendance', title: 'Which date?' })).body.data;
    assert.equal(loose.planId, null);
    assert.equal((await t.call('POST', `/plans/${plan.id}/asks`, tok(ana), { askId: loose.id })).status, 200, 'the organiser can link any question');
    const p = (await t.call('GET', `/plans/${plan.id}`, tok(ben))).body.data;
    assert.deepEqual(p.asks.map((a: { title: string }) => a.title).sort(), ['Where should we stay?', 'Which date?']);
    assert.equal(p.undecided, 2);
    await t.call('PUT', `/asks/${q1.body.data.id}/response`, tok(ben), { optionId: q1.body.data.options[0].id });
    await t.call('POST', `/asks/${q1.body.data.id}/close`, tok(ana), {});
    const after = (await t.call('GET', `/plans/${plan.id}`, tok(ana))).body.data;
    assert.deepEqual([after.undecided, after.decisions], [1, 1], 'a closed question is a decision made');
    assert.match(after.asks.find((a: { title: string }) => a.title === 'Where should we stay?').headline, /Labadi won/);
    assert.equal((await t.call('POST', `/plans/${plan.id}/asks`, tok(ben), { askId: q1.body.data.id })).status, 403, 'someone else\'s question');
    const other = (await t.call('POST', '/circles', tok(cleo), { name: 'Elsewhere', emoji: '🏠' })).body.data.id;
    const foreign = (await t.call('POST', `/circles/${other}/asks`, tok(cleo), { type: 'attendance', title: 'Foreign' })).body.data;
    assert.equal((await t.call('POST', `/plans/${plan.id}/asks`, tok(ana), { askId: foreign.id })).status, 404, 'a question from another Circle');
    assert.equal((await t.call('POST', `/circles/${circleId}/asks`, tok(ana), { type: 'attendance', title: 'Wrong plan', planId: '00000000-0000-0000-0000-000000000000' })).status, 404);
    assert.equal((await t.call('DELETE', `/plans/${plan.id}/asks/${loose.id}`, tok(ben))).status, 200, 'its author can unlink it');
    assert.equal((await t.call('GET', `/asks/${loose.id}`, tok(ben))).body.data.planId, null);
  });

  it('the public link previews safely and takes RSVPs from signed-in people', async () => {
    const p = await t.call('GET', `/plan-links/${plan.token}`);
    assert.equal(p.status, 200);
    const d = p.body.data;
    assert.deepEqual([d.title, d.location, d.circle.name, d.isMember, d.shareToken, d.counts.in], ['Ghana in December 🇬🇭', 'Accra, Ghana', 'The Boys', false, null, 2]);
    assert.deepEqual([d.tasks, d.asks, d.activity, d.waiting, d.roughBudget], [[], [], [], [], null], 'no tasks, questions, activity or budget for visitors');
    const dump = JSON.stringify(p.body);
    assert.ok(!/"lastName":"[^"]/.test(dump) && !/Pick hotel|Book transport|0803888/.test(dump), 'no last names, tasks or numbers');
    assert.equal((await t.call('GET', '/plan-links/short')).status, 404);
    assert.equal((await t.call('GET', `/plan-links/${'A'.repeat(43)}`)).status, 404);
    assert.equal((await t.call('PUT', `/plan-links/${plan.token}/rsvp`, undefined, { status: 'in' })).status, 401);
    const mine = await t.call('GET', `/plan-links/${plan.token}/mine`, tok(dan));
    assert.deepEqual([mine.body.data.plan.isMember, mine.body.data.plan.mine, mine.body.data.canJoinCircle], [false, null, true]);
    const r = await t.call('PUT', `/plan-links/${plan.token}/rsvp`, tok(dan), { status: 'in', afterAuth: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.plan.mine, 'in');
    assert.equal(r.body.data.plan.counts.in, 3);
    assert.deepEqual(r.body.data.plan.tasks, [], 'still no tasks for someone outside the Circle');
    assert.equal((await t.call('GET', `/circles/${circleId}`, tok(dan))).status, 404, 'RSVPing did not make him a member');
    assert.equal((await t.call('GET', `/plans/${plan.id}`, tok(dan))).status, 404);
    const j = await t.call('POST', `/plan-links/${plan.token}/join-circle`, tok(dan), {});
    assert.equal(j.status, 200);
    assert.equal((await t.call('GET', `/plans/${plan.id}`, tok(dan))).status, 200, 'now a member, and his RSVP is kept');
    assert.equal((await t.call('POST', `/plan-links/${plan.token}/shared`, tok(dan), { via: 'copy' })).status, 200);
  });

  it('a turned-off link says so and reveals nothing', async () => {
    const r = await t.call('POST', `/plans/${plan.id}/share/reset`, tok(ana), {});
    assert.notEqual(r.body.data.shareToken, plan.token);
    const old = await t.call('GET', `/plan-links/${plan.token}`);
    assert.equal(old.status, 410);
    assert.equal(err(old), 'plan_link_off');
    assert.ok(!JSON.stringify(old.body).includes('Ghana'));
    assert.equal((await t.call('POST', `/plans/${plan.id}/share/reset`, tok(ben), {})).status, 403);
    plan.token = r.body.data.shareToken;
  });

  it('Home and the Circles list surface what needs people', async () => {
    const soon = (await create(ana, circleId, { title: 'Beach Sunday', date: day(2) })).body.data;
    const needs = await t.call('GET', '/plans/needs-you', tok(cleo));
    assert.equal(needs.body.data.length, 0, 'nothing in Circles she is not in');
    const mine = (await t.call('GET', '/plans/needs-you', tok(ben))).body.data;
    assert.ok(mine.some((n: { planId: string; kind: string; text: string }) => n.planId === soon.id && n.kind === 'rsvp' && n.text === 'Are you coming?'), 'an RSVP is asked for');
    await t.call('PUT', `/plans/${soon.id}/rsvp`, tok(ben), { status: 'in' });
    const after = (await t.call('GET', '/plans/needs-you', tok(ben))).body.data;
    assert.ok(!after.some((n: { planId: string; kind: string }) => n.planId === soon.id && n.kind === 'rsvp'), 'answered, so no longer asked');
    assert.ok(after.some((n: { planId: string; kind: string; text: string }) => n.planId === soon.id && n.kind === 'soon' && /Starts/.test(n.text)), 'and it is timely');
    const own = (await t.call('GET', '/plans/needs-you', tok(ana))).body.data;
    assert.ok(!own.some((n: { kind: string }) => n.kind === 'rsvp'), 'you are never asked about your own plan');
    const list = await t.call('GET', '/circles', tok(dan));
    const live = list.body.data.find((c: { id: string }) => c.id === circleId).live;
    assert.ok(live && /are you coming\?|in/.test(live.text), `live signal: ${live?.text}`);
    const inCircle = await t.call('GET', `/circles/${circleId}/plans`, tok(ben));
    assert.ok(inCircle.body.data.length >= 3 && inCircle.body.data.every((p: { status: string }) => p.status !== 'cancelled'));
  });

  it('status: confirm tells the people who are in; finished and cancelled plans stop taking RSVPs', async () => {
    const side = (await create(ana, circleId, { title: 'Dinner Friday', date: day(9) })).body.data;
    await t.call('PUT', `/plans/${side.id}/rsvp`, tok(ben), { status: 'in' });
    const c = await t.call('POST', `/plans/${side.id}/status`, tok(ana), { status: 'confirmed' });
    assert.equal(c.body.data.status, 'confirmed');
    const note = await t.call('GET', '/notifications', tok(ben));
    assert.ok(note.body.items.some((n: { type: string }) => n.type === 'plan_confirmed'), 'Ben is told');
    assert.ok(!(await t.call('GET', '/notifications', tok(dan))).body.items.some((n: { type: string; title: string }) => n.type === 'plan_confirmed' && n.title.includes('Dinner')), 'people who did not RSVP are not');
    assert.equal((await t.call('POST', `/plans/${side.id}/status`, tok(ana), { status: 'planning' })).body.data.status, 'planning', 'can go back');
    assert.equal((await t.call('POST', `/plans/${side.id}/status`, tok(ana), { status: 'cancelled' })).body.data.status, 'cancelled');
    const late = await t.call('PUT', `/plans/${side.id}/rsvp`, tok(ben), { status: 'out' });
    assert.equal(late.status, 409);
    assert.equal((await t.call('POST', `/plans/${side.id}/status`, tok(ana), { status: 'confirmed' })).status, 409, 'cancelled is final');
    assert.equal((await t.call('PATCH', `/plans/${side.id}`, tok(ana), { title: 'Nope' })).status, 409);
    assert.equal((await t.call('POST', `/plans/${side.id}/tasks`, tok(ana), { title: 'Nope' })).status, 409);
    assert.equal((await t.call('GET', `/plans/${side.id}/pact-draft`, tok(ana))).status, 409, 'a cancelled plan cannot become a Pact');
    assert.ok(!(await t.call('GET', `/circles/${circleId}/plans`, tok(ben))).body.data.some((p: { id: string }) => p.id === side.id), 'cancelled plans leave the list');
  });

  it('Make it a Pact: a draft for review, then exactly one Pact, and the plan stays', async () => {
    const draft = await t.call('GET', `/plans/${plan.id}/pact-draft`, tok(ana));
    assert.equal(draft.status, 200);
    const d = draft.body;
    assert.deepEqual([d.title, d.category, d.circleId, d.target, d.deadline], ['Ghana in December 🇬🇭', 'trip', circleId, 700_000_00, day(28)]);
    assert.deepEqual(d.tasks.sort(), ['Confirm dates', 'Mine', 'Pick hotel'], 'open tasks carry across, finished ones do not');
    assert.deepEqual(d.inviteUserIds.sort(), [ben.user.id, dan.user.id].sort(), 'people who are in or maybe, not the organiser');
    assert.equal((await t.call('GET', `/plans/${plan.id}/pact-draft`, tok(ben))).status, 403, 'only the organiser');
    assert.equal((await t.call('GET', `/plans/${plan.id}/pact-draft`, tok(cleo))).status, 404);
    // Nothing exists yet.
    assert.equal((await t.call('GET', `/plans/${plan.id}`, tok(ana))).body.data.pactId, null);
    const body = { title: d.title, category: d.category, deadline: d.deadline, target: d.target, tasks: d.tasks.map((x: string) => ({ title: x })), inviteUserIds: d.inviteUserIds, planId: plan.id };
    assert.equal((await t.call('POST', '/pacts', tok(ben), body)).status, 403, 'someone else\'s plan');
    assert.equal((await t.call('POST', '/pacts', tok(cleo), body)).status, 404);
    const made = await t.call('POST', '/pacts', tok(ana), body);
    assert.equal(made.status, 200);
    const pact = made.body.data.pact;
    assert.deepEqual([pact.circleId, pact.members.filter((m: { status: string }) => m.status === 'invited').length, pact.tasks.length], [circleId, 2, 3], 'Circle, invitees and tasks came across');
    const again = await t.call('POST', '/pacts', tok(ana), body);
    assert.equal(again.status, 409, 'one Pact per plan');
    assert.equal(err(again), 'plan_already_pact');
    assert.equal((await t.call('GET', `/plans/${plan.id}/pact-draft`, tok(ana))).status, 409);
    const p = (await t.call('GET', `/plans/${plan.id}`, tok(ben))).body.data;
    assert.deepEqual([p.pactId, p.canMakePact, p.status, p.rsvps.length > 0, p.tasks.length > 0], [pact.id, false, 'planning', true, true], 'the plan stays, with its history');
    assert.equal(p.activity[0].kind, 'pact');
    const open = await t.call('GET', `/pacts/${pact.id}`, tok(ben));
    assert.equal(open.status, 200, 'and the Pact is an ordinary Pact');
    assert.equal(open.body.data.pact.circleId, circleId);
    const note = await t.call('GET', '/notifications', tok(dan));
    assert.ok(note.body.items.some((n: { type: string }) => n.type === 'plan_pact'), 'people who were in are told');
    assert.equal((await t.call('GET', '/pacts', tok(ana))).status, 200);
  });

  it('a Pact without a plan, or in a Circle without one, works exactly as before', async () => {
    const solo = await t.call('POST', '/pacts', tok(ana), { title: 'Standalone', category: 'gift', deadline: day(20), target: 50_000_00 });
    assert.equal(solo.status, 200);
    assert.equal(solo.body.data.pact.circleId, null);
    assert.equal((await t.call('POST', '/pacts', tok(ana), { title: 'Bad plan', category: 'gift', deadline: day(20), target: 50_000_00, planId: 'not-a-uuid' })).status, 400);
    // Invites by id now reach Circle mates, not only people from earlier Pacts.
    const mates = await t.call('POST', '/pacts', tok(ana), { title: 'With Ben', category: 'gift', deadline: day(20), target: 50_000_00, inviteUserIds: [ben.user.id] });
    assert.equal(mates.status, 200);
    const stranger = await t.call('POST', '/pacts', tok(ana), { title: 'With Cleo', category: 'gift', deadline: day(20), target: 50_000_00, inviteUserIds: [cleo.user.id] });
    assert.equal(stranger.status, 400, 'people you share nothing with still need a phone number');
  });

  it('records the plan\'s whole path as one funnel, and nothing private', async () => {
    const key = planPseudo(t.ctx.config, plan.id);
    const rows = await t.db.query<{ name: string; props: Record<string, unknown>; pact: string | null }>(`SELECT name, props, pact FROM product_events WHERE plan = $1 ORDER BY id`, [key]);
    const names = rows.rows.map((r) => r.name);
    for (const n of ['plan_created', 'plan_opened', 'plan_rsvp_submitted', 'plan_rsvp_changed', 'plan_task_created', 'plan_task_completed', 'plan_ask_linked', 'plan_conversion_started', 'plan_converted_to_pact', 'plan_shared']) assert.ok(names.includes(n), `${n} is on the path`);
    const dump = JSON.stringify(rows.rows);
    assert.ok(!/Ghana|Accra|Pick hotel|Book transport|Where should|700000|650000|Ana|Ben|Dan/.test(dump) && !dump.includes(plan.id) && !dump.includes(plan.token), 'no title, place, task text, amounts, names, ids or tokens');
    assert.deepEqual(rows.rows.find((r) => r.name === 'plan_created')!.props, { category: 'trip', has_date: true, has_location: true, has_budget: true });
    const conv = rows.rows.find((r) => r.name === 'plan_converted_to_pact')!;
    assert.ok(conv.pact, 'the conversion carries the Pact\'s pseudonym, so Plan and Pact can be followed as one');
    assert.deepEqual(conv.props, { tasks: 3, invitees: 2, has_budget: true });
    const via = rows.rows.filter((r) => r.name === 'plan_ask_linked').map((r) => r.props.via).sort();
    assert.deepEqual(via, ['create', 'link']);
    assert.equal((await t.call('POST', `/plans/${plan.id}/shared`, tok(ana), { via: 'native' })).status, 200);
    assert.equal((await t.call('POST', `/plans/${plan.id}/shared`, tok(cleo), { via: 'copy' })).status, 404);
    assert.equal((await t.call('GET', `/plans/${plan.id}?from=home`, tok(ana))).status, 200);
  });
});

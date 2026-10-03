/**
 * Home V2: one request that says what needs me, my Circles in one line each, what is coming up, what just happened, and what we
 * finished. Plus Recaps: derived from the finished object, shared only on purpose, revocable, and safe when public.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { planPseudo } from '../src/lib/events.js';
import { addDays, lagosToday } from '../src/lib/time.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type U = Awaited<ReturnType<T['signIn']>>;

describe('Home', () => {
  let t: T;
  let ana: U, ben: U, cleo: U, newbie: U, outsider: U;
  let circleId: string;
  const tok = (u: U) => u.accessToken;
  const day = (n: number) => addDays(lagosToday(new Date()), n);
  const home = async (u: U) => (await t.call('GET', '/home', tok(u))).body.data;
  const code = (r: { body: { error?: { code?: string }; code?: string } }) => r.body.error?.code ?? r.body.code;

  before(async () => {
    t = await setup();
    ana = await t.signIn('08034440001', { firstName: 'Ana', lastName: 'Organiser', pin: '2468' });
    ben = await t.signIn('08034440002', { firstName: 'Ben', lastName: 'Member', pin: '2468' });
    cleo = await t.signIn('08034440003', { firstName: 'Cleo', lastName: 'Member', pin: '2468' });
    newbie = await t.signIn('08034440004', { firstName: 'Nia', lastName: 'New', pin: '2468' });
    outsider = await t.signIn('08034440005', { firstName: 'Olu', lastName: 'Outside', pin: '2468' });
    circleId = (await t.call('POST', '/circles', tok(ana), { name: 'The Boys', emoji: '🍻' })).body.data.id;
    const link = (await t.call('POST', `/circles/${circleId}/invites`, tok(ana), {})).body.data.invite.token;
    for (const u of [ben, cleo]) await t.call('POST', `/circle-invites/${link}/join`, tok(u), {});
  });
  after(async () => t.close());

  it('a brand new person is "new" with nothing in it', async () => {
    const h = await home(newbie);
    assert.deepEqual([h.state, h.needsYou, h.circles, h.comingUp, h.recent, h.recaps], ['new', [], [], [], [], []]);
    assert.equal((await t.call('GET', '/home')).status, 401);
  });

  it('everything on one Plan is one card, and it shrinks then disappears as things are done', async () => {
    const plan = (await t.call('POST', `/circles/${circleId}/plans`, tok(ana), { title: 'Ghana in December', date: day(40), location: 'Accra' })).body.data;
    await t.call('POST', `/circles/${circleId}/asks`, tok(ana), { type: 'choice', title: 'Where should we stay?', options: ['Labadi', 'Osu'], planId: plan.id });
    await t.call('POST', `/plans/${plan.id}/tasks`, tok(ana), { title: 'Pick hotel', assigneeId: ben.user.id });
    const h = await home(ben);
    const card = h.needsYou.filter((n: { sourceId: string }) => n.sourceId === plan.id);
    assert.equal(card.length, 1, 'one card for the Plan, not three');
    assert.equal(card[0].objectType, 'plan');
    assert.match(card[0].context, /3 things need you/);
    assert.deepEqual([...card[0].parts].sort(), ['1 task', 'RSVP', 'Vote'].sort());
    assert.equal(card[0].actionLabel, 'Open Plan');
    assert.match(card[0].actionUrl, new RegExp(`/app/plans/${plan.id}`));
    assert.equal(card[0].circle.name, 'The Boys');
    // Done things leave, decided by the server.
    await t.call('PUT', `/plans/${plan.id}/rsvp`, tok(ben), { status: 'in' });
    const after1 = (await home(ben)).needsYou.find((n: { sourceId: string }) => n.sourceId === plan.id);
    assert.match(after1.context, /2 things need you/);
    const tasks = (await t.call('GET', `/plans/${plan.id}`, tok(ben))).body.data.tasks;
    await t.call('PATCH', `/plans/${plan.id}/tasks/${tasks[0].id}`, tok(ben), { status: 'done' });
    const ask = (await t.call('GET', `/circles/${circleId}/asks`, tok(ben))).body.data.find((a: { planId: string }) => a.planId === plan.id);
    const opts = (await t.call('GET', `/asks/${ask.id}`, tok(ben))).body.data.options;
    await t.call('PUT', `/asks/${ask.id}/response`, tok(ben), { optionId: opts[0].id });
    assert.ok(!(await home(ben)).needsYou.some((n: { sourceId: string }) => n.sourceId === plan.id), 'nothing left to do, so no card');
    // The creator is not asked to RSVP to their own plan.
    assert.ok(!(await home(ana)).needsYou.some((n: { sourceId: string }) => n.sourceId === plan.id));
  });

  it('Split: the one who owes and the one who is owed each get one card; settled leaves', async () => {
    const s = (await t.call('POST', `/circles/${circleId}/splits`, tok(ana), { title: 'Dinner at Yellow Chilli', total: 25_000_00, participants: [{ userId: ana.user.id }, { userId: ben.user.id }, { userId: cleo.user.id }] })).body.data;
    const b = (await home(ben)).needsYou.find((n: { sourceId: string }) => n.sourceId === s.id);
    assert.deepEqual([b.type, b.objectType, b.actionLabel, b.context], ['split_debt', 'split', 'View Split', 'You still owe ₦8,333.33.']);
    const a = (await home(ana)).needsYou.find((n: { sourceId: string }) => n.sourceId === s.id);
    assert.deepEqual([a.type, a.context], ['split_collect', '2 people still need to settle.']);
    for (const u of [ben, cleo]) await t.call('PUT', `/splits/${s.id}/shares/${u.user.id}`, tok(u), { settled: true });
    for (const u of [ana, ben, cleo]) assert.ok(!(await home(u)).needsYou.some((n: { sourceId: string }) => n.sourceId === s.id), 'settled is not asking for anything');
  });

  it('Pacts: a task you took, a contribution still needed, an approval waiting; one card per Pact', async () => {
    const pact = (await t.call('POST', '/pacts', tok(ana), { title: 'Sarah’s Birthday', category: 'birthday', deadline: day(20), target: 500_000_00, tasks: [{ title: 'Order the cake' }] })).body.data.pact;
    await t.db.query(`INSERT INTO pact_members (pact_id, user_id, role, status, joined_at, participation, contributed) VALUES ($1, $2, 'member', 'joined', now(), 'both', 0)`, [pact.id, ben.user.id]);
    await t.db.query(`UPDATE tasks SET assignee_id = $2 WHERE pact_id = $1`, [pact.id, ben.user.id]);
    const c = (await home(ben)).needsYou.find((n: { sourceId: string }) => n.sourceId === pact.id);
    assert.equal(c.objectType, 'pact');
    assert.match(c.context, /2 things need you/);
    assert.equal(c.actionLabel, 'Open Pact');
    assert.equal(c.type, 'pact_task', 'a task you took leads a contribution');
    await t.db.query(`UPDATE tasks SET status = 'done' WHERE pact_id = $1`, [pact.id]);
    const c2 = (await home(ben)).needsYou.find((n: { sourceId: string }) => n.sourceId === pact.id);
    assert.deepEqual([c2.type, c2.context, c2.actionLabel], ['pact_contribution', 'Your contribution is still needed.', 'Add money']);
    await t.db.query(`UPDATE pact_members SET contributed = 1000 WHERE pact_id = $1 AND user_id = $2`, [pact.id, ben.user.id]);
    assert.ok(!(await home(ben)).needsYou.some((n: { sourceId: string }) => n.sourceId === pact.id), 'contributed: gone');
    // An approval is the top of the list.
    await t.db.query(
      `INSERT INTO pact_payouts (pact_id, reference, kind, amount, fee, bank_code, bank_name, account_number_enc, last4, account_name, purpose, status, requested_by)
       VALUES ($1, 'ref-home-1', 'vendor', 100000, 0, '058', 'GTB', 'x', '1234', 'Cake Co', 'the cake', 'awaiting_approval', $2)`,
      [pact.id, ben.user.id],
    );
    await t.db.query(`UPDATE pact_members SET role = 'organizer' WHERE pact_id = $1 AND user_id = $2`, [pact.id, ana.user.id]);
    const top = (await home(ana)).needsYou[0];
    assert.deepEqual([top.type, top.sourceId], ['pact_approval', pact.id]);
    assert.match(top.context, /needs your approval/);
  });

  it('priority is fixed rules: weight by kind, plus a bump when due within three days', async () => {
    const soonPlan = (await t.call('POST', `/circles/${circleId}/plans`, tok(cleo), { title: 'Beach tomorrow', date: day(1) })).body.data;
    const laterPlan = (await t.call('POST', `/circles/${circleId}/plans`, tok(cleo), { title: 'Next month', date: day(25) })).body.data;
    await t.call('POST', `/circles/${circleId}/splits`, tok(cleo), { title: 'Fuel', total: 6_000_00, participants: [{ userId: ben.user.id }, { userId: ana.user.id }] });
    const items = (await home(ana)).needsYou;
    const idx = (id: string) => items.findIndex((n: { sourceId: string }) => n.sourceId === id);
    assert.ok(idx(soonPlan.id) < idx(laterPlan.id), 'the plan due tomorrow outranks the one next month');
    const fuel = items.findIndex((n: { title: string }) => n.title === 'Fuel');
    assert.ok(idx(laterPlan.id) < fuel, 'an RSVP outranks a Split to settle');
    const pr = items.map((n: { priority: number }) => n.priority);
    assert.deepEqual([...pr].sort((a: number, b: number) => b - a), pr, 'sorted, highest first');
  });

  it('Circles: one signal each, something for me first; Coming up: dated Plans in order, no Pact-converted Plans; Recent: others, human, no noise', async () => {
    const h = await home(ana);
    const c = h.circles.find((x: { id: string }) => x.id === circleId);
    assert.ok(c.signal.text.length > 0 && ['needs_you', 'soon', 'plan', 'split', 'pact', 'quiet'].includes(c.signal.kind));
    assert.ok(c.memberIds.length <= 3 && c.memberCount === 3);
    const dates = h.comingUp.map((x: { date: string }) => x.date);
    assert.deepEqual([...dates].sort(), dates, 'soonest first');
    assert.ok(h.comingUp.length <= 5 && h.comingUp.every((x: { date: string }) => x.date <= day(30)), 'within 30 days');
    assert.ok(h.comingUp.some((x: { title: string }) => x.title === 'Beach tomorrow') && !h.comingUp.some((x: { title: string }) => x.title === 'Ghana in December'), 'Ghana is 40 days away');
    const texts = h.recent.map((r: { text: string }) => r.text);
    assert.ok(texts.some((x: string) => /Ben is in for Ghana in December/.test(x)), texts.join(' | '));
    assert.ok(texts.some((x: string) => /Ben settled ₦8,333\.33/.test(x)));
    assert.ok(h.recent.every((r: { actorId: string | null }) => r.actorId !== ana.user.id), 'never my own actions');
    assert.ok(h.recent.length <= 10 && !texts.some((x: string) => /token|otp|sign/i.test(x)));
    // Nothing from a Circle I'm not in.
    const o = await home(outsider);
    assert.deepEqual([o.needsYou, o.circles, o.recent, o.comingUp], [[], [], [], []]);
  });

  it('Recaps: derived from what finished, members only, and shared only on purpose', async () => {
    const plan = (await t.call('POST', `/circles/${circleId}/plans`, tok(ana), { title: 'Beach Day', date: day(2), endDate: day(4) })).body.data;
    await t.call('PUT', `/plans/${plan.id}/rsvp`, tok(ben), { status: 'in' });
    await t.call('POST', `/plans/${plan.id}/tasks`, tok(ana), { title: 'Bring towels', assigneeId: ana.user.id });
    const tid = (await t.call('GET', `/plans/${plan.id}`, tok(ana))).body.data.tasks[0].id;
    await t.call('PATCH', `/plans/${plan.id}/tasks/${tid}`, tok(ana), { status: 'done' });
    assert.equal((await t.call('GET', `/recaps/plan/${plan.id}`, tok(ana))).status, 404, 'not finished yet');
    await t.call('POST', `/plans/${plan.id}/status`, tok(ana), { status: 'done' });
    const r = await t.call('GET', `/recaps/plan/${plan.id}`, tok(ben));
    assert.equal(r.status, 200);
    assert.equal(r.body.data.headline, 'We made it happen.');
    assert.deepEqual(r.body.data.metrics.map((m: { label: string; value: string }) => `${m.value} ${m.label}`), ['2 people', '1 task', '3 days together']);
    assert.deepEqual([r.body.data.share.token, r.body.data.share.canManage], [null, false], 'Ben cannot share it');
    assert.equal((await t.call('GET', `/recaps/plan/${plan.id}`, tok(outsider))).status, 404);
    assert.ok((await home(ben)).recaps.some((x: { id: string; kind: string }) => x.id === plan.id && x.kind === 'plan'), 'it is on Home as "made it happen"');
    // Sharing: the organiser turns it on; one link; public shows no names.
    assert.equal((await t.call('POST', `/recaps/plan/${plan.id}/share`, tok(ben), {})).status, 403);
    const on = await t.call('POST', `/recaps/plan/${plan.id}/share`, tok(ana), {});
    const token = on.body.data.share.token as string;
    assert.equal(token.length, 43);
    assert.equal((await t.call('POST', `/recaps/plan/${plan.id}/share`, tok(ana), {})).body.data.share.token, token, 'idempotent: one live link');
    const pub = await t.call('GET', `/recap-links/${token}`);
    assert.equal(pub.status, 200);
    assert.deepEqual([pub.body.data.personIds, pub.body.data.share, pub.body.people], [[], null, []]);
    assert.ok(!/Ana|Ben|Cleo|0803444/.test(JSON.stringify(pub.body)), 'no names or numbers');
    assert.equal((await t.call('GET', `/recap-links/${'A'.repeat(43)}`)).status, 404);
    assert.equal((await t.call('DELETE', `/recaps/plan/${plan.id}/share`, tok(ben))).status, 403);
    await t.call('DELETE', `/recaps/plan/${plan.id}/share`, tok(ana));
    const off = await t.call('GET', `/recap-links/${token}`);
    assert.equal(off.status, 410);
    assert.equal(code(off), 'recap_link_off');
    // Split recap: the amount is for the Circle, never in the public view.
    const s = (await t.call('POST', `/circles/${circleId}/splits`, tok(ana), { title: 'Brunch', total: 9_000_00, participants: [{ userId: ben.user.id }, { userId: cleo.user.id }] })).body.data;
    for (const u of [ben, cleo]) await t.call('PUT', `/splits/${s.id}/shares/${u.user.id}`, tok(u), { settled: true });
    const sr = (await t.call('GET', `/recaps/split/${s.id}`, tok(ben))).body.data;
    assert.deepEqual([sr.headline, sr.metrics.some((m: { value: string }) => m.value === '₦9,000')], ['All settled ✓', true]);
    const st = (await t.call('POST', `/recaps/split/${s.id}/share`, tok(ana), {})).body.data.share.token;
    const spub = (await t.call('GET', `/recap-links/${st}`)).body.data;
    assert.ok(!JSON.stringify(spub).includes('9,000') && spub.metrics.length === 1, 'no money on a public split recap');
    // A completed Pact appears too.
    const pact = (await t.call('POST', '/pacts', tok(ana), { title: 'Gift', category: 'gift', deadline: day(10), target: 50_000_00 })).body.data.pact;
    await t.db.query(`UPDATE pacts SET status = 'funded', completed_at = now() WHERE id = $1`, [pact.id]);
    assert.equal((await t.call('GET', `/recaps/pact/${pact.id}`, tok(ana))).status, 200);
    assert.ok((await home(ana)).recaps.length <= 3);
    assert.equal((await t.call('GET', `/recaps/thing/${pact.id}`, tok(ana))).status, 400);
  });

  it('"finished only" is not "new"; and the analytics hold no titles, names, amounts or tokens', async () => {
    const solo = await t.signIn('08034440006', { firstName: 'Fin', lastName: 'Ished', pin: '2468' });
    const cid = (await t.call('POST', '/circles', tok(solo), { name: 'Tiny', emoji: '🌱' })).body.data.id;
    const buddy = await t.signIn('08034440007', { firstName: 'Bud', lastName: 'Dy', pin: '2468' });
    const inv = (await t.call('POST', `/circles/${cid}/invites`, tok(solo), {})).body.data.invite.token;
    await t.call('POST', `/circle-invites/${inv}/join`, tok(buddy), {});
    const s = (await t.call('POST', `/circles/${cid}/splits`, tok(solo), { title: 'Done deal', total: 4_000_00, participants: [{ userId: buddy.user.id }] })).body.data;
    await t.call('PUT', `/splits/${s.id}/shares/${buddy.user.id}`, tok(buddy), { settled: true });
    const h = await home(solo);
    assert.equal(h.state, 'finished_only');
    assert.deepEqual(h.needsYou, []);
    assert.equal(h.recaps[0].title, 'Done deal');
    await t.call('GET', `/recaps/split/${s.id}`, tok(solo));
    await t.call('POST', `/recaps/split/${s.id}/shared`, tok(solo), { via: 'native' });
    const rows = await t.db.query<{ name: string; props: Record<string, unknown> }>(`SELECT name, props FROM product_events WHERE name LIKE 'recap_%'`);
    assert.ok(rows.rows.some((r) => r.name === 'recap_viewed' && r.props.object_type === 'split'));
    assert.ok(rows.rows.some((r) => r.name === 'recap_shared' && r.props.via === 'native'));
    const dump = JSON.stringify(rows.rows);
    assert.ok(!/Done deal|Fin|Bud|4000|token/i.test(dump), 'nothing private');
    // The client's own Home events are accepted with coarse props only.
    const ev = await t.call('POST', '/me/onboarding-event', tok(solo), { name: 'home_needs_you_actioned', props: { object_type: 'split', section: 'needs_you', title: 'leak', amount: 5 } });
    assert.ok(ev.status < 300, JSON.stringify(ev.body));
    const hv = await t.db.query<{ props: Record<string, unknown> }>(`SELECT props FROM product_events WHERE name = 'home_needs_you_actioned'`);
    assert.deepEqual(hv.rows[0].props, { object_type: 'split', section: 'needs_you' });
    void planPseudo;
  });
});

/**
 * Ask the group: creating a choice and a Who's in, answering and changing answers, the share link (public preview,
 * answering from outside the Circle, joining from the Ask), closing, notifications, analytics, and isolation.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { askPseudo } from '../src/lib/events.js';
import { askPreviewText, injectOg } from '../src/lib/og.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type U = Awaited<ReturnType<T['signIn']>>;

describe('Asks', () => {
  let t: T;
  let ana: U, ben: U, cleo: U, dan: U;
  let circleId: string;
  let choice: { id: string; token: string; options: { id: string; label: string }[] };
  let who: { id: string; token: string };

  before(async () => {
    t = await setup();
    ana = await t.signIn('08036660001', { firstName: 'Ana', lastName: 'Owner', pin: '2468' });
    ben = await t.signIn('08036660002', { firstName: 'Ben', lastName: 'Member', pin: '2468' });
    cleo = await t.signIn('08036660003', { firstName: 'Cleo', lastName: 'Outsider', pin: '2468' });
    dan = await t.signIn('08036660004', { firstName: 'Dan', lastName: 'Visitor', pin: '2468' });
    circleId = (await t.call('POST', '/circles', ana.accessToken, { name: 'The Boys', emoji: '🍻' })).body.data.id;
    const link = (await t.call('POST', `/circles/${circleId}/invites`, ana.accessToken, {})).body.data.invite.token;
    await t.call('POST', `/circle-invites/${link}/join`, ben.accessToken, {});
    await t.call('POST', '/circles', cleo.accessToken, { name: 'Elsewhere', emoji: '🏠' });
  });
  after(async () => t.close());

  const tok = (u: U) => u.accessToken;
  const create = (u: U, cid: string, body: Record<string, unknown>) => t.call('POST', `/circles/${cid}/asks`, tok(u), body);

  it('creates a choice Ask and a Who\'s in, and refuses bad ones', async () => {
    const r = await create(ana, circleId, { type: 'choice', title: ' Where should we stay? ', options: ['Labadi', 'East Legon', 'Osu'] });
    assert.equal(r.status, 200);
    const d = r.body.data;
    assert.deepEqual([d.title, d.type, d.status, d.options.map((o: { label: string }) => o.label), d.isMember, d.canClose], ['Where should we stay?', 'choice', 'open', ['Labadi', 'East Legon', 'Osu'], true, true]);
    assert.ok(d.shareToken.length >= 32, 'a long random share token');
    choice = { id: d.id, token: d.shareToken, options: d.options };
    const w = await create(ana, circleId, { type: 'attendance', title: 'Beach on Sunday 🌴' });
    assert.equal(w.status, 200);
    assert.equal(w.body.data.options.length, 0);
    who = { id: w.body.data.id, token: w.body.data.shareToken };
    assert.equal((await create(ana, circleId, { type: 'choice', title: 'One option', options: ['Only'] })).status, 400, 'a choice needs at least two options');
    assert.equal((await create(ana, circleId, { type: 'choice', title: 'No options' })).status, 400);
    assert.equal((await create(ana, circleId, { type: 'choice', title: 'Seven', options: ['1', '2', '3', '4', '5', '6', '7'] })).status, 400, 'at most six');
    assert.equal((await create(ana, circleId, { type: 'choice', title: 'Same', options: ['A', 'a'] })).status, 400, 'options must differ');
    assert.equal((await create(ana, circleId, { type: 'attendance', title: 'Fixed', options: ['x', 'y'] })).status, 400, 'Who\'s in has fixed answers');
    assert.equal((await create(ana, circleId, { type: 'choice', title: '', options: ['a', 'b'] })).status, 400);
    assert.equal((await create(ana, circleId, { type: 'poll', title: 'x' })).status, 400);
  });

  it('only Circle members can create or read Asks; guessed ids look like nothing', async () => {
    assert.equal((await create(cleo, circleId, { type: 'attendance', title: 'Sneaky' })).status, 404);
    assert.equal((await t.call('GET', `/asks/${choice.id}`, tok(cleo))).status, 404);
    assert.equal((await t.call('GET', `/circles/${circleId}/asks`, tok(cleo))).status, 404);
    assert.equal((await t.call('PUT', `/asks/${choice.id}/response`, tok(cleo), { optionId: choice.options[0].id })).status, 404, 'the id route is for members only');
    assert.equal((await t.call('POST', `/asks/${choice.id}/close`, tok(cleo), {})).status, 404);
    assert.equal((await t.call('GET', '/asks/00000000-0000-0000-0000-000000000000', tok(ana))).status, 404);
    assert.equal((await t.call('GET', '/asks/not-a-uuid', tok(ana))).status, 404);
    assert.equal((await t.call('GET', `/asks/${choice.id}`)).status, 401);
    const list = await t.call('GET', `/circles/${circleId}/asks`, tok(ben));
    assert.equal(list.body.data.length, 2);
  });

  it('members vote, change their vote, and duplicates change nothing', async () => {
    const [labadi, legon] = choice.options;
    const v = await t.call('PUT', `/asks/${choice.id}/response`, tok(ben), { optionId: labadi.id });
    assert.equal(v.status, 200);
    assert.equal(v.body.data.options.find((o: { id: string }) => o.id === labadi.id).count, 1);
    assert.equal(v.body.data.mine.optionId, labadi.id);
    assert.match(v.body.data.headline, /Labadi is winning/);
    await t.call('PUT', `/asks/${choice.id}/response`, tok(ben), { optionId: labadi.id });
    const dup = await t.call('GET', `/asks/${choice.id}`, tok(ana));
    assert.equal(dup.body.data.responseCount, 1, 'the same vote twice is still one vote');
    assert.equal(dup.body.data.activity.filter((a: { kind: string }) => a.kind === 'responded').length, 1);
    const ch = await t.call('PUT', `/asks/${choice.id}/response`, tok(ben), { optionId: legon.id });
    assert.equal(ch.body.data.responseCount, 1, 'changing is not voting again');
    assert.deepEqual(ch.body.data.options.map((o: { count: number }) => o.count), [0, 1, 0]);
    assert.equal(ch.body.data.activity[0].kind, 'changed');
    assert.equal((await t.call('PUT', `/asks/${choice.id}/response`, tok(ben), { attendance: 'in' })).status, 400, 'wrong kind of answer');
    assert.equal((await t.call('PUT', `/asks/${choice.id}/response`, tok(ben), { optionId: '00000000-0000-0000-0000-000000000000' })).status, 400, 'an option from nowhere');
    assert.equal((await t.call('PUT', `/asks/${choice.id}/response`, tok(ben), { optionId: labadi.id, attendance: 'in' })).status, 400);
    assert.equal((await t.call('PUT', `/asks/${choice.id}/response`, tok(ben), {})).status, 400);
    const other = (await t.call('GET', `/asks/${who.id}`, tok(ana))).body.data;
    assert.equal((await t.call('PUT', `/asks/${choice.id}/response`, tok(ben), { optionId: other.options[0]?.id ?? '1' })).status, 400);
  });

  it('Who\'s in: in, maybe, can\'t, and who has not answered', async () => {
    assert.equal((await t.call('PUT', `/asks/${who.id}/response`, tok(ana), { attendance: 'in' })).status, 200);
    const r = await t.call('PUT', `/asks/${who.id}/response`, tok(ben), { attendance: 'maybe' });
    assert.deepEqual(r.body.data.attendance, { in: 1, maybe: 1, out: 0 });
    assert.equal(r.body.data.headline, '1 in · 1 maybe');
    assert.deepEqual(r.body.data.waiting, [], 'everyone in the Circle has answered');
    const c = await t.call('PUT', `/asks/${who.id}/response`, tok(ben), { attendance: 'out' });
    assert.deepEqual(c.body.data.attendance, { in: 1, maybe: 0, out: 1 });
    assert.equal((await t.call('PUT', `/asks/${who.id}/response`, tok(ben), { attendance: 'yes' })).status, 400);
    assert.equal((await t.call('PUT', `/asks/${who.id}/response`, tok(ben), { optionId: choice.options[0].id })).status, 400);
  });

  it('the public link previews the question without signing in, with first names only', async () => {
    const p = await t.call('GET', `/ask-links/${choice.token}`);
    assert.equal(p.status, 200);
    assert.deepEqual([p.body.data.title, p.body.data.circle.name, p.body.data.isMember], ['Where should we stay?', 'The Boys', false]);
    assert.equal(p.body.data.shareToken, null, 'a visitor is not handed the link');
    assert.deepEqual(p.body.data.waiting, [], 'visitors never see who in the Circle has not answered');
    const dump = JSON.stringify(p.body);
    assert.ok(!/"lastName":"[^"]/.test(dump) && !/0803666/.test(dump), 'no last names or phone numbers');
    assert.ok(p.body.people.every((x: { lastName: string }) => x.lastName === ''));
    assert.equal((await t.call('GET', '/ask-links/short')).status, 404);
    assert.equal((await t.call('GET', `/ask-links/${'A'.repeat(43)}`)).status, 404);
    assert.equal((await t.call('POST', `/ask-links/${choice.token}/started`, undefined, {})).status, 200, 'a tap on an answer is counted without an account');
  });

  it('signed-in people answer from the link without joining; signed out cannot answer', async () => {
    const [labadi] = choice.options;
    assert.equal((await t.call('PUT', `/ask-links/${choice.token}/response`, undefined, { optionId: labadi.id })).status, 401);
    const before = await t.call('GET', `/ask-links/${choice.token}/mine`, tok(dan));
    assert.deepEqual([before.body.data.ask.isMember, before.body.data.ask.mine, before.body.data.canJoinCircle], [false, null, true]);
    const v = await t.call('PUT', `/ask-links/${choice.token}/response`, tok(dan), { optionId: labadi.id });
    assert.equal(v.status, 200);
    assert.equal(v.body.data.ask.mine.optionId, labadi.id);
    assert.equal(v.body.data.ask.options.find((o: { id: string }) => o.id === labadi.id).count, 1);
    assert.equal((await t.call('GET', `/circles/${circleId}`, tok(dan))).status, 404, 'answering did not make Dan a member');
    assert.equal((await t.call('GET', `/asks/${choice.id}`, tok(dan))).status, 404, 'and the member routes stay closed to him');
    const j = await t.call('POST', `/ask-links/${choice.token}/join-circle`, tok(dan), {});
    assert.equal(j.status, 200);
    assert.equal(j.body.data.id, circleId);
    assert.equal((await t.call('GET', `/asks/${choice.id}`, tok(dan))).status, 200, 'now a member: the Circle\'s Asks are his too');
    assert.equal((await t.call('GET', `/ask-links/${choice.token}/mine`, tok(dan))).body.data.ask.mine.optionId, labadi.id, 'his earlier answer is kept');
  });

  it('the Circle shows live signals and Home shows what needs you', async () => {
    const list = await t.call('GET', '/circles', tok(ben));
    const live = list.body.data.find((c: { id: string }) => c.id === circleId).live;
    assert.ok(live && typeof live.text === 'string');
    const needs = await t.call('GET', '/asks/needs-you', tok(cleo));
    assert.equal(needs.body.data.length, 0, 'nothing in Circles she is not in');
    const fresh = (await create(ana, circleId, { type: 'attendance', title: 'Match on Friday' })).body.data;
    const mine = await t.call('GET', '/asks/needs-you', tok(ben));
    assert.deepEqual(mine.body.data.map((a: { id: string }) => a.id), [fresh.id], 'only what Ben has not answered');
    assert.equal((await t.call('GET', '/asks/needs-you', tok(ana))).body.data.length, 0, 'and never what you asked yourself');
    const liveNow = (await t.call('GET', '/circles', tok(ben))).body.data.find((c: { id: string }) => c.id === circleId).live;
    assert.equal(liveNow.needsYou, true);
    assert.match(liveNow.text, /Match on Friday · are you in\?/);
  });

  it('closing: creator only, final result stays visible, no more answers', async () => {
    assert.equal((await t.call('POST', `/asks/${choice.id}/close`, tok(ben), {})).status, 403, 'only the person who asked');
    const c = await t.call('POST', `/asks/${choice.id}/close`, tok(ana), {});
    assert.equal(c.status, 200);
    assert.equal(c.body.data.status, 'closed');
    assert.match(c.body.data.headline, /Labadi won with 2 votes|East Legon won with 1 vote|Tied/);
    assert.equal(c.body.data.canClose, false);
    assert.equal((await t.call('POST', `/asks/${choice.id}/close`, tok(ana), {})).status, 200, 'closing twice is fine');
    const late = await t.call('PUT', `/asks/${choice.id}/response`, tok(ben), { optionId: choice.options[2].id });
    assert.equal(late.status, 409);
    assert.equal((await t.call('PUT', `/ask-links/${choice.token}/response`, tok(cleo), { optionId: choice.options[2].id })).status, 409, 'nor from the link');
    assert.equal((await t.call('GET', `/ask-links/${choice.token}`)).body.data.status, 'closed', 'the link still shows the result');
    const list = await t.call('GET', `/circles/${circleId}/asks`, tok(ben));
    assert.ok(list.body.data.some((a: { id: string; status: string }) => a.id === choice.id && a.status === 'closed'), 'closed Asks stay in the Circle\'s history');
  });

  it('the creator can turn a link off: the old one dies, a new one works', async () => {
    const r = await t.call('POST', `/asks/${who.id}/share/reset`, tok(ana), {});
    const fresh = r.body.data.shareToken;
    assert.notEqual(fresh, who.token);
    const old = await t.call('GET', `/ask-links/${who.token}`);
    assert.equal(old.status, 410, 'the old link says it is no longer active');
    assert.equal(old.body.error?.code ?? old.body.code, 'ask_link_off');
    assert.match(old.body.error?.message ?? old.body.message, /no longer active/);
    assert.ok(!JSON.stringify(old.body).includes('Beach'), 'a turned-off link reveals nothing');
    assert.equal((await t.call('GET', `/ask-links/${fresh}`)).status, 200);
    assert.equal((await t.call('POST', `/asks/${who.id}/share/reset`, tok(ben), {})).status, 403);
    who.token = fresh;
  });

  it('notifies sensibly: a note to the Circle, one grouped line to the asker, a result on close; no push per vote', async () => {
    const mine = await t.call('GET', '/notifications', tok(ben));
    assert.ok(mine.body.items.some((n: { type: string }) => n.type === 'ask_new'), 'Ben was asked');
    assert.ok(mine.body.items.some((n: { type: string }) => n.type === 'ask_closed'), 'and told the decision');
    const asker = await t.call('GET', '/notifications', tok(ana));
    const answers = asker.body.items.filter((n: { type: string }) => n.type === 'ask_response');
    assert.ok(answers.length >= 1 && answers.length <= 3, 'answers are grouped, not one line per vote');
    assert.ok(!asker.body.items.some((n: { type: string }) => n.type === 'ask_new'), 'you are not asked your own question');
    const pushes = await t.db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM outbox WHERE kind = 'push.send'`).catch(() => ({ rows: [{ n: -1 }] }));
    assert.ok(pushes.rows[0].n <= 12, 'push is for new questions and results only');
    const link = (n: { type: string; refId: string | null }) => n.refId;
    assert.ok(mine.body.items.filter((n: { type: string }) => n.type.startsWith('ask_')).every((n: { type: string; refId: string | null }) => !!link(n)));
  });

  it('records the funnel for one question, and nothing private', async () => {
    const key = askPseudo(t.ctx.config, choice.id);
    const rows = await t.db.query<{ name: string; props: Record<string, unknown>; ask: string }>(`SELECT name, props, ask FROM product_events WHERE ask = $1 ORDER BY id`, [key]);
    const names = rows.rows.map((r) => r.name);
    for (const n of ['ask_created', 'ask_shared_link_opened', 'ask_public_response_selected', 'ask_response_completed_from_share', 'ask_responded', 'ask_changed_response', 'ask_closed', 'circle_joined', 'circle_joined_from_ask']) assert.ok(names.includes(n), `${n} is on the question's path`);
    assert.equal(names.filter((n) => n === 'ask_created').length, 1);
    const dump = JSON.stringify(rows.rows);
    assert.ok(!/Where should|Labadi|East Legon|Osu|The Boys|Ana|Ben|Dan/.test(dump) && !dump.includes(choice.token), 'no title, options, names or tokens');
    assert.ok(!dump.includes(choice.id), 'no real id');
    const joined = rows.rows.find((r) => r.name === 'circle_joined')!;
    assert.deepEqual(joined.props, { via: 'link', from_ask: true }, 'a join from an Ask is marked as one');
    const responded = rows.rows.filter((r) => r.name === 'ask_responded').map((r) => r.props);
    assert.ok(responded.some((p) => p.member === false), 'answers from outside the Circle are told apart');
    // Steps the server cannot see for itself, and the reshare.
    const step = (name: string, token_: string, signedIn = false) => t.call('POST', `/ask-links/${token_}/step`, undefined, { step: name, signedIn });
    assert.equal((await step('auth_started', choice.token)).status, 200);
    assert.equal((await step('join_prompt', choice.token, true)).status, 200);
    assert.equal((await step('nonsense', choice.token)).status, 400);
    assert.equal((await t.call('POST', `/ask-links/${choice.token}/auth-completed`, tok(dan), {})).status, 200);
    assert.equal((await t.call('POST', `/ask-links/${choice.token}/reshared`, tok(dan), { via: 'copy' })).status, 200);
    assert.equal((await t.call('POST', `/ask-links/${choice.token}/reshared`, undefined, { via: 'copy' })).status, 401);
    const more = await t.db.query<{ name: string; props: Record<string, unknown> }>(`SELECT name, props FROM product_events WHERE ask = $1`, [key]);
    for (const n of ['ask_auth_started_from_share', 'ask_auth_completed_from_share', 'circle_join_prompt_shown', 'ask_reshared']) assert.ok(more.rows.some((r) => r.name === n), `${n} is on the path`);
    const opened = more.rows.find((r) => r.name === 'ask_shared_link_opened')!;
    assert.deepEqual(Object.keys(opened.props).sort(), ['auth_state', 'from', 'state', 'type'], 'only coarse, fixed properties');
    assert.ok(!JSON.stringify(more.rows).includes('Where should'), 'no question text');
    const shared = await t.call('POST', `/asks/${choice.id}/shared`, tok(ana), { via: 'native' });
    assert.equal(shared.status, 200);
    assert.equal((await t.call('POST', `/asks/${choice.id}/shared`, tok(cleo), { via: 'copy' })).status, 404);
    assert.equal((await t.call('GET', `/asks/${choice.id}?from=home`, tok(ana))).status, 200);
  });

  it('builds a link preview from the Ask and escapes it', () => {
    const html = '<title>PACT</title><meta name="description" content="x" /><meta property="og:title" content="a" /><meta property="og:description" content="b" /><meta name="twitter:card" content="summary" />';
    const out = injectOg(html, askPreviewText({ circleName: 'The "Boys"', circleEmoji: '🍻', title: 'Where <b>to</b>?', type: 'choice', responses: 6, closed: false }));
    assert.match(out, /og:title" content="The &quot;Boys&quot; 🍻 · Where &lt;b&gt;to&lt;\/b&gt;\?"/);
    assert.match(out, /6 people are deciding\. Add your vote\./);
    assert.ok(!out.includes('<b>'));
    assert.match(injectOg(html, askPreviewText({ circleName: 'X', circleEmoji: '🏠', title: 'Beach', type: 'attendance', responses: 0, closed: false })), /Are you in\?/);
  });
});

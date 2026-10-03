/** Post-audit risks closed: stranded Plans, account closure and export, retried creates, sticky removal, Split link reset, `$` in titles. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { injectOg } from '../src/lib/og.js';
import { stableStringify } from '../src/lib/crypto.js';
import { addDays, lagosToday } from '../src/lib/time.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type U = Awaited<ReturnType<T['signIn']>>;

describe('Remaining audit risks', () => {
  let t: T;
  let ana: U, ben: U, cat: U;
  let circleId: string;
  let invite: string;
  const tok = (u: U) => u.accessToken;
  const day = (n: number) => addDays(lagosToday(new Date()), n);
  const code = (r: { body: { error?: { code?: string }; code?: string } }) => r.body.error?.code ?? r.body.code;

  before(async () => {
    t = await setup();
    ana = await t.signIn('08038880001', { firstName: 'Ana', lastName: 'Owner', pin: '2468' });
    ben = await t.signIn('08038880002', { firstName: 'Ben', lastName: 'Member', pin: '2468' });
    cat = await t.signIn('08038880003', { firstName: 'Cat', lastName: 'Third', pin: '2468' });
    circleId = (await t.call('POST', '/circles', tok(ana), { name: 'The Boys', emoji: '🍻' })).body.data.id;
    invite = (await t.call('POST', `/circles/${circleId}/invites`, tok(ana), {})).body.data.invite.token;
    await t.call('POST', `/circle-invites/${invite}/join`, tok(ben), {});
  });
  after(async () => t.close());

  it('a Plan whose Pact is cancelled is open again, with a line in its history', async () => {
    const p = (await t.call('POST', `/circles/${circleId}/plans`, tok(ana), { title: 'Gift', category: 'gift', date: day(30), roughBudget: 50_000_00 })).body.data;
    const made = await t.call('POST', '/pacts', tok(ana), { title: 'Gift', category: 'gift', deadline: day(28), target: 50_000_00, planId: p.id });
    assert.equal(made.status, 200);
    assert.equal(code(await t.call('POST', `/plans/${p.id}/status`, tok(ana), { status: 'cancelled' })), 'plan_has_pact');
    assert.equal((await t.call('POST', `/pacts/${made.body.data.pact.id}/cancel`, tok(ana), { pin: '2468' })).status, 200);
    const after = (await t.call('GET', `/plans/${p.id}`, tok(ana))).body.data;
    assert.equal(after.pactId, null);
    assert.equal(after.status, 'planning');
    assert.ok(after.activity.some((a: { kind: string }) => a.kind === 'pact_closed'));
    assert.equal((await t.call('POST', `/plans/${p.id}/status`, tok(ana), { status: 'cancelled' })).status, 200, 'it can be cancelled now');
  });

  it('a retried create with the same key makes one object, and a different body gets its own', async () => {
    const key = { 'idempotency-key': 'retry-split-0001' };
    const body = { title: 'Dinner', total: 30_000_00, participants: [{ userId: ben.user.id }] };
    const a = await t.call('POST', `/circles/${circleId}/splits`, tok(ana), body, key);
    const b = await t.call('POST', `/circles/${circleId}/splits`, tok(ana), body, key);
    assert.equal(a.body.data.id, b.body.data.id);
    assert.equal(b.headers['idempotent-replayed'], 'true');
    const n = (await t.db.query(`SELECT COUNT(*)::int AS n FROM splits WHERE circle_id = $1 AND title = 'Dinner'`, [circleId])).rows[0].n;
    assert.equal(n, 1);
    assert.equal((await t.call('POST', `/circles/${circleId}/splits`, tok(ana), { ...body, total: 31_000_00 }, key)).status, 422, 'same key, different body');
  });

  it('the request fingerprint sees nested differences', () => {
    assert.notEqual(stableStringify({ a: { x: 1 } }), stableStringify({ a: { x: 2 } }));
    assert.equal(stableStringify({ b: 1, a: [{ y: 2, x: 1 }] }), stableStringify({ a: [{ x: 1, y: 2 }], b: 1 }));
  });

  it('a Split link can be reset: the old one is gone, the new one works', async () => {
    const s = (await t.call('POST', `/circles/${circleId}/splits`, tok(ana), { title: 'Taxi', total: 6_000_00, participants: [{ userId: ben.user.id }] })).body.data;
    const old = s.shareToken;
    assert.equal((await t.call('GET', `/split-links/${old}`)).status, 200);
    assert.equal((await t.call('POST', `/splits/${s.id}/share/reset`, tok(ben), {})).status, 403, 'only the person who made it');
    const next = (await t.call('POST', `/splits/${s.id}/share/reset`, tok(ana), {})).body.data.shareToken;
    assert.notEqual(next, old);
    assert.equal((await t.call('GET', `/split-links/${old}`)).status, 404);
    assert.equal((await t.call('GET', `/split-links/${next}`)).status, 200);
  });

  it('a removed member cannot rejoin by the same link, but one who left can', async () => {
    await t.call('POST', `/circle-invites/${invite}/join`, tok(cat), {});
    assert.equal((await t.call('DELETE', `/circles/${circleId}/members/${cat.user.id}`, tok(ana))).status, 200);
    const back = await t.call('POST', `/circle-invites/${invite}/join`, tok(cat), {});
    assert.equal(back.status, 403);
    assert.equal(code(back), 'removed_from_circle');
    await t.call('POST', `/circles/${circleId}/leave`, tok(ben), {});
    assert.equal((await t.call('POST', `/circle-invites/${invite}/join`, tok(ben), {})).status, 200);
  });

  it('a title with $ sequences cannot rewrite the shared-link page', () => {
    const shell = '<html><head><meta name="description" content="g" /><meta property="og:title" content="g" /><meta name="twitter:card" content="summary" /><title>g</title></head><body>X</body></html>';
    const out = injectOg(shell, { title: "Lunch $' and $& done", description: 'd $` e' });
    assert.ok(out.length < shell.length + 600, 'no chunks of the page were copied in');
    assert.equal(out.split('<body>').length, 2);
    assert.ok(out.includes("<title>Lunch $' and $&amp; done</title>"));
  });

  it('closing an account is blocked by an open Split or a Circle with people in it, then clears push and Circles', async () => {
    const dan = await t.signIn('08038880004', { firstName: 'Dan', lastName: 'Closer', pin: '2468' });
    await t.call('POST', `/circle-invites/${invite}/join`, tok(dan), {});
    const sp = (await t.call('POST', `/circles/${circleId}/splits`, tok(ana), { title: 'Drinks', total: 8_000_00, participants: [{ userId: dan.user.id }] })).body.data;
    await t.db.query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, 'https://push.example/endpoint-1', 'k-0123456789012345678901', 'a-0123456789')`, [dan.user.id]);
    assert.equal(code(await t.call('POST', '/me/close', tok(dan), { pin: '2468' })), 'open_splits');
    await t.call('PUT', `/splits/${sp.id}/shares/${dan.user.id}`, tok(dan), { settled: true });
    const own = await t.signIn('08038880005', { firstName: 'Eli', lastName: 'Owner', pin: '2468' });
    const c2 = (await t.call('POST', '/circles', tok(own), { name: 'Eli Crew', emoji: '🎲' })).body.data.id;
    const inv2 = (await t.call('POST', `/circles/${c2}/invites`, tok(own), {})).body.data.invite.token;
    await t.call('POST', `/circle-invites/${inv2}/join`, tok(dan), {});
    assert.equal(code(await t.call('POST', '/me/close', tok(own), { pin: '2468' })), 'owns_circles');
    const exp = (await t.call('GET', '/me/export', tok(dan))).body;
    assert.ok(exp.circles.length >= 2 && exp.splits.length >= 1, 'the export has Circles and Splits');
    assert.equal((await t.call('POST', '/me/close', tok(dan), { pin: '2468' })).status, 200);
    const push = (await t.db.query('SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [dan.user.id])).rows[0].n;
    assert.equal(push, 0);
    const still = (await t.db.query(`SELECT COUNT(*)::int AS n FROM circle_members WHERE user_id = $1 AND status = 'joined'`, [dan.user.id])).rows[0].n;
    assert.equal(still, 0);
  });

  it('link pages show a visitor first names and never account ids', async () => {
    const plan = (await t.call('POST', `/circles/${circleId}/plans`, tok(ana), { title: 'Beach', category: 'trip', date: day(20) })).body.data;
    await t.call('PUT', `/plans/${plan.id}/rsvp`, tok(ben), { status: 'in' });
    const ask = (await t.call('POST', `/circles/${circleId}/asks`, tok(ana), { type: 'attendance', title: 'Friday?' })).body.data;
    const ids = [ana.user.id, ben.user.id];
    const pub = JSON.stringify((await t.call('GET', `/plan-links/${plan.shareToken}`)).body) + JSON.stringify((await t.call('GET', `/ask-links/${ask.shareToken}`)).body);
    for (const id of ids) assert.ok(!pub.includes(id), 'no real account id in a public page');
    assert.match(pub, /Ana/);
    const outsider = await t.signIn('08038880009', { firstName: 'Zed', lastName: 'Outside', pin: '2468' });
    await t.call('PUT', `/plan-links/${plan.shareToken}/rsvp`, tok(outsider), { status: 'in' });
    const mine = JSON.stringify((await t.call('GET', `/plan-links/${plan.shareToken}/mine`, tok(outsider))).body);
    for (const id of ids) assert.ok(!mine.includes(id), 'nor for a signed-in non-member');
    assert.ok(mine.includes(outsider.user.id), 'their own id is theirs');
    const asMember = JSON.stringify((await t.call('GET', `/plans/${plan.id}`, tok(ben))).body);
    assert.ok(asMember.includes(ana.user.id), 'members still see the real ids');
  });

  it('one person cannot start more than ten things in ten minutes', async () => {
    const spammer = await t.signIn('08038880010', { firstName: 'Sam', lastName: 'Spam', pin: '2468' });
    const c = (await t.call('POST', '/circles', tok(spammer), { name: 'Noisy', emoji: '📣' })).body.data.id;
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await t.call('POST', `/circles/${c}/asks`, tok(spammer), { type: 'attendance', title: `Q${i}` })).status;
    assert.equal(last, 429);
  });

  it('the organiser can hand a Plan and a Split on, and the Circle owner can when the organiser has gone', async () => {
    const owner = await t.signIn('08038880011', { firstName: 'Olu', lastName: 'Owner', pin: '2468' });
    const maker = await t.signIn('08038880012', { firstName: 'Mia', lastName: 'Maker', pin: '2468' });
    const friend = await t.signIn('08038880013', { firstName: 'Fay', lastName: 'Friend', pin: '2468' });
    const c = (await t.call('POST', '/circles', tok(owner), { name: 'Hand', emoji: '🤝' })).body.data.id;
    const inv = (await t.call('POST', `/circles/${c}/invites`, tok(owner), {})).body.data.invite.token;
    for (const u of [maker, friend]) await t.call('POST', `/circle-invites/${inv}/join`, tok(u), {});
    const plan = (await t.call('POST', `/circles/${c}/plans`, tok(maker), { title: 'Trip', category: 'trip' })).body.data;
    const split = (await t.call('POST', `/circles/${c}/splits`, tok(maker), { title: 'Fuel', total: 4_000_00, participants: [{ userId: friend.user.id }] })).body.data;
    assert.equal((await t.call('POST', `/plans/${plan.id}/organiser`, tok(friend), { userId: friend.user.id })).status, 403);
    const moved = await t.call('POST', `/plans/${plan.id}/organiser`, tok(maker), { userId: friend.user.id });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.createdBy, friend.user.id);
    assert.equal((await t.call('POST', `/plans/${plan.id}/organiser`, tok(maker), { userId: owner.user.id })).status, 403, 'no longer theirs to hand over');
    assert.equal((await t.call('POST', `/splits/${split.id}/organiser`, tok(maker), { userId: cat.user.id })).status, 400, 'not in the Circle');
    await t.call('POST', `/circles/${c}/leave`, tok(maker), {});
    const seen = (await t.call('GET', `/splits/${split.id}`, tok(owner))).body.data;
    assert.equal(seen.canHandOver, true);
    assert.equal((await t.call('POST', `/splits/${split.id}/organiser`, tok(owner), { userId: friend.user.id })).status, 200);
  });

  it('the Activity feed spans Asks, Plans and Splits', async () => {
    const feed = (await t.call('GET', '/feed', tok(ana))).body.data as { objectType: string }[];
    assert.ok(feed.some((i) => i.objectType === 'split' || i.objectType === 'plan' || i.objectType === 'ask'));
  });

  it('a stranger cannot use up the owner’s sign-in codes from another address', async () => {
    const phone = '08038880020';
    const req = (ip: string) => t.app.inject({ method: 'POST', url: '/api/auth/otp/request', remoteAddress: ip, headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ phone }) });
    for (let i = 0; i < 5; i++) await req('10.1.1.1');
    assert.equal((await req('10.1.1.1')).statusCode, 429, 'the stranger is stopped');
    assert.equal((await req('10.2.2.2')).statusCode, 200, 'the owner is not');
  });
});

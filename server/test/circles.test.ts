/**
 * Circles: create, list, read, update, leave; invite links (valid, unknown, revoked, already in); isolation between
 * people; and the relationship to Pacts. Attacks go through the API, like the rest of the security tests.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { personId } from '../src/lib/events.js';
import { lagosDay, setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;

describe('Circles', () => {
  let t: T;
  let ana: Awaited<ReturnType<T['signIn']>>;
  let ben: Awaited<ReturnType<T['signIn']>>;
  let cleo: Awaited<ReturnType<T['signIn']>>;
  let circleId: string;
  let token: string;

  before(async () => {
    t = await setup();
    ana = await t.signIn('08035550001', { firstName: 'Ana', lastName: 'Owner', pin: '2468' });
    ben = await t.signIn('08035550002', { firstName: 'Ben', lastName: 'Member', pin: '2468' });
    cleo = await t.signIn('08035550003', { firstName: 'Cleo', lastName: 'Outsider', pin: '2468' });
  });
  after(async () => t.close());

  const as = (u: typeof ana) => u.accessToken;

  it('creates a Circle with the creator as owner, and lists it', async () => {
    const r = await t.call('POST', '/circles', as(ana), { name: '  The Boys ', emoji: '🍻', tint: 'sun' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.name, 'The Boys');
    assert.equal(r.body.data.role, 'owner');
    assert.equal(r.body.data.memberCount, 1);
    assert.equal(r.body.data.invite, null, 'no link until someone asks for one');
    circleId = r.body.data.id;
    const list = await t.call('GET', '/circles', as(ana));
    assert.deepEqual(list.body.data.map((c: { id: string }) => c.id), [circleId]);
    assert.equal(list.body.data[0].emoji, '🍻');
    assert.ok(list.body.people.some((p: { firstName: string }) => p.firstName === 'Ana'));
  });

  it('validates what a Circle is made of', async () => {
    assert.equal((await t.call('POST', '/circles', as(ana), { name: '', emoji: '🍻' })).status, 400);
    assert.equal((await t.call('POST', '/circles', as(ana), { name: 'x'.repeat(41), emoji: '🍻' })).status, 400);
    assert.equal((await t.call('POST', '/circles', as(ana), { name: 'Letters', emoji: 'ab' })).status, 400, 'emoji must be an emoji');
    assert.equal((await t.call('POST', '/circles', as(ana), { name: 'Tint', emoji: '🍻', tint: 'neon' })).status, 400);
    assert.equal((await t.call('POST', '/circles', as(ana), { name: 'Ghana December', emoji: '🇬🇭' })).status, 200, 'flags are emoji too');
    assert.equal((await t.call('POST', '/circles', as(ana), { name: '<b>Hi</b>', emoji: '🍻' })).status, 400, 'no markup');
    assert.equal((await t.call('POST', '/circles', undefined, { name: 'Anon', emoji: '🍻' })).status, 401);
  });

  it('only the owner can change it', async () => {
    const r = await t.call('PATCH', `/circles/${circleId}`, as(ana), { name: 'The Boys Club', emoji: '⚡', tint: 'sky' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.data.name, r.body.data.emoji, r.body.data.tint], ['The Boys Club', '⚡', 'sky']);
    assert.equal((await t.call('PATCH', `/circles/${circleId}`, as(ana), {})).status, 400, 'an empty change is refused');
  });

  it('members get a link; the preview shows what it is for without signing in', async () => {
    const made = await t.call('POST', `/circles/${circleId}/invites`, as(ana), {});
    token = made.body.data.invite.token;
    assert.ok(token.length >= 32, 'a long random token');
    const again = await t.call('POST', `/circles/${circleId}/invites`, as(ana), {});
    assert.equal(again.body.data.invite.token, token, 'asking again returns the same live link');
    const peek = await t.call('GET', `/circle-invites/${token}`);
    assert.equal(peek.status, 200);
    assert.deepEqual([peek.body.name, peek.body.memberCount, peek.body.inviter.firstName], ['The Boys Club', 1, 'Ana']);
    assert.ok(!JSON.stringify(peek.body).includes('08035550001'), 'no phone numbers in a public preview');
    assert.equal((await t.call('GET', '/circle-invites/not-a-real-token')).status, 404);
    assert.equal((await t.call('GET', `/circle-invites/${'A'.repeat(43)}`)).status, 404, 'a well-formed but unknown token');
  });

  it('joining: signed in people join, twice is fine, signed out is refused', async () => {
    assert.equal((await t.call('POST', `/circle-invites/${token}/join`, undefined, {})).status, 401);
    const j = await t.call('POST', `/circle-invites/${token}/join`, as(ben), {});
    assert.equal(j.status, 200);
    assert.equal(j.body.data.id, circleId);
    assert.equal(j.body.data.role, 'member');
    assert.equal(j.body.data.memberCount, 2);
    const twice = await t.call('POST', `/circle-invites/${token}/join`, as(ben), {});
    assert.equal(twice.status, 200, 'already a member: just goes to the Circle');
    assert.equal(twice.body.data.memberCount, 2);
    assert.deepEqual(j.body.data.activity.map((a: { type: string }) => a.type), ['joined', 'created']);
    const peers = await t.call('GET', `/circles/${circleId}`, as(ben));
    assert.ok(peers.body.people.some((p: { firstName: string }) => p.firstName === 'Ana'), 'members can see each other');
  });

  it('isolation: outsiders see nothing, and guessed ids look like nothing', async () => {
    assert.equal((await t.call('GET', `/circles/${circleId}`, as(cleo))).status, 404);
    assert.equal((await t.call('GET', '/circles', as(cleo))).body.data.length, 0);
    assert.equal((await t.call('PATCH', `/circles/${circleId}`, as(cleo), { name: 'Mine now' })).status, 404);
    assert.equal((await t.call('POST', `/circles/${circleId}/invites`, as(cleo), {})).status, 404);
    assert.equal((await t.call('POST', `/circles/${circleId}/invites/reset`, as(cleo), {})).status, 404);
    assert.equal((await t.call('POST', `/circles/${circleId}/leave`, as(cleo), {})).status, 404);
    assert.equal((await t.call('DELETE', `/circles/${circleId}/members/${ben.user.id}`, as(cleo))).status, 404);
    assert.equal((await t.call('GET', '/circles/00000000-0000-0000-0000-000000000000', as(ana))).status, 404);
    assert.equal((await t.call('GET', '/circles/not-a-uuid', as(ana))).status, 404);
    // And the app role cannot read invite tokens or other people's Circles at all.
    if (t.db.driver === 'pglite') {
      await assert.rejects(t.db.asUser(ben.user.id, (q) => q.query('SELECT token FROM circle_invites')), 'tokens are service-only');
      const rows = await t.db.asUser(cleo.user.id, (q) => q.query('SELECT * FROM circles'));
      assert.equal(rows.rowCount, 0, 'row-level security hides Circles from non-members');
      const people = await t.db.asUser(cleo.user.id, (q) => q.query('SELECT id FROM users WHERE id = $1', [ana.user.id]));
      assert.equal(people.rowCount, 0, 'sharing nothing means seeing nothing');
    }
  });

  it('members cannot mutate someone else\'s Circle', async () => {
    assert.equal((await t.call('PATCH', `/circles/${circleId}`, as(ben), { name: 'Hijacked' })).status, 403);
    assert.equal((await t.call('POST', `/circles/${circleId}/invites/reset`, as(ben), {})).status, 403, 'only the owner resets the link');
    assert.equal((await t.call('DELETE', `/circles/${circleId}/members/${ana.user.id}`, as(ben))).status, 403);
    const got = await t.call('GET', `/circles/${circleId}`, as(ana));
    assert.equal(got.body.data.name, 'The Boys Club');
  });

  it('a Pact can belong to a Circle, but only the person\'s own', async () => {
    const body = { title: 'Lagos weekend', category: 'trip', deadline: lagosDay(20), target: 100_000_00 };
    const mine = await t.call('POST', '/pacts', as(ana), { ...body, circleId });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.pact.circleId, circleId);
    const plain = await t.call('POST', '/pacts', as(ana), body);
    assert.equal(plain.body.data.pact.circleId, null, 'standalone Pacts are unchanged');
    assert.equal((await t.call('POST', '/pacts', as(cleo), { ...body, circleId })).status, 404, 'not your Circle');
    const circle = await t.call('GET', `/circles/${circleId}`, as(ana));
    assert.equal(circle.body.data.pactCount, 1);
    assert.equal((await t.call('GET', '/pacts', as(ana))).status, 200);
  });

  it('the owner can reset the link: the old one stops working, the new one works', async () => {
    const reset = await t.call('POST', `/circles/${circleId}/invites/reset`, as(ana), {});
    const fresh = reset.body.data.invite.token;
    assert.notEqual(fresh, token);
    const old = await t.call('GET', `/circle-invites/${token}`);
    assert.equal(old.status, 410);
    assert.equal(old.body.error?.code ?? old.body.code, 'invite_revoked');
    assert.ok(!JSON.stringify(old.body).includes('Boys'), 'a turned-off link reveals nothing about the Circle');
    assert.equal((await t.call('POST', `/circle-invites/${token}/join`, as(cleo), {})).status, 410);
    assert.equal((await t.call('POST', `/circle-invites/${fresh}/join`, as(cleo), {})).status, 200);
    token = fresh;
  });

  it('owner can remove a member; members can leave and come back; owner cannot walk away from a full Circle', async () => {
    const owner = await t.call('POST', `/circles/${circleId}/leave`, as(ana), {});
    assert.equal(owner.status, 400);
    assert.equal(owner.body.error?.code ?? owner.body.code, 'owner_cannot_leave');
    assert.equal((await t.call('DELETE', `/circles/${circleId}/members/${cleo.user.id}`, as(ana))).status, 200);
    assert.equal((await t.call('GET', `/circles/${circleId}`, as(cleo))).status, 404, 'removed people lose access at once');
    assert.equal((await t.call('POST', `/circles/${circleId}/leave`, as(ben), {})).status, 200);
    assert.equal((await t.call('GET', `/circles/${circleId}`, as(ben))).status, 404);
    assert.equal((await t.call('GET', '/circles', as(ben))).body.data.length, 0);
    assert.equal((await t.call('POST', `/circle-invites/${token}/join`, as(ben), {})).status, 200, 'the link brings them back');
    assert.equal((await t.call('GET', `/circles/${circleId}`, as(ben))).body.data.memberCount, 2);
  });

  it('an owner alone can leave, and the links die with the Circle', async () => {
    const solo = (await t.call('POST', '/circles', as(cleo), { name: 'Solo', emoji: '🏠' })).body.data.id;
    const link = (await t.call('POST', `/circles/${solo}/invites`, as(cleo), {})).body.data.invite.token;
    assert.equal((await t.call('POST', `/circles/${solo}/leave`, as(cleo), {})).status, 200);
    assert.equal((await t.call('GET', `/circle-invites/${link}`)).status, 410);
  });

  it('records coarse events and audit rows, and nothing private', async () => {
    const rows = await t.db.query<{ name: string; props: Record<string, unknown> }>(`SELECT name, props FROM product_events WHERE name LIKE 'circle_%' ORDER BY id`);
    const names = rows.rows.map((r) => r.name);
    for (const n of ['circle_created', 'circle_joined', 'circle_invite_created', 'circle_invite_opened']) assert.ok(names.includes(n), n);
    const dump = JSON.stringify(rows.rows);
    assert.ok(!/Boys|🍻|⚡|Ana|08035/.test(dump) && !dump.includes(token), 'no names, emoji, numbers or tokens in events');
    const audit = await t.db.query<{ action: string }>(`SELECT action FROM audit_log WHERE action LIKE 'circle.%'`);
    assert.ok(audit.rows.some((a) => a.action === 'circle.created') && audit.rows.some((a) => a.action === 'circle.joined'));
    assert.ok(!JSON.stringify(audit.rows).includes(token));
    // Client-sent events: sharing and opening the create sheet, once per person per day.
    const send = (name: string, props: Record<string, unknown>) => t.call('POST', '/me/onboarding-event', as(ana), { name, props });
    assert.equal((await send('circle_invite_shared', { via: 'copy' })).status, 200);
    assert.equal((await send('circle_invite_shared', { via: 'copy' })).status, 200);
    assert.equal((await send('universal_create_opened', { from: 'nav', circle: 'The Boys' })).status, 200);
    const mine = await t.db.query<{ name: string; props: Record<string, unknown> }>(`SELECT name, props FROM product_events WHERE actor = $1 AND name IN ('circle_invite_shared', 'universal_create_opened')`, [personId(t.ctx.config, ana.user.id)]);
    assert.equal(mine.rows.filter((r) => r.name === 'circle_invite_shared').length, 1);
    assert.deepEqual(mine.rows.find((r) => r.name === 'universal_create_opened')!.props, { from: 'nav' }, 'the Circle name is dropped');
  });
});

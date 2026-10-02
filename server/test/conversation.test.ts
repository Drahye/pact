/**
 * Conversation attached to activity: comments, a few reactions, organiser updates and one pin.
 * History stays authoritative; discussion is only ever attached to it. Includes attempts to break the
 * rules by calling the API and the database directly.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { syncProductEvents } from '../src/modules/events.js';
import { setup, lagosDay } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type Session = { accessToken: string; user: { id: string } };
type Item = { id: string; type: string; body: string | null; commentCount: number; reactions: Record<string, number>; myReactions: string[] };

const future = (days: number) => lagosDay(days);
const PIN = '1357';

describe('Conversation around activity', () => {
  let t: T;
  let abraham: Session; // organiser, BVN verified
  let sarah: Session; // member (BVN verified: can be co-organiser)
  let david: Session; // member
  let outsider: Session;
  let invitee: Session; // invited, has not joined
  let pact: { id: string; inviteCode: string };

  const detail = async (id: string, who: Session) => (await t.call('GET', `/pacts/${id}`, who.accessToken)).body.data as { pact: { pinned: { activity: Item; pinnedBy: string } | null; status: string; completedAt: string | null }; activities: Item[] };
  const feed = async (id: string, who = abraham) => (await detail(id, who)).activities;
  const thread = (id: string, aid: string, who: Session) => t.call('GET', `/pacts/${id}/activity/${aid}`, who.accessToken);
  const comment = (id: string, aid: string, who: Session, body: string, key?: string) => t.call('POST', `/pacts/${id}/activity/${aid}/comments`, who.accessToken, { body }, key ? { 'idempotency-key': key } : {});
  const react = (id: string, aid: string, who: Session, reaction: string, on = true) => t.call('PUT', `/pacts/${id}/activity/${aid}/reactions`, who.accessToken, { reaction, on });
  const postUpdate = (id: string, who: Session, body: string) => t.call('POST', `/pacts/${id}/updates`, who.accessToken, { body });
  const pinItem = (id: string, who: Session, activityId: string | null) => t.call('PUT', `/pacts/${id}/pin`, who.accessToken, { activityId });
  const newPact = async (title: string, target = 100_000_00) => {
    const r = await t.call('POST', '/pacts', abraham.accessToken, { title, category: 'trip', target, deadline: future(30), invitePhones: ['08035550102'], tasks: [{ title: 'Book transport' }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = r.body.data.pact;
    for (const s of [sarah, david]) assert.equal((await t.call('POST', `/invites/${p.inviteCode}/join`, s.accessToken, {})).status, 200);
    return { id: p.id as string, inviteCode: p.inviteCode as string };
  };
  const contribute = async (id: string, who: Session, naira: number) => {
    const r = await t.call('POST', `/pacts/${id}/contributions`, who.accessToken, { amount: naira * 100, pin: PIN });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  };
  const find = (items: Item[], type: string) => items.find((a) => a.type === type)!;

  before(async () => {
    t = await setup({ seed: true });
    abraham = await t.signIn('08010000001');
    sarah = await t.signIn('08010000002');
    david = await t.signIn('08010000003');
    outsider = await t.signIn('08035550101', { firstName: 'Olu', lastName: 'Outsider', pin: '2468' });
    invitee = await t.signIn('08035550102', { firstName: 'Ife', lastName: 'Invited', pin: '2468' });
    pact = await newPact('Ibadan trip');
  });
  after(async () => {
    await t.close();
  });

  it('A: a contribution can be discussed by members only, and the activity itself never changes', async () => {
    await contribute(pact.id, sarah, 25_000);
    const before = await t.db.query(`SELECT id, actor_id, type, amount, detail, created_at FROM activities WHERE pact_id = $1 AND type = 'contribution'`, [pact.id]);
    const item = find(await feed(pact.id), 'contribution');

    const c = await comment(pact.id, item.id, david, 'Nice, almost there.');
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.data.comments.length, 1);
    assert.equal(c.body.data.comments[0].body, 'Nice, almost there.');
    assert.equal(c.body.data.comments[0].userId, david.user.id);
    assert.equal(find(await feed(pact.id), 'contribution').commentCount, 1);

    // Only people in the Pact can read the thread or write to it.
    assert.equal((await thread(pact.id, item.id, outsider)).status, 404);
    assert.equal((await comment(pact.id, item.id, outsider, 'hello')).status, 404);
    assert.equal((await thread(pact.id, item.id, invitee)).status, 404, 'an invitee sees the plan, not the group’s conversation');
    assert.equal((await comment(pact.id, item.id, invitee, 'hello')).status, 403);

    // The record of what happened can't be edited or deleted through any route.
    assert.equal((await t.call('DELETE', `/pacts/${pact.id}/updates/${item.id}`, abraham.accessToken)).status, 403);
    assert.equal((await t.call('DELETE', `/pacts/${pact.id}/updates/${item.id}`, sarah.accessToken)).status, 403);
    const after = await t.db.query(`SELECT id, actor_id, type, amount, detail, created_at FROM activities WHERE pact_id = $1 AND type = 'contribution'`, [pact.id]);
    assert.deepEqual(after.rows, before.rows);
  });

  it('B: reactions are a small fixed set, one of each per person, and update the counts', async () => {
    const task = (await detail(pact.id, abraham)).pact as unknown as { tasks?: unknown };
    void task;
    const tasks = (await t.call('GET', `/pacts/${pact.id}`, abraham.accessToken)).body.data.pact.tasks as { id: string }[];
    assert.equal((await t.call('PATCH', `/pacts/${pact.id}/tasks/${tasks[0].id}`, sarah.accessToken, { assigneeId: 'me' })).status, 200);
    assert.equal((await t.call('PATCH', `/pacts/${pact.id}/tasks/${tasks[0].id}`, sarah.accessToken, { status: 'done' })).status, 200);
    const done = find(await feed(pact.id), 'task_done');

    assert.equal((await react(pact.id, done.id, david, 'celebrate')).status, 200);
    assert.equal((await react(pact.id, done.id, abraham, 'celebrate')).status, 200);
    const dup = await react(pact.id, done.id, david, 'celebrate');
    assert.equal(dup.body.data.activity.reactions.celebrate, 2, 'a repeat tap is a no-op');
    assert.deepEqual(dup.body.data.activity.myReactions, ['celebrate']);
    assert.equal((await react(pact.id, done.id, david, 'heart')).body.data.activity.reactions.heart, 1);
    assert.equal((await react(pact.id, done.id, david, 'celebrate', false)).body.data.activity.reactions.celebrate, 1);
    assert.equal((await react(pact.id, done.id, david, 'poop')).status, 400, 'no custom emoji');
    assert.equal((await react(pact.id, done.id, outsider, 'heart')).status, 404);
    assert.equal((await react(pact.id, done.id, invitee, 'heart')).status, 403);
    // Reactions never notify anyone.
    const notes = (await t.call('GET', '/notifications', sarah.accessToken)).body.items as { type: string }[];
    assert.ok(!notes.some((n) => n.type === 'reaction'));
    // Same person, same reaction, one row, even straight at the database.
    assert.equal((await t.db.query(`SELECT 1 FROM activity_reactions WHERE activity_id = $1 AND user_id = $2 AND reaction = 'heart'`, [done.id, david.user.id])).rowCount, 1);
  });

  it('C: an organiser posts an update into the same feed; members can read, comment and react, but not post', async () => {
    const posted = await postUpdate(pact.id, abraham, 'Venue moved to Civic Centre.');
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
    const update = find(await feed(pact.id, sarah), 'update');
    assert.equal(update.body, 'Venue moved to Civic Centre.');
    assert.equal(update.id, posted.body.data.activities[0].id, 'newest first, in the same stream');

    assert.equal((await postUpdate(pact.id, sarah, 'Not an organiser')).status, 403);
    assert.equal((await postUpdate(pact.id, outsider, 'Nope')).status, 404);
    assert.equal((await postUpdate(pact.id, abraham, '   ')).status, 400);
    assert.equal((await postUpdate(pact.id, abraham, 'x'.repeat(501))).status, 400);
    assert.equal((await postUpdate(pact.id, abraham, '<b>bold</b>')).status, 400, 'plain text only');

    assert.equal((await comment(pact.id, update.id, david, 'On my way.')).status, 200);
    assert.equal((await react(pact.id, update.id, sarah, 'thumbs_up')).status, 200);
    const notes = (await t.call('GET', '/notifications', david.accessToken)).body.items as { type: string; title: string }[];
    assert.ok(notes.some((n) => n.type === 'update'), 'members hear about an organiser update');
    // An invitee who hasn't joined doesn't.
    assert.ok(!((await t.call('GET', '/notifications', invitee.accessToken)).body.items as { type: string }[]).some((n) => n.type === 'update'));
  });

  it('D and E: the organiser pins; a new pin replaces the old one and nothing is deleted', async () => {
    const items = await feed(pact.id);
    const update = find(items, 'update');
    const contribution = find(items, 'contribution');

    assert.equal((await pinItem(pact.id, sarah, update.id)).status, 403, 'members cannot pin');
    assert.equal((await pinItem(pact.id, outsider, update.id)).status, 404);
    const first = await pinItem(pact.id, abraham, update.id);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.pact.pinned.activity.body, 'Venue moved to Civic Centre.');
    assert.equal(first.body.data.pact.pinned.pinnedBy, abraham.user.id);
    assert.ok((await detail(pact.id, sarah)).pact.pinned, 'members see it');
    const notes = (await t.call('GET', '/notifications', sarah.accessToken)).body.items as { type: string }[];
    assert.ok(notes.some((n) => n.type === 'pinned'));

    const second = await pinItem(pact.id, abraham, contribution.id);
    assert.equal(second.body.data.pact.pinned.activity.id, contribution.id, 'replaced');
    const stream = await feed(pact.id);
    assert.ok(stream.some((a) => a.id === update.id), 'the old item is still in the feed');
    assert.equal((await t.db.query(`SELECT 1 FROM pacts WHERE id = $1 AND pinned_activity_id = $2`, [pact.id, contribution.id])).rowCount, 1, 'one pin per Pact');

    // Routine joins aren't pinnable; the co-organiser can pin, then unpin.
    assert.equal((await pinItem(pact.id, abraham, find(stream, 'join').id)).body.error.code, 'not_pinnable');
    assert.equal((await t.call('PUT', `/pacts/${pact.id}/co-organizer`, abraham.accessToken, { userId: sarah.user.id })).status, 200);
    assert.equal((await pinItem(pact.id, sarah, update.id)).body.data.pact.pinned.pinnedBy, sarah.user.id);
    assert.equal((await pinItem(pact.id, sarah, null)).body.data.pact.pinned, null);
    assert.equal((await t.call('PUT', `/pacts/${pact.id}/co-organizer`, abraham.accessToken, { userId: null })).status, 200);
  });

  it('removing your own update clears its pin and hides it; only the author can, and never system activity', async () => {
    const posted = await postUpdate(pact.id, abraham, 'Bus leaves at 7am.');
    const u = posted.body.data.activities[0] as Item;
    await pinItem(pact.id, abraham, u.id);
    assert.equal((await t.call('DELETE', `/pacts/${pact.id}/updates/${u.id}`, david.accessToken)).status, 403);
    const gone = await t.call('DELETE', `/pacts/${pact.id}/updates/${u.id}`, abraham.accessToken);
    assert.equal(gone.status, 200, JSON.stringify(gone.body));
    assert.equal(gone.body.data.pact.pinned, null, 'a pin on a removed update clears');
    assert.ok(!(await feed(pact.id)).some((a) => a.id === u.id));
    assert.equal((await thread(pact.id, u.id, david)).status, 404);
    assert.equal((await comment(pact.id, u.id, david, 'late')).status, 404);
  });

  it('comments: your own to remove, trimmed, limited, plain text, and one thread only', async () => {
    const item = find(await feed(pact.id), 'contribution');
    const mine = (await comment(pact.id, item.id, sarah, '  I can add the rest on Friday.  ')).body.data.comments.at(-1);
    assert.equal(mine.body, 'I can add the rest on Friday.', 'trimmed');
    assert.equal((await comment(pact.id, item.id, david, '')).status, 400);
    assert.equal((await comment(pact.id, item.id, david, 'y'.repeat(501))).status, 400, 'at most 500 characters');
    assert.equal((await comment(pact.id, item.id, david, 'y'.repeat(500))).status, 200);
    assert.equal((await comment(pact.id, item.id, david, '<script>x</script>')).status, 400);
    // Only the author can remove it: not another member, not the organiser.
    assert.equal((await t.call('DELETE', `/pacts/${pact.id}/comments/${mine.id}`, david.accessToken)).status, 403);
    assert.equal((await t.call('DELETE', `/pacts/${pact.id}/comments/${mine.id}`, abraham.accessToken)).status, 403);
    assert.equal((await t.call('DELETE', `/pacts/${pact.id}/comments/${mine.id}`, outsider.accessToken)).status, 404);
    const removed = await t.call('DELETE', `/pacts/${pact.id}/comments/${mine.id}`, sarah.accessToken);
    assert.equal(removed.status, 200);
    const shown = removed.body.data.comments.find((c: { id: string }) => c.id === mine.id);
    assert.deepEqual([shown.deleted, shown.body], [true, ''], 'shows as removed, text gone from the response');
    assert.equal(removed.body.data.activity.commentCount, removed.body.data.comments.filter((c: { deleted: boolean }) => !c.deleted).length);
    // A comment can't be moved to another Pact's activity or onto nothing.
    assert.equal((await comment(pact.id, '00000000-0000-4000-8000-000000000000', david, 'hi')).status, 404);
  });

  it('H: a retried send never posts twice, and a new send after a failure still works', async () => {
    const item = find(await feed(pact.id), 'task_done');
    const key = `retry-key-${Date.now()}`;
    const first = await comment(pact.id, item.id, david, 'Done and dusted', key);
    const replay = await comment(pact.id, item.id, david, 'Done and dusted', key);
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(replay.headers['idempotent-replayed'], 'true');
    assert.equal((await t.db.query(`SELECT 1 FROM activity_comments WHERE activity_id = $1 AND body = 'Done and dusted'`, [item.id])).rowCount, 1);
    // The same key with different text is refused rather than silently replaced.
    assert.equal((await comment(pact.id, item.id, david, 'Different text', key)).status, 422);
  });

  it('notifications: one per thread while unread, never for reactions, never to yourself', async () => {
    const p = await newPact('Notify check');
    await contribute(p.id, sarah, 10_000);
    const item = find(await feed(p.id), 'contribution');
    await comment(p.id, item.id, david, 'First');
    await comment(p.id, item.id, abraham, 'Second');
    await comment(p.id, item.id, david, 'Third');
    const mine = ((await t.call('GET', '/notifications', sarah.accessToken)).body.items as { type: string; title: string; body: string; pactId: string }[]).filter((n) => n.type === 'comment' && n.pactId === p.id);
    assert.equal(mine.length, 1, 'three comments, one notification');
    assert.equal(mine[0].title, '3 new comments');
    assert.match(mine[0].body, /^On /);
    const own = ((await t.call('GET', '/notifications', david.accessToken)).body.items as { type: string; pactId: string }[]).filter((n) => n.type === 'comment' && n.pactId === p.id);
    assert.equal(own.length, 1, 'david hears about Abraham’s reply, not his own comments');
  });

  it('F: members who left and people outside cannot take part, even straight at the database', async () => {
    const p = await newPact('Left check');
    await contribute(p.id, sarah, 5_000);
    const item = find(await feed(p.id), 'contribution');
    assert.equal((await t.call('POST', `/pacts/${p.id}/leave`, david.accessToken, {})).status, 200);
    assert.equal((await comment(p.id, item.id, david, 'I left')).status, 404);
    assert.equal((await react(p.id, item.id, david, 'heart')).status, 404);
    await comment(p.id, item.id, sarah, 'Secret plan');
    if (t.db.driver === 'pglite') {
      const seen = async (who: Session) => t.db.asUser(who.user.id, async (q) => (await q.query('SELECT * FROM activity_comments WHERE pact_id = $1', [p.id])).rowCount);
      assert.equal(await seen(outsider), 0);
      assert.equal(await seen(invitee), 0);
      assert.equal(await seen(sarah), 1);
      await assert.rejects(t.db.asUser(sarah.user.id, (q) => q.query(`INSERT INTO activity_comments (pact_id, activity_id, user_id, body) VALUES ($1, $2, $3, 'direct')`, [p.id, item.id, sarah.user.id])));
      await assert.rejects(t.db.asUser(sarah.user.id, (q) => q.query(`UPDATE activities SET amount = 1 WHERE id = $1`, [item.id])), 'history can’t be edited by the app role');
    }
  });

  it('G: a closed Pact keeps its history readable but takes nothing new; a completed one takes comments, not updates', async () => {
    const p = await newPact('Closing check');
    await t.topUp(sarah.accessToken, 20_000);
    await contribute(p.id, sarah, 5_000);
    const item = find(await feed(p.id), 'contribution');
    await comment(p.id, item.id, david, 'Before it closed');
    const posted = await postUpdate(p.id, abraham, 'Heads up');
    const upd = posted.body.data.activities[0] as Item;
    assert.equal((await t.call('POST', `/pacts/${p.id}/cancel`, abraham.accessToken, { pin: PIN })).status, 200);

    const t1 = await thread(p.id, item.id, sarah);
    assert.equal(t1.status, 200, 'history stays readable');
    assert.equal(t1.body.data.comments.length, 1);
    assert.equal(t1.body.data.canReply, false);
    assert.ok((await feed(p.id, sarah)).length > 0);
    for (const res of [
      await comment(p.id, item.id, david, 'After'),
      await react(p.id, item.id, david, 'heart'),
      await postUpdate(p.id, abraham, 'More news'),
      await pinItem(p.id, abraham, upd.id),
      await t.call('DELETE', `/pacts/${p.id}/comments/${t1.body.data.comments[0].id}`, david.accessToken),
    ]) {
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'pact_closed');
    }

    // Completed: still a place for a lightweight comment, no new announcements.
    const c = await newPact('Completed check', 20_000_00);
    await contribute(c.id, abraham, 1_000);
    assert.equal((await t.call('POST', `/pacts/${c.id}/contributions`, abraham.accessToken, { amount: 19_000_00, pin: PIN })).status, 200);
    assert.equal((await t.call('POST', `/pacts/${c.id}/complete`, abraham.accessToken, { releaseRemaining: true, pin: PIN })).status, 200);
    const done = find(await feed(c.id), 'pact_completed');
    assert.equal((await comment(c.id, done.id, david, 'We did it!')).status, 200);
    assert.equal((await react(c.id, done.id, sarah, 'celebrate')).status, 200);
    const late = await postUpdate(c.id, abraham, 'New operational update');
    assert.equal(late.body.error.code, 'pact_completed');
  });

  it('analytics: the funnel sees conversation as shapes, never as text', async () => {
    await syncProductEvents(t.ctx);
    const rows = (await t.db.query<{ name: string; props: Record<string, unknown> }>(
      `SELECT name, props FROM product_events WHERE name IN ('pact_update_posted', 'activity_commented', 'activity_reacted', 'activity_pinned')`,
    )).rows;
    const names = new Set(rows.map((r) => r.name));
    for (const n of ['pact_update_posted', 'activity_commented', 'activity_reacted', 'activity_pinned']) assert.ok(names.has(n), n);
    const dump = JSON.stringify(rows);
    assert.ok(!/Civic Centre|Nice, almost|Friday|Secret plan|Done and dusted|Bus leaves/.test(dump), 'no comment or update text');
  });
});

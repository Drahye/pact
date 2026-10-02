import type { CommentDTO, ReactionKey, ThreadDTO, WithPeople } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { rowKey, track } from '../lib/events.js';
import { activitiesByIds, getPact, loadVisible, peopleByIds, type PactRow } from './pacts.js';
import { audit, notify, notifyGrouped } from './platform.js';

/**
 * Conversation around meaningful activity: comments, a few reactions, organiser updates and one pin.
 * It is attached to history, never part of it: the activity rows themselves are only ever read here.
 * Every write checks membership first; outsiders get a 404 so Pacts can't be probed.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Housekeeping that isn't worth discussing. */
const NOT_DISCUSSABLE = ['nudge', 'left'];
/** Not offered for pinning: routine joins and sign-ups would crowd out what matters. */
const NOT_PINNABLE = [...NOT_DISCUSSABLE, 'join', 'committed', 'created', 'co_organizer'];

const isClosed = (p: PactRow) => p.status === 'cancelled' || p.status === 'refunded';
const isCompleted = (p: PactRow) => !!p.completed_at || p.status === 'released';
const READ_ONLY = 'This Pact is closed, so its history is read-only.';

const isOrganiserRole = (role: string) => role === 'organizer' || role === 'co_organizer';
const snippet = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

/** A person who has joined (organisers included). Outsiders get a 404 from loadVisible; invitees are told to join. */
async function requireMember(q: Queryable, pactId: string, userId: string, lock = false) {
  if (!UUID.test(pactId)) throw notFound('Pact');
  const { pact, member } = await loadVisible(q, pactId, userId, lock);
  if (!member || member.status !== 'joined') throw forbidden('Join the Pact to take part in the conversation.');
  return { pact, member };
}

interface Item {
  id: string;
  type: string;
  actor_id: string | null;
  update_id: string | null;
  update_deleted: boolean;
  update_body: string | null;
}

async function loadItem(q: Queryable, pactId: string, activityId: string): Promise<Item> {
  if (!UUID.test(activityId)) throw notFound('Activity');
  const r = await q.query<Item>(
    `SELECT a.id, a.type, a.actor_id, a.update_id, (u.deleted_at IS NOT NULL) AS update_deleted, u.body AS update_body
       FROM activities a LEFT JOIN pact_updates u ON u.id = a.update_id WHERE a.id = $1 AND a.pact_id = $2`,
    [activityId, pactId],
  );
  const item = r.rows[0];
  if (!item || item.update_deleted) throw notFound('Activity');
  if (NOT_DISCUSSABLE.includes(item.type)) throw badRequest('not_discussable', 'There is nothing to discuss on this one.');
  return item;
}

/** What an item is, in a few words, for notifications. Never includes amounts or account details. */
const about = (item: Item) => {
  if (item.type === 'update') return `the update “${snippet(item.update_body ?? '', 40)}”`;
  const labels: Record<string, string> = {
    contribution: 'a contribution', guest_contribution: 'a contribution', task_done: 'a finished task', task_claimed: 'a task', task_added: 'a task',
    vendor_paid: 'a payment', completed: 'the funding', pact_completed: 'the finished Pact', released: 'the release', memory_added: 'the memory', milestone: 'a milestone',
  };
  return labels[item.type] ?? 'an update';
};

/* ---------- reading ---------- */

export async function getThread(ctx: Ctx, userId: string, pactId: string, activityId: string): Promise<{ data: ThreadDTO } & { people: WithPeople<unknown>['people'] }> {
  if (!UUID.test(pactId) || !UUID.test(activityId)) throw notFound('Activity');
  return ctx.db.asUser(userId, async (q) => {
    const p = (await q.query<PactRow>('SELECT * FROM pacts WHERE id = $1', [pactId])).rows[0];
    if (!p) throw notFound('Pact');
    const me = await q.query<{ status: string }>('SELECT status FROM pact_members WHERE pact_id = $1 AND user_id = $2', [pactId, userId]);
    if (me.rows[0]?.status !== 'joined') throw notFound('Pact');
    const [activity] = await activitiesByIds(q, [activityId], userId);
    if (!activity || activity.pactId !== pactId || NOT_DISCUSSABLE.includes(activity.type)) throw notFound('Activity');
    const rows = await q.query<{ id: string; user_id: string; body: string; created_at: Date; deleted_at: Date | null }>(
      'SELECT id, user_id, body, created_at, deleted_at FROM activity_comments WHERE activity_id = $1 ORDER BY created_at, id LIMIT 300',
      [activityId],
    );
    const comments: CommentDTO[] = rows.rows.map((c) => ({ id: c.id, activityId, userId: c.user_id, body: c.deleted_at ? '' : c.body, deleted: !!c.deleted_at, createdAt: c.created_at.toISOString() }));
    const thread: ThreadDTO = { activity, comments, canReply: !isClosed(p) };
    return { data: thread, people: await peopleByIds(q, [activity.actorId ?? '', ...comments.map((c) => c.userId)]) };
  });
}

/* ---------- comments ---------- */

export async function addComment(ctx: Ctx, userId: string, pactId: string, activityId: string, body: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const { pact } = await requireMember(q, pactId, userId);
    // Closed Pacts keep their history readable; a completed Pact still takes lightweight comments.
    if (isClosed(pact)) throw badRequest('pact_closed', READ_ONLY);
    const item = await loadItem(q, pactId, activityId);
    const inserted = await q.query<{ id: string }>('INSERT INTO activity_comments (pact_id, activity_id, user_id, body) VALUES ($1, $2, $3, $4) RETURNING id', [pactId, activityId, userId, body]);
    // Who hears about it: whoever the item is about, and everyone already talking, never the writer.
    const earlier = await q.query<{ user_id: string }>('SELECT DISTINCT user_id FROM activity_comments WHERE activity_id = $1 AND deleted_at IS NULL AND user_id <> $2', [activityId, userId]);
    const author = item.type === 'update' ? (await q.query<{ author_id: string }>('SELECT author_id FROM pact_updates WHERE id = $1', [item.update_id])).rows[0]?.author_id : item.actor_id;
    const who = new Set<string>([...earlier.rows.map((r) => r.user_id), ...(author ? [author] : [])]);
    who.delete(userId);
    const name = (await q.query<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [userId])).rows[0]?.first_name ?? 'Someone';
    await notifyThread(q, [...who], { pactId, activityId, pactTitle: pact.title, title: `${name} commented`, body: `${name}: ${snippet(body, 80)}`, about: about(item) });
    await audit(q, { actorId: userId, action: 'pact.comment_added', targetType: 'activity', targetId: activityId, ip: meta.ip, metadata: { comment: inserted.rows[0].id, length: body.length } });
  });
  return getThread(ctx, userId, pactId, activityId);
}

/** Your own comment, and only yours. It is hidden, not erased, so replies keep their place. */
export async function deleteComment(ctx: Ctx, userId: string, pactId: string, commentId: string, meta: ReqMeta) {
  if (!UUID.test(commentId)) throw notFound('Comment');
  const activityId = await ctx.db.tx(async (q) => {
    const { pact } = await requireMember(q, pactId, userId);
    if (isClosed(pact)) throw badRequest('pact_closed', READ_ONLY);
    const c = (await q.query<{ activity_id: string; user_id: string; deleted_at: Date | null }>('SELECT activity_id, user_id, deleted_at FROM activity_comments WHERE id = $1 AND pact_id = $2 FOR UPDATE', [commentId, pactId])).rows[0];
    if (!c) throw notFound('Comment');
    if (c.user_id !== userId) throw forbidden('You can only remove your own comments.');
    if (!c.deleted_at) await q.query('UPDATE activity_comments SET deleted_at = now() WHERE id = $1', [commentId]);
    await audit(q, { actorId: userId, action: 'pact.comment_removed', targetType: 'activity', targetId: c.activity_id, ip: meta.ip });
    return c.activity_id;
  });
  return getThread(ctx, userId, pactId, activityId);
}

/* ---------- reactions ---------- */

/** Sets or clears one reaction. Setting it twice is a no-op, so a double tap can't count twice. Nobody is notified. */
export async function react(ctx: Ctx, userId: string, pactId: string, activityId: string, reaction: ReactionKey, on: boolean) {
  await ctx.db.tx(async (q) => {
    const { pact } = await requireMember(q, pactId, userId);
    if (isClosed(pact)) throw badRequest('pact_closed', READ_ONLY);
    await loadItem(q, pactId, activityId);
    if (on) await q.query('INSERT INTO activity_reactions (pact_id, activity_id, user_id, reaction) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [pactId, activityId, userId, reaction]);
    else await q.query('DELETE FROM activity_reactions WHERE activity_id = $1 AND user_id = $2 AND reaction = $3', [activityId, userId, reaction]);
  });
  return getThread(ctx, userId, pactId, activityId);
}

/* ---------- organiser updates ---------- */

export async function postUpdate(ctx: Ctx, userId: string, pactId: string, body: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const { pact, member } = await requireMember(q, pactId, userId);
    if (!isOrganiserRole(member.role)) throw forbidden('Only organisers can post updates.');
    if (isClosed(pact)) throw badRequest('pact_closed', READ_ONLY);
    // Updates are for running the plan. Once it has happened, the group can still comment, but nothing new is announced.
    if (isCompleted(pact)) throw badRequest('pact_completed', 'This Pact is completed, so there is nothing new to announce.');
    const u = await q.query<{ id: string }>('INSERT INTO pact_updates (pact_id, author_id, body) VALUES ($1, $2, $3) RETURNING id', [pactId, userId, body]);
    const act = await q.query<{ id: string }>(`INSERT INTO activities (pact_id, actor_id, type, update_id) VALUES ($1, $2, 'update', $3) RETURNING id`, [pactId, userId, u.rows[0].id]);
    const members = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined' AND user_id <> $2`, [pactId, userId]);
    const name = (await q.query<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [userId])).rows[0]?.first_name ?? 'The organiser';
    await notify(q, members.rows.map((m) => m.user_id), { type: 'update', title: `${name} posted an update in ${pact.title}`, body: snippet(body, 120), pactId, refId: act.rows[0].id, push: `${name} posted an update in ${pact.title}.` });
    await audit(q, { actorId: userId, action: 'pact.update_posted', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { length: body.length } });
  });
  return getPact(ctx, userId, pactId);
}

/** The author removes their own update. The stream item and any pin go with it; system activity is never touched. */
export async function deleteUpdate(ctx: Ctx, userId: string, pactId: string, activityId: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const { member } = await requireMember(q, pactId, userId, true);
    if (!isOrganiserRole(member.role)) throw forbidden('Only organisers can remove updates.');
    if (!UUID.test(activityId)) throw notFound('Update');
    const a = (await q.query<{ type: string; actor_id: string | null; update_id: string | null }>('SELECT type, actor_id, update_id FROM activities WHERE id = $1 AND pact_id = $2', [activityId, pactId])).rows[0];
    if (!a) throw notFound('Update');
    // Only manual updates can be removed. Everything else is history.
    if (a.type !== 'update' || !a.update_id) throw forbidden('Automatic activity can’t be removed. It is the record of what happened.');
    if (a.actor_id !== userId) throw forbidden('You can only remove updates you posted.');
    await q.query('UPDATE pact_updates SET deleted_at = COALESCE(deleted_at, now()) WHERE id = $1', [a.update_id]);
    await q.query('UPDATE pacts SET pinned_activity_id = NULL, pinned_by = NULL, pinned_at = NULL WHERE id = $1 AND pinned_activity_id = $2', [pactId, activityId]);
    await audit(q, { actorId: userId, action: 'pact.update_removed', targetType: 'pact', targetId: pactId, ip: meta.ip });
  });
  return getPact(ctx, userId, pactId);
}

/* ---------- pinning ---------- */

/** One pinned item per Pact. Pinning replaces the previous pin; the old item stays in the feed. `null` clears it. */
export async function pin(ctx: Ctx, userId: string, pactId: string, activityId: string | null, meta: ReqMeta) {
  const pinnedType = await ctx.db.tx(async (q) => {
    const { pact, member } = await requireMember(q, pactId, userId, true);
    if (!isOrganiserRole(member.role)) throw forbidden('Only organisers can pin.');
    if (isClosed(pact)) throw badRequest('pact_closed', READ_ONLY);
    if (activityId === null) {
      await q.query('UPDATE pacts SET pinned_activity_id = NULL, pinned_by = NULL, pinned_at = NULL WHERE id = $1', [pactId]);
      await audit(q, { actorId: userId, action: 'pact.unpinned', targetType: 'pact', targetId: pactId, ip: meta.ip });
      return null;
    }
    const item = await loadItem(q, pactId, activityId);
    if (NOT_PINNABLE.includes(item.type)) throw badRequest('not_pinnable', 'That kind of activity can’t be pinned.');
    await q.query('UPDATE pacts SET pinned_activity_id = $2, pinned_by = $3, pinned_at = now() WHERE id = $1', [pactId, activityId, userId]);
    const name = (await q.query<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [userId])).rows[0]?.first_name ?? 'Someone';
    const members = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined' AND user_id <> $2`, [pactId, userId]);
    await notify(q, members.rows.map((m) => m.user_id), { type: 'pinned', title: `${name} pinned something in ${pact.title}`, body: item.type === 'update' ? snippet(item.update_body ?? '', 100) : `Pinned: ${about(item)}`, pactId, refId: activityId, push: `Something was pinned in ${pact.title}.` });
    await audit(q, { actorId: userId, action: 'pact.pinned', targetType: 'activity', targetId: activityId, ip: meta.ip });
    return item.type === 'update' ? ('update' as const) : ('system' as const);
  });
  if (pinnedType) {
    // Pins leave no row of their own to read events from, so this one is recorded directly (never throws).
    await track(ctx.db, ctx.config, 'activity_pinned', { userId, pactId, props: { kind: pinnedType }, key: `ap:${rowKey(ctx.config, 'pin', `${pactId}:${activityId}:${Date.now()}`)}` });
  }
  return getPact(ctx, userId, pactId);
}

/* ---------- notifications ---------- */

/**
 * One notification per thread per person while it is unread: more comments grow its count instead of piling up,
 * and the push goes out only for the first. Reactions never notify.
 */
async function notifyThread(q: Queryable, userIds: string[], n: { pactId: string; activityId: string; pactTitle: string; title: string; body: string; about: string }) {
  await notifyGrouped(q, userIds, {
    type: 'comment',
    pactId: n.pactId,
    refId: n.activityId,
    first: { title: n.title, body: n.body },
    many: (count) => ({ title: `${count} new comments`, body: `On ${n.about}` }),
    push: `There’s a new comment in ${n.pactTitle}.`,
  });
}


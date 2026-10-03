import type { CircleDTO, CircleInvitePreviewDTO, CircleSummaryDTO, CircleTint, WithPeople } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { randomToken } from '../lib/crypto.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { track, visitorId } from '../lib/events.js';
import { peopleByIds } from './pacts.js';
import { liveSignals } from './asks.js';
import { planSignals } from './plans.js';
import { splitSignals } from './splits.js';
import { audit } from './platform.js';

/**
 * Circles: the people someone regularly makes things happen with. Light on purpose: a name, an emoji, a colour,
 * who is in it, and a link to bring people in. Every write checks membership first and answers 404 (not 403) to
 * outsiders, so a guessed id tells nobody anything. Invite tokens are 32 random bytes and only members ever see one.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const MAX_MEMBERS = 100;
const MAX_OWNED = 20;
const AVATARS = 4;

interface CircleRow {
  id: string;
  name: string;
  emoji: string;
  tint: CircleTint;
  created_by: string;
  created_at: Date;
}
interface MemberRow {
  circle_id: string;
  user_id: string;
  role: 'owner' | 'member';
  status: 'invited' | 'joined' | 'left';
  joined_at: Date | null;
  created_at: Date;
}

const gone = () => notFound('That Circle');

/** The Circle, if the person is in it. Outsiders and people who left get a 404. */
async function loadAsMember(q: Queryable, circleId: string, userId: string, lock = false) {
  if (!UUID.test(circleId)) throw gone();
  const c = await q.query<CircleRow>(`SELECT * FROM circles WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [circleId]);
  const m = await q.query<MemberRow>('SELECT * FROM circle_members WHERE circle_id = $1 AND user_id = $2', [circleId, userId]);
  if (!c.rows[0] || !m.rows[0] || m.rows[0].status !== 'joined') throw gone();
  return { circle: c.rows[0], member: m.rows[0] };
}

const requireOwner = (member: MemberRow) => {
  if (member.role !== 'owner') throw new AppError(403, 'owner_only', 'Only the person who started this Circle can do that.');
};

function summary(c: CircleRow, role: 'owner' | 'member', ids: string[], count: number): CircleSummaryDTO {
  return { id: c.id, name: c.name, emoji: c.emoji, tint: c.tint, memberCount: count, memberIds: ids.slice(0, AVATARS), role, live: null };
}

/* ------------------------------------------------------------------ reads */

export async function listCircles(ctx: Ctx, userId: string): Promise<WithPeople<CircleSummaryDTO[]>> {
  return ctx.db.asUser(userId, async (q) => {
    const r = await q.query<CircleRow & { role: 'owner' | 'member'; ids: string[]; n: number }>(
      `SELECT c.*, mine.role,
              (SELECT array_agg(x.user_id ORDER BY x.joined_at, x.user_id) FROM circle_members x WHERE x.circle_id = c.id AND x.status = 'joined') AS ids,
              (SELECT COUNT(*)::int FROM circle_members x WHERE x.circle_id = c.id AND x.status = 'joined') AS n
         FROM circles c JOIN circle_members mine ON mine.circle_id = c.id AND mine.user_id = $1 AND mine.status = 'joined'
        ORDER BY c.updated_at DESC, c.created_at DESC LIMIT 100`,
      [userId],
    );
    const circleIds = r.rows.map((c) => c.id);
    const [asks, plans, splits] = await Promise.all([liveSignals(ctx, q, userId, circleIds), planSignals(ctx, q, userId, circleIds), splitSignals(ctx, q, userId, circleIds)]);
    // One line per Circle: something waiting on me first (a question or a plan), then the plan coming up, then the freshest question.
    const pick = (id: string) => {
      const a = asks.get(id);
      const p = plans.get(id);
      const x = splits.get(id);
      return a?.needsYou ? a : p?.needsYou ? p : x?.needsYou ? x : p ?? x ?? a ?? null;
    };
    const data = r.rows.map((c) => ({ ...summary(c, c.role, c.ids ?? [], c.n), live: pick(c.id) }));
    return { data, people: await peopleByIds(q, data.flatMap((c) => c.memberIds)) };
  });
}

export async function getCircle(ctx: Ctx, userId: string, circleId: string): Promise<WithPeople<CircleDTO>> {
  if (!UUID.test(circleId)) throw gone();
  const out = await ctx.db.asUser(userId, async (q) => {
    const c = await q.query<CircleRow>('SELECT * FROM circles WHERE id = $1', [circleId]);
    if (!c.rows[0]) throw gone();
    const ms = await q.query<MemberRow>(`SELECT * FROM circle_members WHERE circle_id = $1 AND status = 'joined' ORDER BY (role = 'owner') DESC, joined_at, user_id`, [circleId]);
    const mine = ms.rows.find((m) => m.user_id === userId);
    if (!mine) throw gone();
    const pacts = await q.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pacts p JOIN pact_members m ON m.pact_id = p.id AND m.user_id = $2 AND m.status IN ('joined', 'invited') WHERE p.circle_id = $1`,
      [circleId, userId],
    );
    const activity = [
      ...ms.rows.filter((m) => m.role !== 'owner' && m.joined_at).map((m) => ({ type: 'joined' as const, actorId: m.user_id, at: m.joined_at!.toISOString() })),
      { type: 'created' as const, actorId: c.rows[0].created_by, at: c.rows[0].created_at.toISOString() },
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20);
    const dto: CircleDTO = {
      ...summary(c.rows[0], mine.role, ms.rows.map((m) => m.user_id), ms.rows.length),
      members: ms.rows.map((m) => ({ userId: m.user_id, role: m.role, joinedAt: m.joined_at?.toISOString() ?? null })),
      activity,
      invite: null,
      pactCount: pacts.rows[0].n,
    };
    return { data: dto, people: await peopleByIds(q, [...ms.rows.map((m) => m.user_id), c.rows[0].created_by]) };
  });
  // The invite link is service-only data (the app role has no grant on it): members receive the live token, nobody else can.
  // Read after the person-scoped transaction ends, never inside it.
  const inv = await ctx.db.query<{ token: string }>(
    `SELECT token FROM circle_invites WHERE circle_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC LIMIT 1`,
    [circleId],
  );
  out.data.invite = inv.rows[0] ? { token: inv.rows[0].token } : null;
  return out;
}

/* --------------------------------------------------------------- commands */

export async function createCircle(ctx: Ctx, userId: string, input: { name: string; emoji: string; tint: CircleTint }, meta: ReqMeta) {
  const id = await ctx.db.tx(async (q) => {
    const owned = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM circle_members WHERE user_id = $1 AND role = 'owner' AND status = 'joined'`, [userId]);
    if (owned.rows[0].n >= MAX_OWNED) throw badRequest('too_many_circles', 'You’ve started a lot of Circles already. Leave one before starting another.');
    const c = await q.query<{ id: string }>('INSERT INTO circles (name, emoji, tint, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [input.name, input.emoji, input.tint, userId]);
    const circleId = c.rows[0].id;
    await q.query(`INSERT INTO circle_members (circle_id, user_id, role, status, joined_at) VALUES ($1, $2, 'owner', 'joined', now())`, [circleId, userId]);
    await audit(q, { actorId: userId, action: 'circle.created', targetType: 'circle', targetId: circleId, ip: meta.ip });
    await track(q, ctx.config, 'circle_created', { userId, key: `cc:${circleId}`, props: {} }, true);
    return circleId;
  });
  return getCircle(ctx, userId, id);
}

export async function updateCircle(ctx: Ctx, userId: string, circleId: string, patch: { name?: string; emoji?: string; tint?: CircleTint }, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const { member } = await loadAsMember(q, circleId, userId, true);
    requireOwner(member);
    await q.query('UPDATE circles SET name = COALESCE($2, name), emoji = COALESCE($3, emoji), tint = COALESCE($4, tint), updated_at = now() WHERE id = $1', [circleId, patch.name ?? null, patch.emoji ?? null, patch.tint ?? null]);
    await audit(q, { actorId: userId, action: 'circle.updated', targetType: 'circle', targetId: circleId, ip: meta.ip });
  });
  return getCircle(ctx, userId, circleId);
}

export async function leaveCircle(ctx: Ctx, userId: string, circleId: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const { member } = await loadAsMember(q, circleId, userId, true);
    if (member.role === 'owner') {
      const others = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM circle_members WHERE circle_id = $1 AND status = 'joined' AND user_id <> $2`, [circleId, userId]);
      if (others.rows[0].n > 0) throw badRequest('owner_cannot_leave', 'You started this Circle, so it stays with you while other people are in it. Remove them first, or keep it.');
    }
    await q.query(`UPDATE circle_members SET status = 'left' WHERE circle_id = $1 AND user_id = $2`, [circleId, userId]);
    // A Circle with nobody left is no longer reachable; its links must not keep working.
    if (member.role === 'owner') await q.query('UPDATE circle_invites SET revoked_at = now() WHERE circle_id = $1 AND revoked_at IS NULL', [circleId]);
    await audit(q, { actorId: userId, action: 'circle.left', targetType: 'circle', targetId: circleId, ip: meta.ip });
  });
  return { ok: true };
}

export async function removeMember(ctx: Ctx, userId: string, circleId: string, targetId: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const { member } = await loadAsMember(q, circleId, userId, true);
    requireOwner(member);
    if (!UUID.test(targetId) || targetId === userId) throw badRequest('invalid_member', 'You can’t remove yourself. Leave the Circle instead.');
    const r = await q.query(`UPDATE circle_members SET status = 'left' WHERE circle_id = $1 AND user_id = $2 AND status = 'joined' AND role = 'member'`, [circleId, targetId]);
    if (!r.rowCount) throw notFound('That person');
    await audit(q, { actorId: userId, action: 'circle.member_removed', targetType: 'circle', targetId: circleId, ip: meta.ip });
  });
  return getCircle(ctx, userId, circleId);
}

/** The Circle's live invite link, made if there isn't one. Any member may share it; the owner can reset it. */
export async function ensureInvite(ctx: Ctx, userId: string, circleId: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const { member } = await loadAsMember(q, circleId, userId, true);
    const live = await q.query(`SELECT 1 FROM circle_invites WHERE circle_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`, [circleId]);
    if (live.rowCount) return;
    await q.query('INSERT INTO circle_invites (circle_id, token, created_by) VALUES ($1, $2, $3)', [circleId, randomToken(32), userId]);
    await audit(q, { actorId: userId, action: 'circle.invite_created', targetType: 'circle', targetId: circleId, ip: meta.ip });
    await track(q, ctx.config, 'circle_invite_created', { userId, props: { role: member.role } }, true);
  });
  return getCircle(ctx, userId, circleId);
}

/** Owner only: turns the old link off and makes a fresh one. */
export async function resetInvite(ctx: Ctx, userId: string, circleId: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const { member } = await loadAsMember(q, circleId, userId, true);
    requireOwner(member);
    await q.query('UPDATE circle_invites SET revoked_at = now() WHERE circle_id = $1 AND revoked_at IS NULL', [circleId]);
    await q.query('INSERT INTO circle_invites (circle_id, token, created_by) VALUES ($1, $2, $3)', [circleId, randomToken(32), userId]);
    await audit(q, { actorId: userId, action: 'circle.invite_reset', targetType: 'circle', targetId: circleId, ip: meta.ip });
    await track(q, ctx.config, 'circle_invite_created', { userId, props: { role: 'owner' } }, true);
  });
  return getCircle(ctx, userId, circleId);
}

/* ---------------------------------------------------------------- invites */

interface InviteRow {
  id: string;
  circle_id: string;
  created_by: string;
  expires_at: Date | null;
  revoked_at: Date | null;
}

const inviteState = (i: InviteRow, now: Date): 'valid' | 'revoked' | 'expired' => (i.revoked_at ? 'revoked' : i.expires_at && i.expires_at <= now ? 'expired' : 'valid');
const badLink = (state: 'revoked' | 'expired') =>
  new AppError(410, `invite_${state}`, state === 'revoked' ? 'This invite link was turned off. Ask for a new one.' : 'This invite link has expired. Ask for a new one.');

/** What a link is for, shown before anyone signs in. Says nothing about a Circle whose link no longer works. */
export async function previewInvite(ctx: Ctx, token: string, req: ReqMeta): Promise<CircleInvitePreviewDTO> {
  if (!TOKEN.test(token)) throw notFound('That invite');
  const r = await ctx.db.query<InviteRow & CircleRow & { n: number; first_name: string; color: string; photo_url: string | null }>(
    `SELECT i.id, i.circle_id, i.created_by, i.expires_at, i.revoked_at, c.name, c.emoji, c.tint, c.created_at,
            (SELECT COUNT(*)::int FROM circle_members m WHERE m.circle_id = c.id AND m.status = 'joined') AS n,
            u.first_name, u.color, u.photo_url
       FROM circle_invites i JOIN circles c ON c.id = i.circle_id JOIN users u ON u.id = i.created_by
      WHERE i.token = $1`,
    [token],
  );
  const i = r.rows[0];
  if (!i) throw notFound('That invite');
  const state = inviteState(i, ctx.now());
  // One event per visitor per day. The visitor is a daily pseudonym; the address and browser are never stored.
  const day = ctx.now().toISOString().slice(0, 10);
  const who = visitorId(ctx.config, req.ip, req.userAgent, day);
  await track(ctx.db, ctx.config, 'circle_invite_opened', { actor: who, key: `ciov:${who}:${state}`, props: { state } });
  if (state !== 'valid') throw badLink(state);
  if (i.n <= 0) throw notFound('That invite');
  return { circleId: i.circle_id, name: i.name, emoji: i.emoji, tint: i.tint, memberCount: i.n, inviter: { firstName: i.first_name, color: i.color, photoUrl: i.photo_url } };
}

export async function joinByToken(ctx: Ctx, userId: string, token: string, meta: ReqMeta, fromAsk?: string, fromPlan?: string, fromSplit?: string) {
  if (!TOKEN.test(token)) throw notFound('That invite');
  const circleId = await ctx.db.tx(async (q) => {
    const r = await q.query<InviteRow>('SELECT * FROM circle_invites WHERE token = $1', [token]);
    const i = r.rows[0];
    if (!i) throw notFound('That invite');
    const state = inviteState(i, ctx.now());
    if (state !== 'valid') throw badLink(state);
    await q.query('SELECT 1 FROM circles WHERE id = $1 FOR UPDATE', [i.circle_id]);
    const m = await q.query<MemberRow>('SELECT * FROM circle_members WHERE circle_id = $1 AND user_id = $2', [i.circle_id, userId]);
    if (m.rows[0]?.status === 'joined') return i.circle_id; // already in: just take them there
    const n = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM circle_members WHERE circle_id = $1 AND status = 'joined'`, [i.circle_id]);
    if (n.rows[0].n >= MAX_MEMBERS) throw badRequest('circle_full', 'This Circle is full.');
    if (m.rows[0]) await q.query(`UPDATE circle_members SET status = 'joined', joined_at = now() WHERE circle_id = $1 AND user_id = $2`, [i.circle_id, userId]);
    else await q.query(`INSERT INTO circle_members (circle_id, user_id, role, status, joined_at) VALUES ($1, $2, 'member', 'joined', now())`, [i.circle_id, userId]);
    await q.query('UPDATE circles SET updated_at = now() WHERE id = $1', [i.circle_id]);
    await audit(q, { actorId: userId, action: 'circle.joined', targetType: 'circle', targetId: i.circle_id, ip: meta.ip });
    await track(q, ctx.config, 'circle_joined', { userId, askId: fromAsk ?? null, planId: fromPlan ?? null, key: `cj:${i.circle_id}:${userId}`, props: { via: 'link', from_ask: !!fromAsk } }, true);
    if (fromSplit) await track(q, ctx.config, 'circle_joined_from_split', { userId, splitId: fromSplit, key: `cjs:${i.circle_id}:${userId}`, props: {} }, true);
    return i.circle_id;
  });
  return getCircle(ctx, userId, circleId);
}

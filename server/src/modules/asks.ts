import type { AskDTO, AskSummaryDTO, Attendance, CircleTint, PersonDTO } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { keyedHash, randomToken } from '../lib/crypto.js';
import { AppError, badRequest, forbidden, notFound, tooMany } from '../lib/errors.js';
import { track, visitorId } from '../lib/events.js';
import { joinByToken } from './circles.js';
import { audit, notify, notifyGrouped } from './platform.js';

/**
 * Ask the group: a quick question in a Circle, answered in a tap. Two kinds, "choice" and "Who's in?".
 *
 * Who may do what, decided here and never by the client:
 *   - Circle members create Asks, answer them, see who answered what, and close the ones they started.
 *   - Anyone holding the Ask's share link can read it and, once signed in, answer it. The link is the capability,
 *     like a Pact invite; the creator can turn it off. Answering never adds anyone to the Circle.
 *   - There is no guest identity: an answer is always a signed-in person's, one per person per Ask.
 * Outsiders and guessed ids get a 404. Link visitors see first names and avatars only, never last names or phone numbers.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const MAX_OPEN_PER_CIRCLE = 20;

interface AskRow {
  id: string;
  circle_id: string;
  plan_id: string | null;
  type: 'choice' | 'attendance';
  title: string;
  created_by: string;
  status: 'open' | 'closed';
  share_token: string;
  share_revoked_at: Date | null;
  closes_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
  cname: string;
  cemoji: string;
  ctint: CircleTint;
}

const SELECT = `SELECT a.*, c.name AS cname, c.emoji AS cemoji, c.tint AS ctint FROM asks a JOIN circles c ON c.id = a.circle_id`;
const gone = () => notFound('That question');
const isClosed = (a: AskRow, now: Date) => a.status === 'closed' || (!!a.closes_at && a.closes_at <= now);

/** First names, avatars and colours: all a Circle member or link holder ever learns about another person. */
export async function minimalPeople(q: Queryable, ids: string[]): Promise<PersonDTO[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const r = await q.query<{ id: string; first_name: string; color: string; tint: PersonDTO['tint']; photo_url: string | null }>(
    `SELECT id, first_name, color, tint, photo_url FROM users WHERE id = ANY($1::uuid[])`,
    [unique],
  );
  return r.rows.map((u) => ({ id: u.id, firstName: u.first_name, lastName: '', color: u.color, tint: u.tint, photoUrl: u.photo_url }));
}

/**
 * What a link visitor who is not in the Circle gets: the same shape, but every person other than themselves is an opaque,
 * per-link alias. First names and colours still show; no account id leaves the server, and the same person has a different
 * alias on every link, so ids cannot be matched across pages.
 */
export function aliasPeople<T extends { data: unknown; people: PersonDTO[] }>(ctx: Ctx, token: string, keep: string | null, out: T, extraIds: string[] = []): T {
  const alias = (id: string) => {
    const h = Buffer.from(keyedHash(ctx.config.HASH_SECRET, `alias:${token}:${id}`), 'base64url').toString('hex').slice(0, 32);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  };
  const ids = [...new Set([...out.people.map((p) => p.id), ...extraIds])].filter((id) => id && id !== keep);
  if (!ids.length) return out;
  const map = new Map(ids.map((id) => [id, alias(id)]));
  const text = JSON.stringify(out).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => map.get(m) ?? m);
  return JSON.parse(text) as T;
}

const isMember = async (q: Queryable, circleId: string, userId: string) =>
  !!(await q.query(`SELECT 1 FROM circle_members WHERE circle_id = $1 AND user_id = $2 AND status = 'joined'`, [circleId, userId])).rowCount;

/* ---------------------------------------------------------------- building answers */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function headline(a: AskRow, closed: boolean, opts: { label: string; count: number }[], att: { in: number; maybe: number; out: number }, total: number): string {
  if (a.type === 'attendance') {
    const bits = [`${att.in} in`, ...(att.maybe ? [`${att.maybe} maybe`] : []), ...(closed && att.out ? [`${att.out} can’t`] : [])];
    return closed ? `${bits.join(' · ')} · Responses closed` : total ? bits.join(' · ') : 'No answers yet';
  }
  const top = Math.max(0, ...opts.map((o) => o.count));
  const leaders = opts.filter((o) => o.count === top && top > 0);
  if (!total) return closed ? 'Closed with no votes' : 'No votes yet';
  if (leaders.length === 1) return closed ? `${leaders[0].label} won with ${plural(top, 'vote', 'votes')}` : `${leaders[0].label} is winning`;
  return closed ? `Tied between ${leaders.map((l) => l.label).join(' and ')}` : `${leaders.length > 1 ? 'Tied' : 'No votes yet'}`;
}

interface Built {
  dto: AskDTO;
  peopleIds: string[];
}

/** Everything one screen needs, in a handful of queries however many Asks there are. */
async function build(ctx: Ctx, q: Queryable, rows: AskRow[], viewerId: string | null, viewerIsMember: (circleId: string) => boolean, detail: boolean): Promise<Built[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const circles = [...new Set(rows.map((r) => r.circle_id))];
  const now = ctx.now();
  const [opts, att, tot, members, mine] = await Promise.all([
    q.query<{ id: string; ask_id: string; label: string; n: number }>(
      `SELECT o.id, o.ask_id, o.label, COUNT(r.id)::int AS n FROM ask_options o LEFT JOIN ask_responses r ON r.option_id = o.id WHERE o.ask_id = ANY($1::uuid[]) GROUP BY o.id ORDER BY o.ask_id, o.position`,
      [ids],
    ),
    q.query<{ ask_id: string; attendance: Attendance; n: number }>(`SELECT ask_id, attendance, COUNT(*)::int AS n FROM ask_responses WHERE ask_id = ANY($1::uuid[]) AND attendance IS NOT NULL GROUP BY ask_id, attendance`, [ids]),
    q.query<{ ask_id: string; n: number }>(`SELECT ask_id, COUNT(*)::int AS n FROM ask_responses WHERE ask_id = ANY($1::uuid[]) GROUP BY ask_id`, [ids]),
    q.query<{ circle_id: string; n: number }>(`SELECT circle_id, COUNT(*)::int AS n FROM circle_members WHERE circle_id = ANY($1::uuid[]) AND status = 'joined' GROUP BY circle_id`, [circles]),
    viewerId
      ? q.query<{ ask_id: string; option_id: string | null; attendance: Attendance | null }>(`SELECT ask_id, option_id, attendance FROM ask_responses WHERE ask_id = ANY($1::uuid[]) AND user_id = $2`, [ids, viewerId])
      : Promise.resolve({ rows: [] as { ask_id: string; option_id: string | null; attendance: Attendance | null }[] }),
  ]);
  let responders: { ask_id: string; user_id: string; option_id: string | null; attendance: Attendance | null; at: Date }[] = [];
  let activity: { ask_id: string; user_id: string; kind: 'responded' | 'changed' | 'closed'; option_id: string | null; attendance: Attendance | null; at: Date }[] = [];
  let waiting: { ask_id: string; user_id: string }[] = [];
  if (detail) {
    responders = (await q.query(`SELECT ask_id, user_id, option_id, attendance, updated_at AS at FROM ask_responses WHERE ask_id = ANY($1::uuid[]) ORDER BY updated_at DESC`, [ids])).rows as typeof responders;
    activity = (await q.query(`SELECT ask_id, user_id, kind, option_id, attendance, created_at AS at FROM ask_activity WHERE ask_id = ANY($1::uuid[]) ORDER BY created_at DESC LIMIT 60`, [ids])).rows as typeof activity;
    const memberRows = rows.filter((r) => viewerIsMember(r.circle_id));
    if (memberRows.length) {
      waiting = (
        await q.query(
          `SELECT a.id AS ask_id, m.user_id FROM asks a JOIN circle_members m ON m.circle_id = a.circle_id AND m.status = 'joined'
            WHERE a.id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM ask_responses r WHERE r.ask_id = a.id AND r.user_id = m.user_id)`,
          [memberRows.map((r) => r.id)],
        )
      ).rows as typeof waiting;
    }
  }
  return rows.map((a) => {
    const options = opts.rows.filter((o) => o.ask_id === a.id).map((o) => ({ id: o.id, label: o.label, count: o.n }));
    const counts = { in: 0, maybe: 0, out: 0 };
    for (const r of att.rows) if (r.ask_id === a.id) counts[r.attendance] = r.n;
    const total = tot.rows.find((t) => t.ask_id === a.id)?.n ?? 0;
    const closed = isClosed(a, now);
    const member = viewerId ? viewerIsMember(a.circle_id) : false;
    const my = mine.rows.find((m) => m.ask_id === a.id);
    const myResp = detail ? responders.filter((r) => r.ask_id === a.id) : [];
    const dto: AskDTO = {
      id: a.id,
      planId: a.plan_id,
      circleId: a.circle_id,
      circle: { name: a.cname, emoji: a.cemoji, tint: a.ctint },
      type: a.type,
      title: a.title,
      status: closed ? 'closed' : 'open',
      responseCount: total,
      memberCount: members.rows.find((m) => m.circle_id === a.circle_id)?.n ?? 0,
      answered: !!my,
      headline: headline(a, closed, options, counts, total),
      createdAt: a.created_at.toISOString(),
      createdBy: a.created_by,
      closedAt: a.closed_at?.toISOString() ?? null,
      options,
      attendance: counts,
      responders: myResp.map((r) => ({ userId: r.user_id, optionId: r.option_id, attendance: r.attendance, at: new Date(r.at).toISOString() })),
      waiting: member ? waiting.filter((w) => w.ask_id === a.id).map((w) => w.user_id) : [],
      activity: activity.filter((x) => x.ask_id === a.id).slice(0, 12).map((x) => ({ kind: x.kind, userId: x.user_id, optionId: x.option_id, attendance: x.attendance, at: new Date(x.at).toISOString() })),
      mine: my ? { optionId: my.option_id, attendance: my.attendance } : null,
      isMember: member,
      canClose: member && !closed && a.created_by === viewerId,
      shareToken: member && !a.share_revoked_at ? a.share_token : null,
    };
    const peopleIds = [a.created_by, ...dto.responders.map((r) => r.userId), ...dto.activity.map((x) => x.userId), ...dto.waiting];
    return { dto, peopleIds };
  });
}

const summary = (d: AskDTO): AskSummaryDTO => ({ id: d.id, planId: d.planId, circleId: d.circleId, circle: d.circle, type: d.type, title: d.title, status: d.status, responseCount: d.responseCount, memberCount: d.memberCount, answered: d.answered, headline: d.headline, createdAt: d.createdAt });

/* ---------------------------------------------------------------- reads */

async function loadForMember(q: Queryable, askId: string, userId: string): Promise<AskRow> {
  if (!UUID.test(askId)) throw gone();
  const a = (await q.query<AskRow>(`${SELECT} WHERE a.id = $1`, [askId])).rows[0];
  if (!a || !(await isMember(q, a.circle_id, userId))) throw gone();
  return a;
}

export async function getAsk(ctx: Ctx, userId: string, askId: string, from?: 'circle' | 'home') {
  const a = await loadForMember(ctx.db, askId, userId);
  const [b] = await build(ctx, ctx.db, [a], userId, () => true, true);
  if (from) await track(ctx.db, ctx.config, 'ask_opened', { userId, askId, key: `ao:${userId}:${askId}:${ctx.now().toISOString().slice(0, 10)}`, props: { type: a.type, from, state: b.dto.status } });
  return { data: b.dto, people: await minimalPeople(ctx.db, b.peopleIds) };
}

export async function listCircleAsks(ctx: Ctx, userId: string, circleId: string) {
  if (!UUID.test(circleId) || !(await isMember(ctx.db, circleId, userId))) throw notFound('That Circle');
  const rows = (
    await ctx.db.query<AskRow>(
      `${SELECT} WHERE a.circle_id = $1 ORDER BY (a.status = 'open') DESC, a.created_at DESC LIMIT 20`,
      [circleId],
    )
  ).rows;
  const built = await build(ctx, ctx.db, rows, userId, () => true, false);
  return { data: built.map((b) => summary(b.dto)), people: [] as PersonDTO[] };
}

/** Open questions in my Circles that I haven't answered and didn't ask. What Home shows under "needs you". */
export async function needsYou(ctx: Ctx, userId: string) {
  const rows = (
    await ctx.db.query<AskRow>(
      `${SELECT} JOIN circle_members me ON me.circle_id = a.circle_id AND me.user_id = $1 AND me.status = 'joined'
        WHERE a.status = 'open' AND (a.closes_at IS NULL OR a.closes_at > now()) AND a.created_by <> $1
          AND NOT EXISTS (SELECT 1 FROM ask_responses r WHERE r.ask_id = a.id AND r.user_id = $1)
        ORDER BY a.created_at DESC LIMIT 5`,
      [userId],
    )
  ).rows;
  const built = await build(ctx, ctx.db, rows, userId, () => true, false);
  return { data: built.map((b) => summary(b.dto)), people: [] as PersonDTO[] };
}

/** One live line per Circle for the Circles list: something needing me first, otherwise the freshest open question. */
export async function liveSignals(ctx: Ctx, q: Queryable, userId: string, circleIds: string[]) {
  const out = new Map<string, { text: string; needsYou: boolean }>();
  if (!circleIds.length) return out;
  const rows = (await q.query<AskRow>(`${SELECT} WHERE a.circle_id = ANY($1::uuid[]) AND a.status = 'open' AND (a.closes_at IS NULL OR a.closes_at > now()) ORDER BY a.created_at DESC LIMIT 200`, [circleIds])).rows;
  const built = (await build(ctx, q, rows, userId, () => true, false)).map((b) => b.dto);
  for (const id of circleIds) {
    const mine = built.filter((d) => d.circleId === id);
    const need = mine.find((d) => !d.answered && d.createdBy !== userId);
    if (need) out.set(id, { needsYou: true, text: `${need.title} · ${need.type === 'attendance' ? 'are you in?' : 'needs your vote'}` });
    else if (mine[0]) {
      const d = mine[0];
      out.set(id, { needsYou: false, text: d.type === 'attendance' ? `${d.title} · ${d.attendance.in} in` : `${d.title} · ${d.responseCount} of ${d.memberCount} voted` });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- the share link */

async function loadByToken(q: Queryable, token: string): Promise<AskRow> {
  if (!TOKEN.test(token)) throw gone();
  const a = (await q.query<AskRow>(`${SELECT} WHERE a.share_token = $1`, [token])).rows[0];
  if (!a) {
    // A link that used to work says so, and reveals nothing else. Anything else looks like any other bad link.
    if ((await q.query('SELECT 1 FROM ask_revoked_links WHERE token = $1', [token])).rowCount) throw new AppError(410, 'ask_link_off', 'This link is no longer active.');
    throw gone();
  }
  if (a.share_revoked_at) throw new AppError(410, 'ask_link_off', 'This link is no longer active.');
  return a;
}

/** Where the visitor probably came from, read from the browser. WhatsApp's in-app browser says so. Never stored as text. */
const fromOf = (req: ReqMeta): 'whatsapp' | 'share' | 'unknown' => (!req.userAgent ? 'unknown' : /WhatsApp/i.test(req.userAgent) ? 'whatsapp' : 'share');
type AuthState = 'signed_in' | 'signed_out';

/** What a link is for. Public: shown before anyone signs in. Counts and first names, nothing more. */
export async function previewLink(ctx: Ctx, token: string, req: ReqMeta, authState: AuthState = 'signed_out') {
  const a = await loadByToken(ctx.db, token);
  const [b] = await build(ctx, ctx.db, [a], null, () => false, true);
  const day = ctx.now().toISOString().slice(0, 10);
  const who = visitorId(ctx.config, req.ip, req.userAgent, day);
  await track(ctx.db, ctx.config, 'ask_shared_link_opened', { actor: who, askId: a.id, key: `aov:${who}:${a.id}:${authState}`, props: { type: a.type, auth_state: authState, from: fromOf(req), state: b.dto.status } });
  return aliasPeople(ctx, token, null, { data: b.dto, people: await minimalPeople(ctx.db, b.peopleIds) }, [b.dto.createdBy, ...b.dto.responders.map((r) => r.userId), ...b.dto.waiting, ...b.dto.activity.map((x) => x.userId)]);
}

/** The visitor tapped an answer. Anonymous and coarse: one event per visitor pseudonym per Ask. */
export async function markStarted(ctx: Ctx, token: string, req: ReqMeta, authState: AuthState = 'signed_out') {
  const a = await loadByToken(ctx.db, token);
  const who = visitorId(ctx.config, req.ip, req.userAgent, ctx.now().toISOString().slice(0, 10));
  await track(ctx.db, ctx.config, 'ask_public_response_selected', { actor: who, askId: a.id, key: `aps:${who}:${a.id}:${authState}`, props: { type: a.type, auth_state: authState } });
  return { ok: true };
}

/** Steps along the shared-link path that the server cannot see for itself. Anonymous; one per visitor pseudonym per Ask. */
export async function recordLinkStep(ctx: Ctx, token: string, step: 'auth_started' | 'join_prompt', req: ReqMeta, authState: AuthState = 'signed_out') {
  const a = await loadByToken(ctx.db, token);
  const who = visitorId(ctx.config, req.ip, req.userAgent, ctx.now().toISOString().slice(0, 10));
  if (step === 'auth_started') await track(ctx.db, ctx.config, 'ask_auth_started_from_share', { actor: who, askId: a.id, key: `aas:${who}:${a.id}`, props: { type: a.type } });
  else await track(ctx.db, ctx.config, 'circle_join_prompt_shown', { actor: who, askId: a.id, key: `cjp:${who}:${a.id}:${authState}`, props: { type: a.type, auth_state: authState } });
  return { ok: true };
}

/** Someone who tapped an answer signed out has signed in and is back. A signed-in person, so recorded as one. */
export async function authCompleted(ctx: Ctx, userId: string, token: string) {
  const a = await loadByToken(ctx.db, token);
  await track(ctx.db, ctx.config, 'ask_auth_completed_from_share', { userId, askId: a.id, key: `aac:${userId}:${a.id}`, props: { type: a.type } });
  return { ok: true };
}

/** A person who answered from the link shares it onward. */
export async function reshared(ctx: Ctx, userId: string, token: string, via: 'native' | 'copy') {
  const a = await loadByToken(ctx.db, token);
  await track(ctx.db, ctx.config, 'ask_reshared', { userId, askId: a.id, key: `arh:${userId}:${a.id}:${ctx.now().toISOString().slice(0, 10)}`, props: { type: a.type, via } });
  return { ok: true };
}

/** The signed-in viewer's side of a link: their answer, whether they are in the Circle, and whether they could join it. */
export async function myLinkState(ctx: Ctx, userId: string, token: string) {
  const a = await loadByToken(ctx.db, token);
  const member = await isMember(ctx.db, a.circle_id, userId);
  const [b] = await build(ctx, ctx.db, [a], userId, () => member, true);
  const live = !member && !!(await ctx.db.query(`SELECT 1 FROM circle_invites WHERE circle_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`, [a.circle_id])).rowCount;
  const out = { data: { ask: b.dto, canJoinCircle: live }, people: await minimalPeople(ctx.db, b.peopleIds) };
  return member ? out : aliasPeople(ctx, token, userId, out, [b.dto.createdBy, ...b.dto.responders.map((r) => r.userId), ...b.dto.waiting, ...b.dto.activity.map((x) => x.userId)]);
}

/** Join the Circle from its Ask page. Works only while the Circle's own invite link is on. */
export async function joinCircleFromAsk(ctx: Ctx, userId: string, token: string, meta: ReqMeta) {
  const a = await loadByToken(ctx.db, token);
  const inv = (await ctx.db.query<{ token: string }>(`SELECT token FROM circle_invites WHERE circle_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC LIMIT 1`, [a.circle_id])).rows[0];
  if (!inv) throw new AppError(410, 'invite_revoked', 'This Circle isn’t taking new people right now. Ask the person who started it.');
  const wasMember = await isMember(ctx.db, a.circle_id, userId);
  const r = await joinByToken(ctx, userId, inv.token, meta, a.id);
  if (!wasMember) await track(ctx.db, ctx.config, 'circle_joined_from_ask', { userId, askId: a.id, key: `cja:${userId}:${a.id}`, props: { type: a.type } });
  return r;
}

/* ---------------------------------------------------------------- commands */

/** One person can start only so many Asks, Plans and Splits in a short while: each one tells the whole Circle. */
export async function assertCreateBudget(ctx: Ctx, q: Queryable, userId: string) {
  const r = await q.query<{ n: number }>(
    `SELECT ((SELECT COUNT(*) FROM asks WHERE created_by = $1 AND created_at > now() - make_interval(mins => $2))
           + (SELECT COUNT(*) FROM plans WHERE created_by = $1 AND created_at > now() - make_interval(mins => $2))
           + (SELECT COUNT(*) FROM splits WHERE created_by = $1 AND created_at > now() - make_interval(mins => $2)))::int AS n`,
    [userId, 10],
  );
  if (r.rows[0].n >= ctx.config.CREATE_LIMIT_PER_10_MIN) throw tooMany('You’ve started a lot in a short while. Give it a few minutes.');
}

export async function createAsk(ctx: Ctx, userId: string, circleId: string, input: { type: 'choice' | 'attendance'; title: string; options?: string[]; from: 'circle' | 'home' | 'nav'; planId?: string }, meta: ReqMeta) {
  if (!UUID.test(circleId) || !(await isMember(ctx.db, circleId, userId))) throw notFound('That Circle');
  const id = await ctx.db.tx(async (q) => {
    await assertCreateBudget(ctx, q, userId);
    const open = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM asks WHERE circle_id = $1 AND status = 'open'`, [circleId]);
    if (open.rows[0].n >= MAX_OPEN_PER_CIRCLE) throw badRequest('too_many_asks', 'This Circle has a lot of open questions. Close a few first.');
    // A question made from inside a Plan belongs to it (linked, not copied). It must be a Plan of this same Circle.
    if (input.planId && !(await q.query(`SELECT 1 FROM plans WHERE id = $1 AND circle_id = $2 AND status <> 'cancelled'`, [input.planId, circleId])).rowCount) throw notFound('That plan');
    const a = await q.query<{ id: string }>('INSERT INTO asks (circle_id, plan_id, type, title, created_by, share_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [circleId, input.planId ?? null, input.type, input.title, userId, randomToken(32)]);
    const askId = a.rows[0].id;
    for (const [i, label] of (input.type === 'choice' ? input.options ?? [] : []).entries()) await q.query('INSERT INTO ask_options (ask_id, label, position) VALUES ($1, $2, $3)', [askId, label, i]);
    await q.query('UPDATE circles SET updated_at = now() WHERE id = $1', [circleId]);
    await audit(q, { actorId: userId, action: 'ask.created', targetType: 'ask', targetId: askId, ip: meta.ip });
    if (input.planId) {
      await q.query(`INSERT INTO plan_activity (plan_id, user_id, kind, detail) VALUES ($1, $2, 'ask_linked', $3)`, [input.planId, userId, input.title.slice(0, 80)]);
      await track(q, ctx.config, 'plan_ask_linked', { userId, planId: input.planId, askId, props: { via: 'create' } }, true);
    }
    await track(q, ctx.config, 'ask_created', { userId, askId, key: `ac:${askId}`, props: { type: input.type, option_count: input.options?.length ?? 0, from: input.from } }, true);
    const c = (await q.query<{ name: string }>('SELECT name FROM circles WHERE id = $1', [circleId])).rows[0];
    const me = (await q.query<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [userId])).rows[0];
    const others = (await q.query<{ user_id: string }>(`SELECT user_id FROM circle_members WHERE circle_id = $1 AND status = 'joined' AND user_id <> $2`, [circleId, userId])).rows.map((r) => r.user_id);
    // "You were asked": one in-app note each, and one short push that carries no question text.
    await notify(q, others, {
      type: 'ask_new',
      title: input.type === 'attendance' ? `Are you in? ${c.name}` : `${me.first_name} asked ${c.name}`,
      body: input.title,
      refId: askId,
      meta: { actor: me.first_name, about: c.name },
      push: `${c.name} is waiting for your answer.`,
    });
    return askId;
  });
  return getAsk(ctx, userId, id);
}

interface Answer {
  optionId?: string;
  attendance?: Attendance;
}

/** Records or changes a signed-in person's answer. Idempotent: sending the same answer twice changes nothing. */
async function respond(ctx: Ctx, userId: string, askId: string, input: Answer, member: boolean) {
  await ctx.db.tx(async (q) => {
    const a = (await q.query<AskRow>(`${SELECT} WHERE a.id = $1 FOR UPDATE OF a`, [askId])).rows[0];
    if (!a) throw gone();
    if (isClosed(a, ctx.now())) throw new AppError(409, 'ask_closed', 'This question is closed, so answers can’t change.');
    if (a.type === 'choice') {
      if (!input.optionId || input.attendance) throw badRequest('invalid_answer', 'Pick one of the options.');
      if (!UUID.test(input.optionId) || !(await q.query('SELECT 1 FROM ask_options WHERE id = $1 AND ask_id = $2', [input.optionId, askId])).rowCount) throw badRequest('invalid_answer', 'That option isn’t part of this question.');
    } else if (!input.attendance || input.optionId) throw badRequest('invalid_answer', 'Choose In, Maybe or Can’t.');
    const prev = (await q.query<{ option_id: string | null; attendance: Attendance | null }>('SELECT option_id, attendance FROM ask_responses WHERE ask_id = $1 AND user_id = $2 FOR UPDATE', [askId, userId])).rows[0];
    if (prev && prev.option_id === (input.optionId ?? null) && prev.attendance === (input.attendance ?? null)) return;
    await q.query(
      `INSERT INTO ask_responses (ask_id, user_id, option_id, attendance) VALUES ($1, $2, $3, $4)
       ON CONFLICT (ask_id, user_id) DO UPDATE SET option_id = EXCLUDED.option_id, attendance = EXCLUDED.attendance, updated_at = now()`,
      [askId, userId, input.optionId ?? null, input.attendance ?? null],
    );
    await q.query('INSERT INTO ask_activity (ask_id, user_id, kind, option_id, attendance) VALUES ($1, $2, $3, $4, $5)', [askId, userId, prev ? 'changed' : 'responded', input.optionId ?? null, input.attendance ?? null]);
    await q.query('UPDATE circles SET updated_at = now() WHERE id = $1', [a.circle_id]);
    const day = ctx.now().toISOString().slice(0, 10);
    if (prev) await track(q, ctx.config, 'ask_changed_response', { userId, askId, key: `acr:${userId}:${askId}:${day}`, props: { type: a.type } }, true);
    else await track(q, ctx.config, 'ask_responded', { userId, askId, key: `ar:${userId}:${askId}`, props: { type: a.type, member } }, true);
    if (!prev && a.created_by !== userId) {
      const me = (await q.query<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [userId])).rows[0];
      // Grouped, and no push: a busy Ask is one line that grows, not a buzz per vote.
      await notifyGrouped(q, [a.created_by], {
        type: 'ask_response',
        pactId: null,
        refId: askId,
        first: { title: `${me.first_name} answered`, body: a.title },
        meta: { actor: me.first_name, about: a.cname },
        many: (n) => ({ title: `${n} new answers`, body: a.title }),
      });
    }
  });
}

export async function respondAsMember(ctx: Ctx, userId: string, askId: string, input: Answer) {
  await loadForMember(ctx.db, askId, userId);
  await respond(ctx, userId, askId, input, true);
  return getAsk(ctx, userId, askId);
}

/** Answer from the share link. The person must be signed in; they need not be in the Circle. */
export async function respondViaLink(ctx: Ctx, userId: string, token: string, input: Answer, afterAuth = false) {
  const a = await loadByToken(ctx.db, token);
  const member = await isMember(ctx.db, a.circle_id, userId);
  await respond(ctx, userId, a.id, input, member);
  await track(ctx.db, ctx.config, 'ask_response_completed_from_share', { userId, askId: a.id, key: `arcs:${userId}:${a.id}`, props: { type: a.type, member, after_auth: afterAuth } });
  return myLinkState(ctx, userId, token);
}

export async function closeAsk(ctx: Ctx, userId: string, askId: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const a = (await q.query<AskRow>(`${SELECT} WHERE a.id = $1 FOR UPDATE OF a`, [askId])).rows[0];
    if (!a || !(await isMember(q, a.circle_id, userId))) throw gone();
    if (a.created_by !== userId) throw forbidden('Only the person who asked can close it.');
    if (a.status === 'closed') return;
    await q.query(`UPDATE asks SET status = 'closed', closed_at = now(), closed_by = $2, updated_at = now() WHERE id = $1`, [askId, userId]);
    await q.query(`INSERT INTO ask_activity (ask_id, user_id, kind) VALUES ($1, $2, 'closed')`, [askId, userId]);
    await audit(q, { actorId: userId, action: 'ask.closed', targetType: 'ask', targetId: askId, ip: meta.ip });
    const total = (await q.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM ask_responses WHERE ask_id = $1', [askId])).rows[0].n;
    await track(q, ctx.config, 'ask_closed', { userId, askId, key: `acl:${askId}`, props: { type: a.type, responses: total } }, true);
    const [{ dto }] = await build(ctx, q, [{ ...a, status: 'closed' }], null, () => false, false);
    const everyone = (await q.query<{ user_id: string }>(`SELECT user_id FROM circle_members WHERE circle_id = $1 AND status = 'joined' AND user_id <> $2`, [a.circle_id, userId])).rows.map((r) => r.user_id);
    await notify(q, everyone, {
      type: 'ask_closed',
      title: a.type === 'choice' ? 'Decision made' : 'Responses closed',
      body: `${a.title}: ${dto.headline}`,
      refId: askId,
      meta: { about: a.cname },
      push: a.type === 'choice' ? `A decision was made in ${a.cname}.` : `Responses are closed in ${a.cname}.`,
    });
  });
  return getAsk(ctx, userId, askId);
}

export async function recordShared(ctx: Ctx, userId: string, askId: string, via: 'native' | 'copy') {
  const a = await loadForMember(ctx.db, askId, userId);
  await track(ctx.db, ctx.config, 'ask_shared', { userId, askId, key: `asd:${userId}:${askId}:${ctx.now().toISOString().slice(0, 10)}`, props: { type: a.type, via } });
  return { ok: true };
}

/** The creator turns the old link off and gets a new one. */
export async function resetShare(ctx: Ctx, userId: string, askId: string, meta: ReqMeta) {
  const a = await loadForMember(ctx.db, askId, userId);
  if (a.created_by !== userId) throw forbidden('Only the person who asked can reset the link.');
  await ctx.db.tx(async (q) => {
    await q.query('INSERT INTO ask_revoked_links (token, ask_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [a.share_token, askId]);
    await q.query('UPDATE asks SET share_token = $2, share_revoked_at = NULL, updated_at = now() WHERE id = $1', [askId, randomToken(32)]);
    await audit(q, { actorId: userId, action: 'ask.link_reset', targetType: 'ask', targetId: askId, ip: meta.ip });
  });
  return getAsk(ctx, userId, askId);
}

/** The questions linked to some Plans, as summaries (what a Plan screen lists). */
export async function askSummariesForPlans(ctx: Ctx, q: Queryable, planIds: string[], viewerId: string | null): Promise<Map<string, AskSummaryDTO[]>> {
  const out = new Map<string, AskSummaryDTO[]>();
  if (!planIds.length) return out;
  const rows = (await q.query<AskRow>(`${SELECT} WHERE a.plan_id = ANY($1::uuid[]) ORDER BY (a.status = 'open') DESC, a.created_at DESC`, [planIds])).rows;
  const built = await build(ctx, q, rows, viewerId, () => true, false);
  for (const b of built) {
    const id = b.dto.planId!;
    out.set(id, [...(out.get(id) ?? []), summary(b.dto)]);
  }
  return out;
}

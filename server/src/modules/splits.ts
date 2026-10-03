import type { CircleTint, PersonDTO, SplitDTO, SplitLinkDTO, SplitNeedDTO, SplitShareDTO, SplitStatus, SplitSummaryDTO } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { randomToken } from '../lib/crypto.js';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors.js';
import { track, visitorId } from '../lib/events.js';
import { formatNgn } from '../lib/money.js';
import { minimalPeople } from './asks.js';
import { joinByToken } from './circles.js';
import { audit, notify } from './platform.js';

/**
 * Split an expense: who paid, who owes what, and who has settled. A record only. PACT never holds, moves or confirms money;
 * "settled" means the group says it was settled outside PACT.
 *
 * Who may do what, decided here and never by the client:
 *   - Circle members create Splits, see them in full, and mark their own share settled (or owed again).
 *   - The person who made the Split, and the person who paid, may mark anyone's share. Nobody else can touch another person's share.
 *   - Only the creator edits. The title can change any time; total, payer, method and amounts only before anyone has settled.
 *   - Anyone holding the share link sees a safe summary and, once signed in, their OWN share: the row is matched by user id, never
 *     chosen from a list. The link is not Circle membership and shows no other person's amount.
 *   - Every share belongs to a real PACT user who is in the Circle (V1 has no guest or phone-only participants).
 * Totals, shares and status are computed here; the client's arithmetic is never trusted.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const MAX_OPEN_PER_CIRCLE = 50;
const RECENT_SETTLED_DAYS = 7;

interface SplitRow {
  id: string;
  circle_id: string;
  title: string;
  total_amount: number;
  split_mode: 'equal' | 'custom';
  paid_by: string;
  created_by: string;
  status: SplitStatus;
  share_token: string;
  settled_at: Date | null;
  created_at: Date;
  cname: string;
  cemoji: string;
  ctint: CircleTint;
}
interface ShareRow {
  split_id: string;
  user_id: string;
  amount: number;
  status: 'not_applicable' | 'owed' | 'settled';
  settled_at: Date | null;
  settled_by: string | null;
}

const SELECT = `SELECT s.id, s.circle_id, s.title, s.total_amount::float8 AS total_amount, s.split_mode, s.paid_by, s.created_by, s.status, s.share_token,
                       s.settled_at, s.created_at, c.name AS cname, c.emoji AS cemoji, c.tint AS ctint
                  FROM splits s JOIN circles c ON c.id = s.circle_id`;
const gone = () => notFound('That split');
const band = (n: number) => (n <= 2 ? '2' : n <= 4 ? '3_4' : n <= 8 ? '5_8' : '9_plus') as '2' | '3_4' | '5_8' | '9_plus';

const isMember = async (q: Queryable, circleId: string, userId: string) =>
  !!(await q.query(`SELECT 1 FROM circle_members WHERE circle_id = $1 AND user_id = $2 AND status = 'joined'`, [circleId, userId])).rowCount;

async function loadForMember(q: Queryable, id: string, userId: string, lock = false): Promise<SplitRow> {
  if (!UUID_RE.test(id)) throw gone();
  const s = (await q.query<SplitRow>(`${SELECT} WHERE s.id = $1 ${lock ? 'FOR UPDATE OF s' : ''}`, [id])).rows[0];
  if (!s || !(await isMember(q, s.circle_id, userId))) throw gone();
  return s;
}

/* ---------------------------------------------------------------- the arithmetic */

/**
 * Equal shares that add up to the total exactly. Everyone gets the whole-kobo quotient; the leftover kobo go one each to the first
 * people in the list, in the order given, so the same input always gives the same answer. ₦10,000 between 3 is 3,333.34 / 3,333.33 / 3,333.33.
 */
export function equalShares(total: number, ids: string[]): { userId: string; amount: number }[] {
  const n = ids.length;
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return ids.map((userId, i) => ({ userId, amount: base + (i < extra ? 1 : 0) }));
}

interface Person {
  userId: string;
  amount?: number;
}

/** The shares a request means, checked: real Circle members, once each, at least one person who owes, and adding up to the total. */
async function resolveShares(q: Queryable, circleId: string, total: number, paidBy: string, mode: 'equal' | 'custom', people: Person[]) {
  const ids = people.map((p) => p.userId);
  if (new Set(ids).size !== ids.length) throw badRequest('duplicate_person', 'Each person can only be in a split once.');
  for (const id of new Set([...ids, paidBy])) if (!(await isMember(q, circleId, id))) throw badRequest('unknown_person', 'Everyone in a split needs to be in the Circle.');
  if (!ids.some((id) => id !== paidBy)) throw badRequest('nobody_owes', 'Add at least one other person to split this with.');
  if (mode === 'equal') {
    if (total < ids.length) throw badRequest('amount_too_small', 'That’s too small to split between this many people.');
    return equalShares(total, ids);
  }
  if (people.some((p) => !p.amount)) throw badRequest('missing_amount', 'Give everyone an amount.');
  const shares = people.map((p) => ({ userId: p.userId, amount: p.amount! }));
  const sum = shares.reduce((t, s) => t + s.amount, 0);
  if (sum !== total) throw badRequest('split_sum_mismatch', 'The amounts need to add up to the total.');
  return shares;
}

/* ---------------------------------------------------------------- building answers */

const owedOf = (shares: ShareRow[], paidBy: string) => shares.filter((s) => s.user_id !== paidBy);

function summarise(s: SplitRow, shares: ShareRow[], viewerId: string | null): SplitSummaryDTO {
  const others = owedOf(shares, s.paid_by);
  const mineRow = viewerId ? shares.find((x) => x.user_id === viewerId) : undefined;
  return {
    id: s.id,
    circleId: s.circle_id,
    circle: { name: s.cname, emoji: s.cemoji, tint: s.ctint },
    title: s.title,
    total: s.total_amount,
    status: s.status,
    paidBy: s.paid_by,
    createdBy: s.created_by,
    mode: s.split_mode,
    owedCount: others.length,
    settledCount: others.filter((x) => x.status === 'settled').length,
    owedTotal: others.reduce((t, x) => t + x.amount, 0),
    unsettled: others.filter((x) => x.status === 'owed').reduce((t, x) => t + x.amount, 0),
    mine: mineRow ? { amount: mineRow.amount, status: mineRow.status, isPayer: mineRow.user_id === s.paid_by } : null,
    createdAt: s.created_at.toISOString(),
    settledAt: s.settled_at ? s.settled_at.toISOString() : null,
  };
}

async function sharesFor(q: Queryable, ids: string[]): Promise<ShareRow[]> {
  if (!ids.length) return [];
  return (await q.query<ShareRow>(`SELECT split_id, user_id, amount::float8 AS amount, status, settled_at, settled_by FROM split_shares WHERE split_id = ANY($1::uuid[]) ORDER BY created_at, user_id`, [ids])).rows;
}

const mayMark = (s: SplitRow, viewerId: string, target: string) => s.status !== 'cancelled' && target !== s.paid_by && (viewerId === target || viewerId === s.created_by || viewerId === s.paid_by);

async function detail(q: Queryable, s: SplitRow, viewerId: string) {
  const shares = await sharesFor(q, [s.id]);
  const act = (await q.query<{ kind: SplitDTO['activity'][number]['kind']; user_id: string; target_id: string | null; amount: number | null; at: Date }>(`SELECT kind, user_id, target_id, amount::float8 AS amount, created_at AS at FROM split_activity WHERE split_id = $1 ORDER BY created_at DESC, id LIMIT 30`, [s.id])).rows;
  const started = owedOf(shares, s.paid_by).some((x) => x.status === 'settled');
  const isCreator = viewerId === s.created_by;
  const dto: SplitDTO = {
    ...summarise(s, shares, viewerId),
    shares: shares.map<SplitShareDTO>((x) => ({
      userId: x.user_id,
      amount: x.amount,
      status: x.status,
      isPayer: x.user_id === s.paid_by,
      settledAt: x.settled_at ? x.settled_at.toISOString() : null,
      settledBy: x.settled_by,
      canChange: mayMark(s, viewerId, x.user_id),
    })),
    activity: act.map((a) => ({ kind: a.kind, userId: a.user_id, targetId: a.target_id, amount: a.amount, at: new Date(a.at).toISOString() })),
    canEdit: isCreator && s.status !== 'cancelled',
    canEditStructure: isCreator && s.status === 'open' && !started,
    canCancel: isCreator && s.status === 'open',
    shareToken: s.share_token,
  };
  const people = [s.paid_by, s.created_by, ...dto.shares.map((x) => x.userId), ...dto.shares.flatMap((x) => (x.settledBy ? [x.settledBy] : [])), ...dto.activity.flatMap((a) => [a.userId, ...(a.targetId ? [a.targetId] : [])])];
  return { dto, people };
}

async function log(q: Queryable, splitId: string, userId: string, kind: SplitDTO['activity'][number]['kind'], targetId: string | null = null, amount: number | null = null) {
  await q.query('INSERT INTO split_activity (split_id, user_id, kind, target_id, amount, created_at) VALUES ($1, $2, $3, $4, $5, clock_timestamp())', [splitId, userId, kind, targetId, amount]);
}

/* ---------------------------------------------------------------- reads */

export async function getSplit(ctx: Ctx, userId: string, id: string, from?: 'circle' | 'home') {
  const s = await loadForMember(ctx.db, id, userId);
  const { dto, people } = await detail(ctx.db, s, userId);
  if (from) await track(ctx.db, ctx.config, 'split_opened', { userId, splitId: s.id, key: `sp:${userId}:${s.id}:${ctx.now().toISOString().slice(0, 10)}`, props: { from, state: s.status } });
  return { data: dto, people: await minimalPeople(ctx.db, people) };
}

export async function listCircleSplits(ctx: Ctx, userId: string, circleId: string) {
  if (!UUID_RE.test(circleId) || !(await isMember(ctx.db, circleId, userId))) throw notFound('That Circle');
  // Open ones first, newest on top. A settled one stays for a week, lower down, then drops out of the list. Cancelled ones are history.
  const rows = (
    await ctx.db.query<SplitRow>(
      `${SELECT} WHERE s.circle_id = $1 AND (s.status = 'open' OR (s.status = 'settled' AND s.settled_at > now() - make_interval(days => $2)))
        ORDER BY (s.status = 'open') DESC, s.created_at DESC LIMIT 20`,
      [circleId, RECENT_SETTLED_DAYS],
    )
  ).rows;
  const shares = await sharesFor(ctx.db, rows.map((r) => r.id));
  return { data: rows.map((r) => summarise(r, shares.filter((x) => x.split_id === r.id), userId)), people: [] as PersonDTO[] };
}

export const compactNgn = (kobo: number) => {
  const n = kobo / 100;
  if (n >= 1_000_000) return `₦${+(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `₦${+(n / 1_000).toFixed(n % 1000 ? 1 : 0)}k`;
  return formatNgn(kobo);
};

/** What on Home is waiting on me: a share I still owe, or people who still owe me. Settled and cancelled Splits never appear. */
export async function needsYou(ctx: Ctx, userId: string): Promise<{ data: SplitNeedDTO[]; people: PersonDTO[] }> {
  const rows = (
    await ctx.db.query<SplitRow>(
      `${SELECT} JOIN circle_members me ON me.circle_id = s.circle_id AND me.user_id = $1 AND me.status = 'joined'
        WHERE s.status = 'open' AND (s.paid_by = $1 OR s.created_by = $1 OR EXISTS (SELECT 1 FROM split_shares x WHERE x.split_id = s.id AND x.user_id = $1 AND x.status = 'owed'))
        ORDER BY s.created_at DESC LIMIT 20`,
      [userId],
    )
  ).rows;
  const shares = await sharesFor(ctx.db, rows.map((r) => r.id));
  const out: SplitNeedDTO[] = [];
  for (const s of rows) {
    const mine = shares.find((x) => x.split_id === s.id && x.user_id === userId);
    const circle = { name: s.cname, emoji: s.cemoji, tint: s.ctint };
    if (mine && mine.status === 'owed' && s.paid_by !== userId) out.push({ splitId: s.id, title: s.title, circle, kind: 'owe', text: `You still owe ${formatNgn(mine.amount)}` });
    else if (s.paid_by === userId || s.created_by === userId) {
      const waiting = owedOf(shares.filter((x) => x.split_id === s.id), s.paid_by).filter((x) => x.status === 'owed').length;
      if (waiting) out.push({ splitId: s.id, title: s.title, circle, kind: 'collect', text: `${waiting} ${waiting === 1 ? 'person still needs' : 'people still need'} to settle` });
    }
  }
  out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'owe' ? -1 : 1));
  return { data: out.slice(0, 6), people: [] };
}

/** One live line per Circle from its Splits, for the Circles list: a share I owe first, then what is still unsettled for the payer. */
export async function splitSignals(ctx: Ctx, q: Queryable, userId: string, circleIds: string[]) {
  const out = new Map<string, { text: string; needsYou: boolean }>();
  if (!circleIds.length) return out;
  const rows = (await q.query<SplitRow>(`${SELECT} WHERE s.circle_id = ANY($1::uuid[]) AND s.status = 'open' ORDER BY s.created_at DESC LIMIT 200`, [circleIds])).rows;
  const shares = await sharesFor(q, rows.map((r) => r.id));
  for (const id of circleIds) {
    const mine = rows.filter((r) => r.circle_id === id);
    const owing = mine.find((s) => s.paid_by !== userId && shares.some((x) => x.split_id === s.id && x.user_id === userId && x.status === 'owed'));
    if (owing) {
      const amount = shares.find((x) => x.split_id === owing.id && x.user_id === userId)!.amount;
      out.set(id, { needsYou: true, text: `${owing.title} · you owe ${compactNgn(amount)}` });
      continue;
    }
    const collecting = mine.filter((s) => s.paid_by === userId || s.created_by === userId);
    const left = collecting.reduce((t, s) => t + summarise(s, shares.filter((x) => x.split_id === s.id), userId).unsettled, 0);
    if (left > 0) out.set(id, { needsYou: false, text: `${compactNgn(left)} still unsettled` });
  }
  return out;
}

/* ---------------------------------------------------------------- commands */

interface CreateInput {
  title: string;
  total: number;
  paidBy?: string;
  mode: 'equal' | 'custom';
  participants: Person[];
}

export async function createSplit(ctx: Ctx, userId: string, circleId: string, input: CreateInput, meta: ReqMeta, from: 'circle' | 'home' | 'nav' = 'circle') {
  if (!UUID_RE.test(circleId) || !(await isMember(ctx.db, circleId, userId))) throw notFound('That Circle');
  const paidBy = input.paidBy ?? userId;
  const id = await ctx.db.tx(async (q) => {
    const open = (await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM splits WHERE circle_id = $1 AND status = 'open'`, [circleId])).rows[0].n;
    if (open >= MAX_OPEN_PER_CIRCLE) throw badRequest('too_many_splits', 'This Circle has a lot of open splits. Settle or cancel a few first.');
    const shares = await resolveShares(q, circleId, input.total, paidBy, input.mode, input.participants);
    const r = await q.query<{ id: string }>(
      `INSERT INTO splits (circle_id, title, total_amount, split_mode, paid_by, created_by, share_token) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [circleId, input.title, input.total, input.mode, paidBy, userId, randomToken(32)],
    );
    const splitId = r.rows[0].id;
    for (const s of shares) {
      // The payer's own portion is an allocation, not a debt: 'not_applicable', never 'settled', and no settlement is recorded for it.
      await q.query('INSERT INTO split_shares (split_id, user_id, amount, status) VALUES ($1, $2, $3, $4)', [splitId, s.userId, s.amount, s.userId === paidBy ? 'not_applicable' : 'owed']);
    }
    await log(q, splitId, userId, 'created');
    await q.query('UPDATE circles SET updated_at = now() WHERE id = $1', [circleId]);
    await audit(q, { actorId: userId, action: 'split.created', targetType: 'split', targetId: splitId, ip: meta.ip });
    await track(q, ctx.config, 'split_created', { userId, splitId, key: `spc:${splitId}`, props: { split_mode: input.mode, participant_count_band: band(shares.length), from } }, true);
    const me = (await q.query<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [userId])).rows[0];
    const c = (await q.query<{ name: string }>('SELECT name FROM circles WHERE id = $1', [circleId])).rows[0];
    // Each person is told once, with their own share. The push is generic: an amount doesn't belong on a lock screen.
    for (const s of shares.filter((x) => x.userId !== userId && x.userId !== paidBy)) {
      await notify(q, [s.userId], { type: 'split_new', title: `${me.first_name} added you to a split`, body: `${input.title} · your share is ${formatNgn(s.amount)}`, refId: splitId, meta: { actor: me.first_name, about: c.name }, push: `You were included in a split in ${c.name}.` });
    }
    return splitId;
  });
  return getSplit(ctx, userId, id);
}

/** After any change to a share: every share settled means the Split is settled; one undone means it is open again. */
async function refreshStatus(ctx: Ctx, q: Queryable, s: SplitRow, actorId: string) {
  if (s.status === 'cancelled') return;
  const shares = await sharesFor(q, [s.id]);
  const left = owedOf(shares, s.paid_by).filter((x) => x.status === 'owed').length;
  if (s.status === 'open' && left === 0) {
    await q.query(`UPDATE splits SET status = 'settled', settled_at = now(), updated_at = now() WHERE id = $1`, [s.id]);
    await log(q, s.id, actorId, 'completed');
    await track(q, ctx.config, 'split_completed', { userId: actorId, splitId: s.id, key: `spd:${s.id}:${ctx.now().getTime()}`, props: { participant_count_band: band(shares.length) } }, true);
    // In-app only, to whoever is owed, unless they did it themselves.
    await notify(q, [...new Set([s.created_by, s.paid_by])].filter((u) => u !== actorId), { type: 'split_done', title: `${s.title} is all settled`, body: 'Everyone is square.', refId: s.id, meta: { about: s.cname } });
  } else if (s.status === 'settled' && left > 0) {
    await q.query(`UPDATE splits SET status = 'open', settled_at = NULL, updated_at = now() WHERE id = $1`, [s.id]);
    await log(q, s.id, actorId, 'reopened');
  }
}

/** Mark one share settled (outside PACT) or owed again. Idempotent: asking for what is already true changes and records nothing. */
async function applySettlement(ctx: Ctx, q: Queryable, s: SplitRow, actorId: string, target: string, settled: boolean, afterAuth: boolean) {
  if (s.status === 'cancelled') throw new AppError(409, 'split_cancelled', 'This split was cancelled.');
  if (target === s.paid_by) throw badRequest('payer_share', 'The person who paid doesn’t owe anything.');
  if (!mayMark(s, actorId, target)) throw forbidden('You can only change your own share.');
  const row = (await q.query<ShareRow>(`SELECT split_id, user_id, amount::float8 AS amount, status, settled_at, settled_by FROM split_shares WHERE split_id = $1 AND user_id = $2 FOR UPDATE`, [s.id, target])).rows[0];
  if (!row) throw notFound('That share');
  if ((row.status === 'settled') === settled) return;
  await q.query(`UPDATE split_shares SET status = $3, settled_at = ${settled ? 'now()' : 'NULL'}, settled_by = ${settled ? '$4' : 'NULL'}, updated_at = now() WHERE split_id = $1 AND user_id = $2`, settled ? [s.id, target, 'settled', actorId] : [s.id, target, 'owed']);
  await log(q, s.id, actorId, settled ? 'settled' : 'unsettled', target, row.amount);
  const by = actorId === target ? 'self' : 'organiser';
  if (settled) await track(q, ctx.config, 'split_settlement_marked', { userId: actorId, splitId: s.id, props: { by, after_auth: afterAuth } }, true);
  else await track(q, ctx.config, 'split_settlement_undone', { userId: actorId, splitId: s.id, props: { by } }, true);
  await q.query('UPDATE splits SET updated_at = now() WHERE id = $1', [s.id]);
  await refreshStatus(ctx, q, s, actorId);
}

export async function settleShare(ctx: Ctx, userId: string, splitId: string, target: string, settled: boolean, meta: ReqMeta) {
  if (!UUID_RE.test(target)) throw notFound('That share');
  await ctx.db.tx(async (q) => {
    const s = await loadForMember(q, splitId, userId, true);
    await applySettlement(ctx, q, s, userId, target, settled, false);
    await audit(q, { actorId: userId, action: settled ? 'split.settled' : 'split.unsettled', targetType: 'split', targetId: splitId, ip: meta.ip });
  });
  return getSplit(ctx, userId, splitId);
}

export async function updateSplit(ctx: Ctx, userId: string, splitId: string, patch: { title?: string; total?: number; paidBy?: string; mode?: 'equal' | 'custom'; participants?: Person[] }, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const s = await loadForMember(q, splitId, userId, true);
    if (s.created_by !== userId) throw forbidden('Only the person who made the split can change it.');
    if (s.status === 'cancelled') throw new AppError(409, 'split_cancelled', 'This split was cancelled, so it can’t be changed.');
    if (patch.title !== undefined) await q.query('UPDATE splits SET title = $2, updated_at = now() WHERE id = $1', [splitId, patch.title]);
    const structural = patch.total !== undefined || patch.paidBy !== undefined || patch.mode !== undefined || patch.participants !== undefined;
    if (structural) {
      const shares = await sharesFor(q, [splitId]);
      // Once anyone has settled, recalculating would quietly change what they settled. Refuse instead.
      if (s.status !== 'open' || owedOf(shares, s.paid_by).some((x) => x.status === 'settled')) throw new AppError(409, 'split_settling', 'People have already started settling this split.');
      const total = patch.total ?? s.total_amount;
      const paidBy = patch.paidBy ?? s.paid_by;
      const mode = patch.mode ?? s.split_mode;
      const people: Person[] = patch.participants ?? shares.map((x) => ({ userId: x.user_id, amount: mode === 'custom' && patch.total === undefined && patch.mode === undefined ? x.amount : undefined }));
      const next = await resolveShares(q, s.circle_id, total, paidBy, mode, people);
      await q.query('DELETE FROM split_shares WHERE split_id = $1', [splitId]);
      for (const x of next) {
        await q.query('INSERT INTO split_shares (split_id, user_id, amount, status) VALUES ($1, $2, $3, $4)', [splitId, x.userId, x.amount, x.userId === paidBy ? 'not_applicable' : 'owed']);
      }
      await q.query('UPDATE splits SET total_amount = $2, paid_by = $3, split_mode = $4, updated_at = now() WHERE id = $1', [splitId, total, paidBy, mode]);
    }
    await audit(q, { actorId: userId, action: 'split.updated', targetType: 'split', targetId: splitId, ip: meta.ip });
  });
  return getSplit(ctx, userId, splitId);
}

export async function cancelSplit(ctx: Ctx, userId: string, splitId: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const s = await loadForMember(q, splitId, userId, true);
    if (s.created_by !== userId) throw forbidden('Only the person who made the split can cancel it.');
    if (s.status === 'cancelled') return;
    if (s.status === 'settled') throw new AppError(409, 'split_settled', 'A settled split can’t be cancelled.');
    const shares = await sharesFor(q, [splitId]);
    await q.query(`UPDATE splits SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1`, [splitId]);
    await log(q, splitId, userId, 'cancelled');
    await audit(q, { actorId: userId, action: 'split.cancelled', targetType: 'split', targetId: splitId, ip: meta.ip });
    await track(q, ctx.config, 'split_cancelled', { userId, splitId, key: `spx:${splitId}`, props: { had_settlements: owedOf(shares, s.paid_by).some((x) => x.status === 'settled') } }, true);
  });
  return getSplit(ctx, userId, splitId);
}

export async function recordShared(ctx: Ctx, userId: string, splitId: string, via: 'native' | 'copy') {
  await loadForMember(ctx.db, splitId, userId);
  await track(ctx.db, ctx.config, 'split_shared', { userId, splitId, key: `spsh:${userId}:${splitId}:${ctx.now().toISOString().slice(0, 10)}`, props: { via } });
  return { ok: true };
}

/* ---------------------------------------------------------------- sharing */

async function loadByToken(q: Queryable, token: string): Promise<SplitRow> {
  if (!TOKEN.test(token)) throw gone();
  const s = (await q.query<SplitRow>(`${SELECT} WHERE s.share_token = $1`, [token])).rows[0];
  if (!s) throw gone();
  return s;
}

function linkView(s: SplitRow, shares: ShareRow[], viewerId: string | null, member: boolean, canJoin: boolean): SplitLinkDTO {
  const sum = summarise(s, shares, viewerId);
  return {
    circle: sum.circle,
    title: s.title,
    total: s.total_amount,
    status: s.status,
    paidBy: s.paid_by,
    owedCount: sum.owedCount,
    settledCount: sum.settledCount,
    mine: sum.mine,
    signedIn: !!viewerId,
    isMember: member,
    canJoinCircle: canJoin,
    splitId: member ? s.id : null,
  };
}

/** What a link shows anyone: the title, the total, who paid and how far along it is. No other person's share, no names but the payer's. */
export async function previewLink(ctx: Ctx, token: string, req: ReqMeta) {
  const s = await loadByToken(ctx.db, token);
  const shares = await sharesFor(ctx.db, [s.id]);
  const who = visitorId(ctx.config, req.ip, req.userAgent, ctx.now().toISOString().slice(0, 10));
  await track(ctx.db, ctx.config, 'split_share_opened', { actor: who, splitId: s.id, key: `spo:${who}:${s.id}`, props: { auth_state: 'signed_out', state: s.status } });
  return { data: linkView(s, shares, null, false, false), people: await minimalPeople(ctx.db, [s.paid_by]) };
}

/** The signed-in viewer's side of a link: their own share, matched by user id, and whether they could join the Circle. */
export async function myLinkState(ctx: Ctx, userId: string, token: string, opened = false) {
  const s = await loadByToken(ctx.db, token);
  const member = await isMember(ctx.db, s.circle_id, userId);
  const shares = await sharesFor(ctx.db, [s.id]);
  const canJoin = !member && !!(await ctx.db.query(`SELECT 1 FROM circle_invites WHERE circle_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`, [s.circle_id])).rowCount;
  if (opened) await track(ctx.db, ctx.config, 'split_share_opened', { userId, splitId: s.id, key: `spo:${userId}:${s.id}`, props: { auth_state: 'signed_in', state: s.status } });
  return { data: linkView(s, shares, userId, member, canJoin), people: await minimalPeople(ctx.db, [s.paid_by]) };
}

/** A link visitor marks (or un-marks) their OWN share, and nothing else. The share is found by user id; no id of a share is accepted. */
export async function settleViaLink(ctx: Ctx, userId: string, token: string, settled: boolean, afterAuth: boolean, meta: ReqMeta) {
  const s0 = await loadByToken(ctx.db, token);
  await ctx.db.tx(async (q) => {
    const s = (await q.query<SplitRow>(`${SELECT} WHERE s.id = $1 FOR UPDATE OF s`, [s0.id])).rows[0];
    const own = await q.query('SELECT 1 FROM split_shares WHERE split_id = $1 AND user_id = $2', [s.id, userId]);
    if (!own.rowCount) throw forbidden('This link doesn’t have a share for you.');
    await applySettlement(ctx, q, s, userId, userId, settled, afterAuth);
    await audit(q, { actorId: userId, action: settled ? 'split.settled' : 'split.unsettled', targetType: 'split', targetId: s.id, ip: meta.ip });
  });
  return myLinkState(ctx, userId, token);
}

export async function joinCircleFromSplit(ctx: Ctx, userId: string, token: string, meta: ReqMeta) {
  const s = await loadByToken(ctx.db, token);
  const inv = (await ctx.db.query<{ token: string }>(`SELECT token FROM circle_invites WHERE circle_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC LIMIT 1`, [s.circle_id])).rows[0];
  if (!inv) throw new AppError(410, 'invite_revoked', 'This Circle isn’t taking new people right now. Ask the person who started it.');
  return joinByToken(ctx, userId, inv.token, meta, undefined, undefined, s.id);
}

export async function recordLinkShared(ctx: Ctx, userId: string, token: string, via: 'native' | 'copy') {
  const s = await loadByToken(ctx.db, token);
  await track(ctx.db, ctx.config, 'split_shared', { userId, splitId: s.id, key: `spsh:${userId}:${s.id}:${ctx.now().toISOString().slice(0, 10)}`, props: { via } });
  return { ok: true };
}

export type { SplitRow };

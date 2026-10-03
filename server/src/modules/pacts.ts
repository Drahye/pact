import type { ActivityDTO, BudgetItemDTO, CreatePactInput, PactDTO, PactItemDTO, PactOrderDTO, PactPayoutDTO, PactPledgeDTO, PactTransferDTO, PactPreviewDTO, Participation, PersonDTO, TaskDTO, WithPeople } from '../../../shared/contracts.js';
import { MAX_PACT_TARGET, MIN_PACT_TARGET, SMS_INVITES_PER_DAY, MAX_PACT_DAYS, MAX_PACT_MEMBERS, MISSED_GOAL_GRACE_DAYS, NUDGE_COOLDOWN_HOURS, TIER_LIMITS, type KycTier } from '../../../shared/policy.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { randomCode } from '../lib/crypto.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { formatNgn } from '../lib/money.js';
import { normalizeNgPhone } from '../lib/phone.js';
import { track } from '../lib/events.js';
import { addDays, lagosToday } from '../lib/time.js';
import { getUser, verifyPin } from './auth.js';
import { createAccount, post, walletAccountId } from './ledger.js';
import { closePactAccountTx, refundGuestsTx, settleWaitingPayouts } from './pactMoney.js';
import { checkPledgeKept, closePledgesTx } from './pledges.js';
import { insertItems, lapseUnpaidOrders, orderOutstanding, paidOrders } from './orders.js';
import { completeConversion, completeFromPact, lockPlanForPact } from './plans.js';
import { audit, enqueue, notify, notifyGrouped, recordActivity } from './platform.js';

export interface PactRow {
  id: string;
  slug: string;
  invite_code: string;
  circle_id: string | null;
  title: string;
  note: string | null;
  category: PactDTO['category'];
  target_amount: number;
  raised_amount: number;
  deadline: string;
  organizer_id: string;
  account_id: string;
  status: PactDTO['status'];
  missed_goal_policy: 'refund' | 'release';
  split_mode: 'flexible' | 'equal';
  created_at: Date;
  funded_at: Date | null;
  closed_at: Date | null;
  pinned_activity_id: string | null;
  pinned_by: string | null;
  pinned_at: Date | null;
  completed_at: Date | null;
  completed_by: string | null;
  release_requested_by: string | null;
  release_requested_at: Date | null;
  mode: 'goal' | 'orders';
}

export interface MemberRow {
  pact_id: string;
  user_id: string;
  role: 'organizer' | 'co_organizer' | 'member';
  status: 'invited' | 'joined' | 'left';
  contributed: number;
  joined_at: Date | null;
  participation: Participation | null;
  color: string | null;
  requested_amount: number | null;
}

const personCols = `id, first_name, last_name, color, tint, photo_url`;
const toPerson = (u: { id: string; first_name: string; last_name: string; color: string; tint: PersonDTO['tint']; photo_url: string | null }): PersonDTO => ({
  id: u.id,
  firstName: u.first_name,
  lastName: u.last_name,
  color: u.color,
  tint: u.tint,
  photoUrl: u.photo_url,
});

export async function peopleByIds(q: Queryable, ids: string[]): Promise<PersonDTO[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const r = await q.query<Parameters<typeof toPerson>[0]>(`SELECT ${personCols} FROM users WHERE id = ANY($1::uuid[])`, [unique]);
  return r.rows.map(toPerson);
}

export const PALETTE = ['#3dd68c', '#ff7a5c', '#4da3ff', '#9b7bff', '#ffc53d', '#ff6fb5', '#22b8a6', '#ff9f43'];

/** Someone's colour inside a Pact: their own if it's free there, otherwise the first free one. */
export async function colorFor(q: Queryable, pactId: string, userId: string): Promise<string> {
  const [mine, taken] = await Promise.all([
    q.query<{ color: string }>('SELECT color FROM users WHERE id = $1', [userId]),
    q.query<{ color: string }>(`SELECT color FROM pact_members WHERE pact_id = $1 AND user_id <> $2 AND status <> 'left' AND color IS NOT NULL`, [pactId, userId]),
  ]);
  const used = new Set(taken.rows.map((r) => r.color));
  const own = mine.rows[0]?.color ?? PALETTE[0];
  if (!used.has(own)) return own;
  return PALETTE.find((c) => !used.has(c)) ?? own;
}

/**
 * Raised money fills budget lines in order, so the plan shows which parts are covered.
 * A line a vendor has already been paid for counts as covered by that payment first.
 */
export interface LineSpend {
  /** Confirmed by the bank. */
  paid: number;
  /** On its way: waiting for approval or with the bank. Not paid until the bank says so. */
  pending: number;
  /** The part of `pending` still waiting for a co-organiser. */
  waiting: number;
}

export function allocate(raised: number, items: { id: string; name: string; amount: number; position: number }[], spend: Map<string, LineSpend> = new Map()): BudgetItemDTO[] {
  const none: LineSpend = { paid: 0, pending: 0, waiting: 0 };
  const of = (id: string) => spend.get(id) ?? none;
  // Money held for or sent to a vendor is out of the pool, so it covers the line whether or not the bank has confirmed it yet.
  const spent = (i: { id: string; amount: number }) => Math.min(i.amount, of(i.id).paid + of(i.id).pending);
  let left = raised - items.reduce((s, i) => s + spent(i), 0);
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((i) => {
      const more = Math.min(i.amount - spent(i), Math.max(0, left));
      left -= more;
      const s = of(i.id);
      return { id: i.id, name: i.name, amount: i.amount, funded: spent(i) + more, paid: s.paid, pending: s.pending, waiting: s.waiting, position: i.position };
    });
}

/**
 * Builds DTOs for many Pacts with a fixed number of queries, whatever the count.
 * Runs under row-level security (db.asUser), so it can only read what the viewer may see.
 */
async function hydrate(q: Queryable, rows: PactRow[], viewerId: string): Promise<PactDTO[]> {
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id);
  const [members, invites, budget, tasks, memories, photos, banks, transfers, payouts, pledges, items, counts, orderRows] = await Promise.all([
    q.query<MemberRow>(
      `SELECT pact_id, user_id, role, status, contributed, joined_at, participation, color, requested_amount FROM pact_members
        WHERE pact_id = ANY($1::uuid[]) AND status <> 'left' ORDER BY joined_at NULLS LAST, created_at`,
      [ids],
    ),
    q.query<{ pact_id: string; n: number }>(`SELECT id AS pact_id, pact_pending_invites(id) AS n FROM unnest($1::uuid[]) AS id`, [ids]),
    q.query<{ id: string; pact_id: string; name: string; amount: number; position: number }>(
      `SELECT id, pact_id, name, amount, position FROM budget_items WHERE pact_id = ANY($1::uuid[]) ORDER BY position, created_at`,
      [ids],
    ),
    q.query<{ id: string; pact_id: string; title: string; budget_item_id: string | null; assignee_id: string | null; status: TaskDTO['status']; created_by: string; created_at: Date; completed_at: Date | null }>(
      `SELECT id, pact_id, title, budget_item_id, assignee_id, status, created_by, created_at, completed_at FROM tasks
        WHERE pact_id = ANY($1::uuid[]) ORDER BY created_at`,
      [ids],
    ),
    q.query<{ pact_id: string; note: string | null; happened_on: string | null; updated_at: Date }>(
      `SELECT pact_id, note, happened_on, updated_at FROM pact_memories WHERE pact_id = ANY($1::uuid[])`,
      [ids],
    ),
    q.query<{ id: string; pact_id: string }>(`SELECT id, pact_id FROM memory_photos WHERE pact_id = ANY($1::uuid[]) ORDER BY created_at`, [ids]),
    q.query<{ pact_id: string; account_number: string; bank_name: string; account_name: string; status: 'active' | 'closed' }>(
      `SELECT pact_id, account_number, bank_name, account_name, status FROM pact_bank_accounts WHERE pact_id = ANY($1::uuid[])`,
      [ids],
    ),
    // Only the columns people in the Pact may see (the grants allow no more).
    q.query<{ id: string; pact_id: string; amount: number; sender_name: string; sender_bank: string | null; user_id: string | null; matched_by: PactTransferDTO['matchedBy']; status: PactTransferDTO['status']; created_at: Date }>(
      `SELECT id, pact_id, amount, sender_name, sender_bank, user_id, matched_by, status, created_at FROM pact_transfers
        WHERE pact_id = ANY($1::uuid[]) ORDER BY created_at`,
      [ids],
    ),
    q.query<{
      id: string; pact_id: string; kind: PactPayoutDTO['kind']; amount: number; fee: number; bank_name: string; last4: string; account_name: string;
      purpose: string | null; budget_item_id: string | null; status: PactPayoutDTO['status']; requested_by: string | null; decided_by: string | null;
      decided_at: Date | null; failure_reason: string | null; receipt_bytes: number | null; created_at: Date; completed_at: Date | null;
    }>(
      `SELECT id, pact_id, kind, amount, fee, bank_name, last4, account_name, purpose, budget_item_id, status, requested_by, decided_by,
              decided_at, failure_reason, receipt_bytes, created_at, completed_at
         FROM pact_payouts WHERE pact_id = ANY($1::uuid[]) ORDER BY created_at`,
      [ids],
    ),
    q.query<{ id: string; pact_id: string; user_id: string; amount: number; goal_total: number; due_on: string; source: PactPledgeDTO['source']; status: PactPledgeDTO['status']; reminders: number }>(
      `SELECT id, pact_id, user_id, amount, goal_total, due_on, source, status, reminders FROM pact_pledges
        WHERE pact_id = ANY($1::uuid[]) AND status IN ('open', 'kept') ORDER BY due_on`,
      [ids],
    ),
    q.query<{ id: string; pact_id: string; name: string; price: number; options: string[]; stock: number | null; active: boolean; position: number }>(
      `SELECT id, pact_id, name, price, options, stock, active, position FROM pact_items WHERE pact_id = ANY($1::uuid[]) ORDER BY position, created_at`,
      [ids],
    ),
    q.query<{ pact_id: string; item_id: string; ordered: number }>(
      `SELECT p AS pact_id, c.item_id, c.ordered FROM unnest($1::uuid[]) AS p, LATERAL pact_item_counts(p) c`,
      [ids],
    ),
    // Policies decide whose orders come back: your own, or all of them for organisers.
    q.query<{ id: string; pact_id: string; item_id: string; user_id: string; option: string | null; quantity: number; unit_price: number; amount: number; status: PactOrderDTO['status']; created_at: Date }>(
      `SELECT id, pact_id, item_id, user_id, option, quantity, unit_price, amount, status, created_at FROM pact_orders
        WHERE pact_id = ANY($1::uuid[]) AND status IN ('active', 'lapsed') ORDER BY created_at`,
      [ids],
    ),
  ]);
  const group = <T extends { pact_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) m.set(x.pact_id, [...(m.get(x.pact_id) ?? []), x]);
    return m;
  };
  const byPact = group(members.rows);
  const budgetBy = group(budget.rows);
  const tasksBy = group(tasks.rows);
  const photosBy = group(photos.rows);
  const memoryBy = new Map(memories.rows.map((m) => [m.pact_id, m]));
  const pending = new Map(invites.rows.map((i) => [i.pact_id, i.n]));
  const bankBy = new Map(banks.rows.map((b) => [b.pact_id, b]));
  const transfersBy = group(transfers.rows);
  const payoutsBy = group(payouts.rows);
  const pledgesBy = group(pledges.rows);
  const itemsBy = group(items.rows);
  const countsBy = new Map(counts.rows.map((c) => [`${c.pact_id}:${c.item_id}`, c.ordered]));
  const ordersBy = group(orderRows.rows);
  // Held for or paid to a vendor: out of the pool, even before the bank confirms.
  const spends = (x: { kind: string; status: string }) => x.kind === 'vendor' && ['awaiting_approval', 'pending', 'processing', 'succeeded'].includes(x.status);

  return rows.map((p) => {
    const ms = byPact.get(p.id) ?? [];
    const me = ms.find((m) => m.user_id === viewerId);
    const joined = ms.filter((m) => m.status === 'joined').length;
    const remaining = Math.max(0, p.target_amount - p.raised_amount);
    // Equal split across everyone in or invited (rounded up to the naira).
    const heads = ms.length + (pending.get(p.id) ?? 0);
    const share = Math.ceil(p.target_amount / Math.max(1, heads, joined) / 100) * 100;
    const ask = me?.requested_amount ? Math.max(0, me.requested_amount) : 0;
    // In an order Pact, your share is what you still owe on your own orders.
    const owedOnOrders = (ordersBy.get(p.id) ?? []).filter((o) => o.user_id === viewerId && o.status === 'active').reduce((sum, o) => sum + o.amount, 0);
    const suggested = !me ? 0 : p.mode === 'orders' ? Math.max(0, owedOnOrders - me.contributed) : Math.min(remaining, ask || Math.max(0, share - me.contributed));
    const memory = memoryBy.get(p.id);
    const pactPayouts = payoutsBy.get(p.id) ?? [];
    const spent = pactPayouts.filter(spends).reduce((sum, x) => sum + x.amount + x.fee, 0);
    const spendByLine = new Map<string, LineSpend>();
    for (const x of pactPayouts.filter(spends)) {
      if (!x.budget_item_id) continue;
      const line = spendByLine.get(x.budget_item_id) ?? { paid: 0, pending: 0, waiting: 0 };
      if (x.status === 'succeeded') line.paid += x.amount;
      else line.pending += x.amount;
      if (x.status === 'awaiting_approval') line.waiting += x.amount;
      spendByLine.set(x.budget_item_id, line);
    }
    const bank = bankBy.get(p.id);
    return {
      id: p.id,
      slug: p.slug,
      inviteCode: p.invite_code,
      circleId: p.circle_id,
      title: p.title,
      note: p.note,
      category: p.category,
      target: p.target_amount,
      raised: p.raised_amount,
      // The pool holds everything raised, less vendor payments, until it is released or refunded.
      poolBalance: p.status === 'open' || p.status === 'funded' ? Math.max(0, p.raised_amount - spent) : 0,
      deadline: p.deadline,
      createdAt: p.created_at.toISOString(),
      organizerId: p.organizer_id,
      status: p.status,
      missedGoalPolicy: p.missed_goal_policy,
      splitMode: p.split_mode,
      fundedAt: p.funded_at?.toISOString() ?? null,
      completedAt: p.completed_at?.toISOString() ?? null,
      closedAt: p.closed_at?.toISOString() ?? null,
      members: ms.map((m) => ({
        userId: m.user_id,
        role: m.role,
        status: m.status,
        contributed: m.contributed,
        joinedAt: m.joined_at?.toISOString() ?? null,
        participation: m.participation,
        color: m.color ?? PALETTE[0],
        requestedAmount: m.requested_amount,
      })),
      pendingPhoneInvites: pending.get(p.id) ?? 0,
      budget: allocate(p.raised_amount, budgetBy.get(p.id) ?? [], spendByLine),
      tasks: (tasksBy.get(p.id) ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        budgetItemId: t.budget_item_id,
        assigneeId: t.assignee_id,
        status: t.status,
        createdBy: t.created_by,
        createdAt: t.created_at.toISOString(),
        completedAt: t.completed_at?.toISOString() ?? null,
      })),
      memory: memory || photosBy.has(p.id)
        ? { note: memory?.note ?? null, happenedOn: memory?.happened_on ?? null, photoIds: (photosBy.get(p.id) ?? []).map((x) => x.id), updatedAt: (memory?.updated_at ?? p.created_at).toISOString() }
        : null,
      mode: p.mode,
      items: (itemsBy.get(p.id) ?? []).map(
        (i): PactItemDTO => ({ id: i.id, name: i.name, price: i.price, options: i.options, stock: i.stock, ordered: countsBy.get(`${p.id}:${i.id}`) ?? 0, active: i.active }),
      ),
      orders: (() => {
        const list = ordersBy.get(p.id) ?? [];
        const paid = new Set<string>();
        for (const uid of new Set(list.map((o) => o.user_id))) {
          const theirs = list.filter((o) => o.user_id === uid && o.status === 'active');
          for (const id of paidOrders(theirs, ms.find((m) => m.user_id === uid)?.contributed ?? 0)) paid.add(id);
        }
        return list.map(
          (o): PactOrderDTO => ({ id: o.id, itemId: o.item_id, userId: o.user_id, option: o.option, quantity: o.quantity, amount: o.amount, status: o.status, paid: paid.has(o.id), createdAt: o.created_at.toISOString() }),
        );
      })(),
      pledges: (pledgesBy.get(p.id) ?? []).map((x) => {
        const paid = ms.find((m) => m.user_id === x.user_id)?.contributed ?? 0;
        return {
          id: x.id,
          userId: x.user_id,
          amount: x.amount,
          dueOn: x.due_on,
          source: x.source,
          status: x.status,
          remaining: x.status === 'open' ? Math.max(0, x.goal_total - paid) : 0,
          reminded: x.reminders,
        };
      }),
      releaseRequest: p.release_requested_by ? { requestedBy: p.release_requested_by, requestedAt: p.release_requested_at!.toISOString() } : null,
      bankAccount: bank ? { accountNumber: bank.account_number, bankName: bank.bank_name, accountName: bank.account_name, status: bank.status } : null,
      transfers: (transfersBy.get(p.id) ?? []).map((t) => ({
        id: t.id,
        amount: t.amount,
        senderName: t.sender_name,
        senderBank: t.sender_bank,
        userId: t.user_id,
        matchedBy: t.matched_by,
        status: t.status,
        createdAt: t.created_at.toISOString(),
      })),
      payouts: pactPayouts.map((x) => ({
        id: x.id,
        kind: x.kind,
        amount: x.amount,
        fee: x.fee,
        accountName: x.account_name,
        bankName: x.bank_name,
        last4: x.last4,
        purpose: x.purpose,
        budgetItemId: x.budget_item_id,
        status: x.status,
        requestedBy: x.requested_by,
        decidedBy: x.decided_by,
        decidedAt: x.decided_at?.toISOString() ?? null,
        hasReceipt: !!x.receipt_bytes,
        failureReason: x.failure_reason,
        createdAt: x.created_at.toISOString(),
        completedAt: x.completed_at?.toISOString() ?? null,
      })),
      pinned: null,
      viewer: { role: me?.role ?? null, status: me?.status ?? null, suggestedShare: suggested },
    };
  });
}

async function withPeople<T>(q: Queryable, data: T, pacts: PactDTO[], extraIds: (string | null)[] = []): Promise<WithPeople<T>> {
  const ids = [
    ...pacts.flatMap((p) => [...p.members.map((m) => m.userId), ...p.tasks.map((t) => t.assigneeId ?? '')]),
    ...pacts.map((p) => p.organizerId),
    ...(extraIds.filter(Boolean) as string[]),
  ];
  return { data, people: await peopleByIds(q, ids) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loads a Pact the viewer may see, for service-context commands. Non-members get a
 * 404, not a 403, so ids can't be probed.
 */
export async function loadVisible(q: Queryable, pactId: string, viewerId: string, lock = false): Promise<{ pact: PactRow; member: MemberRow | null }> {
  if (!UUID.test(pactId)) throw notFound('Pact');
  const p = await q.query<PactRow>(`SELECT * FROM pacts WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [pactId]);
  if (!p.rows[0]) throw notFound('Pact');
  const m = await q.query<MemberRow>('SELECT * FROM pact_members WHERE pact_id = $1 AND user_id = $2', [pactId, viewerId]);
  const member = m.rows[0] ?? null;
  if (!member || member.status === 'left') throw notFound('Pact');
  return { pact: p.rows[0], member };
}

const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'pact';

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/* All reads below run under row-level security as the viewer (db.asUser). */

export async function listPacts(ctx: Ctx, userId: string) {
  return ctx.db.asUser(userId, async (q) => {
    const r = await q.query<PactRow>(
      `SELECT p.* FROM pacts p JOIN pact_members m ON m.pact_id = p.id
        WHERE m.user_id = $1 AND m.status IN ('joined', 'invited')
        ORDER BY (p.status = 'open') DESC, p.deadline ASC LIMIT 200`,
      [userId],
    );
    const pacts = await hydrate(q, r.rows, userId);
    return withPeople(q, pacts, pacts);
  });
}

export async function getPact(ctx: Ctx, userId: string, pactId: string) {
  if (!UUID.test(pactId)) throw notFound('Pact');
  return ctx.db.asUser(userId, async (q) => {
    const r = await q.query<PactRow>('SELECT * FROM pacts WHERE id = $1', [pactId]);
    if (!r.rows[0]) throw notFound('Pact');
    const [dto] = await hydrate(q, [r.rows[0]], userId);
    if (!dto.viewer.status || dto.viewer.status === 'left') throw notFound('Pact');
    // Invitees see the plan but not the group's activity until they join.
    const acts = dto.viewer.status === 'joined' ? await activitiesFor(q, [pactId], 50, userId) : [];
    const row = r.rows[0];
    if (dto.viewer.status === 'joined' && row.pinned_activity_id && row.pinned_by && row.pinned_at) {
      const [pinned] = await activitiesByIds(q, [row.pinned_activity_id], userId);
      if (pinned) dto.pinned = { activity: pinned, pinnedBy: row.pinned_by, pinnedAt: row.pinned_at.toISOString() };
    }
    return withPeople(q, { pact: dto, activities: acts }, [dto], [...acts.map((a) => a.actorId), dto.pinned?.pinnedBy ?? null, dto.pinned?.activity.actorId ?? null]);
  });
}

interface ActivityRow {
  id: string;
  pact_id: string;
  type: ActivityDTO['type'];
  actor_id: string | null;
  amount: number | null;
  detail: string | null;
  created_at: Date;
  update_body: string | null;
  comment_count: number;
  reactions: Record<string, number> | null;
  mine: string[] | null;
}

/**
 * The activity stream with its conversation: how many comments, which reactions and who gave them.
 * Counts come from the same query, so the feed never costs a request per item. Removed updates are left out.
 */
const ACTIVITY_SELECT = `
  SELECT a.id, a.pact_id, a.type, a.actor_id, a.amount, a.detail, a.created_at, u.body AS update_body,
         (SELECT COUNT(*)::int FROM activity_comments c WHERE c.activity_id = a.id AND c.deleted_at IS NULL) AS comment_count,
         (SELECT jsonb_object_agg(reaction, n) FROM (SELECT reaction, COUNT(*)::int AS n FROM activity_reactions r WHERE r.activity_id = a.id GROUP BY reaction) x) AS reactions,
         (SELECT array_agg(reaction) FROM activity_reactions r WHERE r.activity_id = a.id AND r.user_id = $1) AS mine
    FROM activities a LEFT JOIN pact_updates u ON u.id = a.update_id`;

const toActivityDTO = (a: ActivityRow): ActivityDTO => ({
  id: a.id,
  pactId: a.pact_id,
  type: a.type,
  actorId: a.actor_id,
  amount: a.amount,
  detail: a.detail,
  at: a.created_at.toISOString(),
  body: a.update_body,
  reactions: (a.reactions ?? {}) as ActivityDTO['reactions'],
  myReactions: (a.mine ?? []) as ActivityDTO['myReactions'],
  commentCount: a.comment_count,
});

export async function activitiesFor(q: Queryable, pactIds: string[], limit: number, viewerId: string): Promise<ActivityDTO[]> {
  if (!pactIds.length) return [];
  const r = await q.query<ActivityRow>(
    `${ACTIVITY_SELECT}
      WHERE a.pact_id = ANY($2::uuid[]) AND a.type <> 'nudge' AND (a.update_id IS NULL OR u.deleted_at IS NULL)
      ORDER BY a.created_at DESC, a.id LIMIT $3`,
    [viewerId, pactIds, limit],
  );
  return r.rows.map(toActivityDTO);
}

export async function activitiesByIds(q: Queryable, ids: string[], viewerId: string): Promise<ActivityDTO[]> {
  if (!ids.length) return [];
  const r = await q.query<ActivityRow>(`${ACTIVITY_SELECT} WHERE a.id = ANY($2::uuid[]) AND (a.update_id IS NULL OR u.deleted_at IS NULL)`, [viewerId, ids]);
  return r.rows.map(toActivityDTO);
}

export async function feed(ctx: Ctx, userId: string) {
  return ctx.db.asUser(userId, async (q) => {
    const mine = await q.query<{ pact_id: string }>(`SELECT pact_id FROM pact_members WHERE user_id = $1 AND status = 'joined'`, [userId]);
    const acts = await activitiesFor(q, mine.rows.map((r) => r.pact_id), 80, userId);
    return { data: acts, people: await peopleByIds(q, acts.map((a) => a.actorId ?? '')) };
  });
}

/** People you've shared a Pact with: the invite picker's suggestions. */
export async function recentPeople(ctx: Ctx, userId: string): Promise<PersonDTO[]> {
  return ctx.db.asUser(userId, async (q) => {
    const r = await q.query<Parameters<typeof toPerson>[0] & { last: Date }>(
      `SELECT u.id, u.first_name, u.last_name, u.color, u.tint, u.photo_url, MAX(p.created_at) AS last
         FROM pact_members mine
         JOIN pact_members other ON other.pact_id = mine.pact_id AND other.user_id <> mine.user_id AND other.status = 'joined'
         JOIN users u ON u.id = other.user_id AND u.status = 'active'
         JOIN pacts p ON p.id = mine.pact_id
        WHERE mine.user_id = $1 AND mine.status = 'joined'
        GROUP BY u.id ORDER BY last DESC LIMIT 30`,
      [userId],
    );
    return r.rows.map(toPerson);
  });
}

export async function preview(ctx: Ctx, code: string): Promise<PactPreviewDTO & { id: string }> {
  const r = await ctx.db.query<PactRow & { first_name: string; color: string; photo_url: string | null; member_count: number; account_number: string | null; bank_name: string | null; account_name: string | null }>(
    `SELECT p.*, u.first_name, u.color, u.photo_url,
            (SELECT COUNT(*)::int FROM pact_members m WHERE m.pact_id = p.id AND m.status = 'joined') AS member_count,
            b.account_number, b.bank_name, b.account_name
       FROM pacts p JOIN users u ON u.id = p.organizer_id
       LEFT JOIN pact_bank_accounts b ON b.pact_id = p.id AND b.status = 'active'
      WHERE p.invite_code = $1`,
    [code.toUpperCase()],
  );
  const p = r.rows[0];
  if (!p) throw notFound('Invite');
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    target: p.target_amount,
    raised: p.raised_amount,
    deadline: p.deadline,
    status: p.status,
    mode: p.mode,
    memberCount: p.member_count,
    organizer: { firstName: p.first_name, color: p.color, photoUrl: p.photo_url },
    // Anyone with the link can pay by transfer, app or not.
    bankAccount:
      p.account_number && (p.status === 'open' || p.status === 'funded')
        ? { accountNumber: p.account_number, bankName: p.bank_name!, accountName: p.account_name! }
        : null,
  };
}

/* --------------------------------------------------------------------------
   Commands
   -------------------------------------------------------------------------- */

type CreateInput = Omit<Required<CreatePactInput>, 'note' | 'target' | 'circleId' | 'planId'> & { note?: string; target?: number; circleId?: string; planId?: string };

export async function createPact(ctx: Ctx, userId: string, input: CreateInput, meta: ReqMeta) {
  const today = lagosToday(ctx.now());
  if (input.deadline <= today) throw badRequest('invalid_deadline', 'Choose a date after today.');
  if (input.deadline > addDays(today, MAX_PACT_DAYS)) throw badRequest('invalid_deadline', 'Pacts can run for up to a year.');
  const orders = input.mode === 'orders';
  if (orders && !input.items.length) throw badRequest('no_items', 'Add at least one item people can order.');
  // With a budget, the target is the budget total; with orders, it grows with the orders.
  // The server works it out; the client's number is ignored.
  const target = orders ? 0 : input.budget.length ? input.budget.reduce((sum, b) => sum + b.amount, 0) : input.target!;
  if ([...input.budget.map((b) => b.amount), target].some((a) => a % 100 !== 0)) throw badRequest('invalid_target', 'Use whole naira amounts.');
  if (!orders && target < MIN_PACT_TARGET) throw badRequest('invalid_target', 'The target needs to be at least ₦1,000.');
  if (target > MAX_PACT_TARGET) throw badRequest('invalid_target', 'That target is higher than PACT allows.');
  const phones = [...new Set(input.invitePhones.map((p) => normalizeNgPhone(p)))];
  if (phones.includes(null)) throw badRequest('invalid_phone', 'One of the phone numbers isn’t a valid Nigerian mobile number.');

  const id = await ctx.db.tx(async (q) => {
    const open = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pacts WHERE organizer_id = $1 AND status = 'open'`, [userId]);
    if (open.rows[0].n >= 20) throw badRequest('too_many_pacts', 'You can organise up to 20 open Pacts at once.');

    // A Pact can belong to one of the organiser's Circles. Anyone else's id is simply not found.
    // Made from a Plan: the Plan must be theirs, open and not yet a Pact, and the Pact belongs to the Plan's Circle.
    const plan = input.planId ? await lockPlanForPact(q, input.planId, userId) : null;
    const circleId = plan?.circle_id ?? input.circleId ?? null;
    if (circleId && !plan) {
      const inCircle = await q.query(`SELECT 1 FROM circle_members WHERE circle_id = $1 AND user_id = $2 AND status = 'joined'`, [circleId, userId]);
      if (!inCircle.rowCount) throw notFound('That Circle');
    }

    const base = slugify(input.title);
    let slug = `${base}-${randomCode(4).toLowerCase()}`;
    for (let i = 0; (await q.query('SELECT 1 FROM pacts WHERE slug = $1', [slug])).rowCount && i < 5; i++) slug = `${base}-${randomCode(6).toLowerCase()}`;

    const pactId = (await q.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0].id;
    const accountId = await createAccount(q, 'pact_pool', pactId);
    await q.query(
      `INSERT INTO pacts (id, slug, invite_code, title, note, category, target_amount, deadline, organizer_id, account_id, missed_goal_policy, split_mode, mode, circle_id, plan_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      // People buy what they order, so an order Pact can pay its suppliers before every order is in.
      [pactId, slug, randomCode(8), input.title.trim(), input.note?.trim() || null, input.category, target, input.deadline, userId, accountId, orders ? 'release' : input.missedGoalPolicy, input.splitMode, input.mode, circleId, plan?.id ?? null],
    );
    if (orders) await insertItems(q, pactId, userId, input.items);
    await q.query(
      `INSERT INTO pact_members (pact_id, user_id, role, status, joined_at, participation, color) VALUES ($1, $2, 'organizer', 'joined', now(), 'both', $3)`,
      [pactId, userId, await colorFor(q, pactId, userId)],
    );
    for (const [i, b] of input.budget.entries()) {
      await q.query('INSERT INTO budget_items (pact_id, name, amount, position, created_by) VALUES ($1, $2, $3, $4, $5)', [pactId, b.name, b.amount, i, userId]);
    }
    for (const t of input.tasks) {
      await q.query('INSERT INTO tasks (pact_id, title, created_by) VALUES ($1, $2, $3)', [pactId, t.title, userId]);
    }
    await recordActivity(q, { pactId, actorId: userId, type: 'created' });
    await invite(ctx, q, pactId, userId, input.title.trim(), input.inviteUserIds, phones as string[]);
    if (plan) await completeConversion(ctx, q, plan, pactId, userId, { tasks: input.tasks.length, invitees: input.inviteUserIds.length + phones.length, hasBudget: target > 0 });
    await audit(q, { actorId: userId, action: 'pact.created', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { target, budgetLines: input.budget.length, mode: input.mode, items: input.items.length } });
    // Reminders and the missed-goal rule run from the deadline sweep.
    return pactId;
  });
  return getPact(ctx, userId, id);
}

async function invite(ctx: Ctx, q: Queryable, pactId: string, inviterId: string, title: string, userIds: string[], phones: string[]) {
  const inviter = await getUser(q, inviterId);
  const count = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pact_members WHERE pact_id = $1 AND status <> 'left'`, [pactId]);
  if (count.rows[0].n + userIds.length + phones.length > MAX_PACT_MEMBERS) throw badRequest('too_many_members', `A Pact can have up to ${MAX_PACT_MEMBERS} people.`);

  // Invites by id only reach people the inviter already shares a Pact or a Circle with; anyone else is invited by phone.
  if (userIds.length) {
    const ok = await q.query<{ id: string }>(
      `SELECT DISTINCT b.user_id AS id FROM pact_members a JOIN pact_members b ON b.pact_id = a.pact_id
        WHERE a.user_id = $1 AND a.status = 'joined' AND b.status = 'joined' AND b.user_id = ANY($2::uuid[])
       UNION
       SELECT DISTINCT b.user_id FROM circle_members a JOIN circle_members b ON b.circle_id = a.circle_id
        WHERE a.user_id = $1 AND a.status = 'joined' AND b.status = 'joined' AND b.user_id = ANY($2::uuid[])`,
      [inviterId, userIds],
    );
    if (ok.rows.length !== new Set(userIds.filter((id) => id !== inviterId)).size) {
      throw badRequest('unknown_people', 'Invite people you haven’t done a Pact with by their phone number.');
    }
  }
  // Phone numbers that already belong to someone become direct invites.
  const known = phones.length ? await q.query<{ id: string; phone: string }>(`SELECT id, phone FROM users WHERE phone = ANY($1::text[]) AND status = 'active'`, [phones]) : { rows: [] };
  const direct = [...new Set([...userIds, ...known.rows.map((u) => u.id)])].filter((id) => id !== inviterId);
  const invited: string[] = [];
  for (const uid of direct) {
    const r = await q.query(
      `INSERT INTO pact_members (pact_id, user_id, role, status, invited_by) VALUES ($1, $2, 'member', 'invited', $3)
       ON CONFLICT (pact_id, user_id) DO UPDATE SET status = 'invited', invited_by = EXCLUDED.invited_by WHERE pact_members.status = 'left'
       RETURNING user_id`,
      [pactId, uid, inviterId],
    );
    if (r.rowCount) invited.push(uid);
  }
  await notify(q, invited, { type: 'invite', title: 'You’re invited', body: `${inviter.first_name} invited you to ${title}.`, pactId, meta: { actor: inviter.first_name } });

  const knownPhones = new Set(known.rows.map((u) => u.phone));
  const smsTargets = phones.filter((p) => !knownPhones.has(p) && p !== inviter.phone);
  // Invite texts cost money and land on strangers' phones: cap them per person per day.
  if (smsTargets.length) {
    const sent = await q.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pact_phone_invites WHERE invited_by = $1 AND created_at > now() - interval '24 hours'`,
      [inviterId],
    );
    if (sent.rows[0].n + smsTargets.length > SMS_INVITES_PER_DAY) {
      throw new AppError(429, 'invite_limit', `You can text up to ${SMS_INVITES_PER_DAY} new numbers a day. Share the invite link instead.`);
    }
  }
  for (const phone of smsTargets) {
    const r = await q.query(`INSERT INTO pact_phone_invites (pact_id, phone, invited_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`, [pactId, phone, inviterId]);
    if (r.rowCount) await enqueue(q, 'sms.invite', { pactId, phone, inviter: inviter.first_name });
  }
  return invited.length;
}

export async function inviteMore(ctx: Ctx, userId: string, pactId: string, userIds: string[], rawPhones: string[]) {
  const phones = rawPhones.map((p) => normalizeNgPhone(p));
  if (phones.includes(null)) throw badRequest('invalid_phone', 'One of the phone numbers isn’t a valid Nigerian mobile number.');
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member?.status !== 'joined') throw forbidden('Join the Pact before inviting people.');
    if (pact.status !== 'open') throw badRequest('pact_closed', 'This Pact isn’t taking new people.');
    await invite(ctx, q, pactId, userId, pact.title, userIds, phones as string[]);
  });
  return getPact(ctx, userId, pactId);
}

export async function joinTx(q: Queryable, pact: PactRow, userId: string, participation: Participation | null = null) {
  if (pact.status !== 'open') throw badRequest('pact_closed', 'This Pact isn’t taking new people.');
  const count = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pact_members WHERE pact_id = $1 AND status = 'joined'`, [pact.id]);
  if (count.rows[0].n >= MAX_PACT_MEMBERS) throw badRequest('pact_full', 'This Pact is full.');
  const r = await q.query(
    `INSERT INTO pact_members (pact_id, user_id, role, status, joined_at, participation, color) VALUES ($1, $2, 'member', 'joined', now(), $3, $4)
     ON CONFLICT (pact_id, user_id) DO UPDATE SET status = 'joined', joined_at = now(),
       participation = COALESCE(EXCLUDED.participation, pact_members.participation), color = EXCLUDED.color
     WHERE pact_members.status <> 'joined'
     RETURNING user_id`,
    [pact.id, userId, participation, await colorFor(q, pact.id, userId)],
  );
  if (!r.rowCount) return false;
  const user = await getUser(q, userId);
  await recordActivity(q, { pactId: pact.id, actorId: userId, type: 'join' });
  await notifyGrouped(q, [pact.organizer_id], {
    type: 'join',
    pactId: pact.id,
    refId: pact.id,
    first: { title: `${user.first_name} joined`, body: `${user.first_name} joined ${pact.title}.` },
    meta: { actor: user.first_name },
    many: (n) => ({ title: `${n} people joined`, body: `New people in ${pact.title}.` }),
  });
  return true;
}

export async function joinByCode(ctx: Ctx, userId: string, code: string, participation: Participation | null = null) {
  const pactId = await ctx.db.tx(async (q) => {
    const p = await q.query<PactRow>('SELECT * FROM pacts WHERE invite_code = $1 FOR UPDATE', [code.toUpperCase()]);
    if (!p.rows[0]) throw notFound('Invite');
    const joined = await joinTx(q, p.rows[0], userId, participation);
    // The choice made on the invite page is only known here; later changes are read from the activity feed.
    if (joined && participation) await track(q, ctx.config, 'participation_selected', { userId, pactId: p.rows[0].id, props: { participation, at: 'join' } }, true);
    return p.rows[0].id;
  });
  return getPact(ctx, userId, pactId);
}

export async function acceptInvite(ctx: Ctx, userId: string, pactId: string, participation: Participation | null = null) {
  await ctx.db.tx(async (q) => {
    const { pact } = await loadVisible(q, pactId, userId, true);
    const joined = await joinTx(q, pact, userId, participation);
    if (joined && participation) await track(q, ctx.config, 'participation_selected', { userId, pactId, props: { participation, at: 'join' } }, true);
  });
  return getPact(ctx, userId, pactId);
}

export async function leave(ctx: Ctx, userId: string, pactId: string) {
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member!.role === 'organizer') throw badRequest('organizer_cannot_leave', 'Organisers can close the Pact instead of leaving it.');
    if (member!.contributed > 0 && pact.status === 'open') throw badRequest('has_contributed', 'You’ve contributed, so you stay in until the Pact closes.');
    await q.query(`UPDATE pact_members SET status = 'left' WHERE pact_id = $1 AND user_id = $2`, [pactId, userId]);
    if (member!.status === 'joined') await recordActivity(q, { pactId, actorId: userId, type: 'left' });
  });
}

/** In an order Pact, people pay for their own orders: no more than they owe. */
async function ordersBlocker(q: Queryable, pact: PactRow, userId: string, amount: number): Promise<AppError | null> {
  if (pact.mode !== 'orders') return null;
  const owed = await orderOutstanding(q, pact.id, userId);
  if (owed <= 0) return badRequest('nothing_owed', 'You don’t owe anything here. Order something first.');
  if (amount > owed) return new AppError(422, 'exceeds_owed', `You owe ${formatNgn(owed)} for your orders.`, { remaining: owed });
  return null;
}

/** Why a contribution can't go ahead right now, or null if it can. Checked under the Pact's row lock. */
function contributionBlocker(pact: PactRow, amount: number, today: string): AppError | null {
  if (pact.status !== 'open') return badRequest('pact_closed', pact.status === 'funded' ? 'This Pact is already fully funded.' : 'This Pact is closed.');
  if (pact.deadline < today) return badRequest('pact_past_deadline', 'This Pact’s deadline has passed.');
  const remaining = pact.target_amount - pact.raised_amount;
  if (amount > remaining) return new AppError(422, 'exceeds_remaining', `Only ${formatNgn(remaining)} is left to reach the goal.`, { remaining });
  return null;
}

/**
 * Wallet → Pact pool, inside the caller's transaction, with the Pact row already locked.
 * Shared by contributions from the wallet and by direct payments into a Pact.
 */
async function contributeTx(q: Queryable, pact: PactRow, member: MemberRow, userId: string, amount: number, via: 'wallet' | 'direct') {
  if (member.status === 'invited') await joinTx(q, pact, userId);
  const wallet = await walletAccountId(q, userId);
  await post(q, {
    kind: 'contribution',
    reference: `contribution:${pact.id}:${randomCode(16)}`,
    description: `Contribution to ${pact.title}`,
    userId,
    pactId: pact.id,
    metadata: { via },
    postings: [
      { accountId: wallet, amount: -amount },
      { accountId: pact.account_id, amount },
    ],
  });
  return applyToPact(q, pact, { userId }, amount);
}

/**
 * What every payment into a Pact does once the money is in the pool, whether it came
 * from a wallet, a direct payment or a bank transfer: count it for the member (or show
 * the guest), move the total, mark milestones and the goal, tell the organiser.
 * Runs inside the caller's transaction with the Pact row locked.
 */
export async function applyToPact(q: Queryable, pact: PactRow, from: { userId: string } | { guestName: string }, amount: number) {
  const userId = 'userId' in from ? from.userId : null;
  if (userId) {
    // A "split the rest" ask is settled once this person has put in at least that much since.
    await q.query(
      `UPDATE pact_members SET contributed = contributed + $3,
         participation = CASE WHEN participation IS NULL OR participation = 'later' THEN 'money' WHEN participation = 'task' THEN 'both' ELSE participation END,
         requested_amount = CASE WHEN requested_amount IS NOT NULL AND $3 >= requested_amount THEN NULL
                                 WHEN requested_amount IS NOT NULL THEN requested_amount - $3 END
       WHERE pact_id = $1 AND user_id = $2`,
      [pact.id, userId, amount],
    );
    await checkPledgeKept(q, pact.id, userId);
  }
  const upd = await q.query<{ raised_amount: number }>('UPDATE pacts SET raised_amount = raised_amount + $2 WHERE id = $1 RETURNING raised_amount', [pact.id, amount]);
  const guestName = 'guestName' in from ? from.guestName : null;
  if (guestName) await recordActivity(q, { pactId: pact.id, actorId: null, type: 'guest_contribution', amount, detail: guestName });
  else await recordActivity(q, { pactId: pact.id, actorId: userId, type: 'contribution', amount });
  // Momentum markers at halfway and 80%, recorded once each.
  const before = (upd.rows[0].raised_amount - amount) / pact.target_amount;
  const after = upd.rows[0].raised_amount / pact.target_amount;
  for (const mark of [0.5, 0.8]) {
    if (before < mark && after >= mark && after < 1) await recordActivity(q, { pactId: pact.id, actorId: null, type: 'milestone', detail: `${mark * 100}%` });
  }
  const members = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined'`, [pact.id]);
  // Bank transfers can still arrive after the goal is reached; only the first crossing completes it.
  const completed = pact.status === 'open' && upd.rows[0].raised_amount >= pact.target_amount;
  if (completed) {
    await q.query(`UPDATE pacts SET status = 'funded', funded_at = now() WHERE id = $1`, [pact.id]);
    await recordActivity(q, { pactId: pact.id, actorId: userId, type: 'completed' });
    await notify(q, members.rows.map((m) => m.user_id), { type: 'funded', title: 'Goal reached', body: `${pact.title} is funded. ${formatNgn(pact.target_amount)} is ready to make it happen.`, pactId: pact.id, push: `${pact.title} reached its goal.` });
  } else if (userId !== pact.organizer_id) {
    const who = guestName ?? (await getUser(q, userId!)).first_name;
    // A busy Pact gets many contributions: the organiser sees one growing line, not one per payment, and no push.
    await notifyGrouped(q, [pact.organizer_id], {
      type: 'contribution',
      pactId: pact.id,
      refId: pact.id,
      first: { title: 'New contribution', body: `${who} added ${formatNgn(amount)} to ${pact.title}.` },
      meta: { actor: who, amount },
      many: (n) => ({ title: `${n} new contributions`, body: `People are adding to ${pact.title}.` }),
    });
  }
  return completed;
}

/**
 * Wallet → Pact pool. The Pact row is locked first, then the ledger locks both
 * accounts, so concurrent contributions can't push a Pact past its target or a
 * wallet below zero.
 */
export async function contribute(ctx: Ctx, userId: string, pactId: string, amount: number, pin: string, meta: ReqMeta) {
  if (amount % 100 !== 0) throw badRequest('invalid_amount', 'Contribute whole naira amounts.');
  await loadVisible(ctx.db, pactId, userId);
  await verifyPin(ctx, userId, pin, meta);
  const today = lagosToday(ctx.now());
  const completed = await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    const blocked = contributionBlocker(pact, amount, today) ?? (await ordersBlocker(q, pact, userId, amount));
    if (blocked) throw blocked;
    const done = await contributeTx(q, pact, member!, userId, amount, 'wallet');
    await audit(q, { actorId: userId, action: 'pact.contribution', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { amount } });
    return done;
  });
  const out = await getPact(ctx, userId, pactId);
  return { ...out, completed };
}

/** Before a direct payment starts: may this person pay this much into this Pact? */
export async function assertCanPayInto(ctx: Ctx, userId: string, pactId: string, amount: number) {
  if (amount % 100 !== 0) throw badRequest('invalid_amount', 'Contribute whole naira amounts.');
  const { pact } = await loadVisible(ctx.db, pactId, userId);
  const blocked = contributionBlocker(pact, amount, lagosToday(ctx.now())) ?? (await ordersBlocker(ctx.db, pact, userId, amount));
  if (blocked) throw blocked;
  return pact.title;
}

/**
 * After a direct payment settles (inside the settlement transaction): move it from the
 * wallet into the Pact. If the Pact filled up or closed in the meantime, the money stays
 * in the wallet and nothing is lost.
 */
export async function applyDirectPayment(ctx: Ctx, q: Queryable, userId: string, pactId: string, amount: number): Promise<'contributed' | 'kept'> {
  const p = await q.query<PactRow>('SELECT * FROM pacts WHERE id = $1 FOR UPDATE', [pactId]);
  const m = await q.query<MemberRow>('SELECT * FROM pact_members WHERE pact_id = $1 AND user_id = $2', [pactId, userId]);
  const pact = p.rows[0];
  const member = m.rows[0];
  if (!pact || !member || member.status === 'left' || contributionBlocker(pact, amount, lagosToday(ctx.now()))) {
    await notify(q, [userId], {
      type: 'topup',
      title: 'Payment kept in your wallet',
      body: `${formatNgn(amount)} arrived, but ${pact?.title ?? 'the Pact'} couldn’t take it any more. It’s safe in your wallet.`,
      pactId,
    });
    return 'kept';
  }
  await contributeTx(q, pact, member, userId, amount, 'direct');
  await audit(q, { actorId: userId, action: 'pact.contribution', targetType: 'pact', targetId: pactId, metadata: { amount, via: 'direct' } });
  return 'contributed';
}

/** Organiser moves the pool into their wallet: once funded, or after a missed deadline if the Pact's rule allows it. */
export async function release(ctx: Ctx, userId: string, pactId: string, pin: string, meta: ReqMeta) {
  // Authorisation first: outsiders learn nothing, not even that KYC would be needed.
  const { member } = await loadVisible(ctx.db, pactId, userId);
  if (member!.role !== 'organizer') throw forbidden('Only the organiser can release the funds.');
  await verifyPin(ctx, userId, pin, meta);
  const user = await getUser(ctx.db, userId);
  if (!TIER_LIMITS[user.kyc_tier as KycTier].canRelease) {
    throw new AppError(403, 'kyc_required', 'Verify your BVN to release funds. It takes about a minute.');
  }
  await ctx.db.tx(async (q) => {
    const { pact, member: m } = await loadVisible(q, pactId, userId, true);
    if (m!.role !== 'organizer') throw forbidden('Only the organiser can release the funds.');
    // Releasing moves money; it does not say the plan happened. That is a separate step, taken first.
    if (pact.status === 'funded' && !pact.completed_at) throw badRequest('complete_first', 'Complete the Pact first, then release what is left.');
    await startRelease(ctx, q, pact, userId, user.first_name, meta);
  });
  return getPact(ctx, userId, pactId);
}

/** The release itself: asks the co-organiser when there is one, otherwise moves the pool to the organiser's wallet. */
async function startRelease(ctx: Ctx, q: Queryable, pact: PactRow, userId: string, firstName: string, meta: ReqMeta) {
  await settleWaitingPayouts(q, pact, 'block');
  assertReleasable(ctx, pact);
  // With a co-organiser, the pool doesn't go to the organiser's wallet on one person's word.
  const co = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND role = 'co_organizer' AND status = 'joined'`, [pact.id]);
  if (co.rows[0]) {
    if (pact.release_requested_by) throw badRequest('release_requested', 'You’ve already asked. Your co-organiser will decide.');
    await q.query('UPDATE pacts SET release_requested_by = $2, release_requested_at = now() WHERE id = $1', [pact.id, userId]);
    const pool = (await q.query<{ balance: number }>('SELECT balance FROM accounts WHERE id = $1', [pact.account_id])).rows[0].balance;
    await recordActivity(q, { pactId: pact.id, actorId: userId, type: 'release_requested', amount: pool });
    await notify(q, [co.rows[0].user_id], { type: 'approval', title: 'Approve the release', body: `${firstName} wants to release ${formatNgn(pool)} from ${pact.title} to their wallet.`, pactId: pact.id, push: `Your approval is needed for ${pact.title}.` });
    await audit(q, { actorId: userId, action: 'pact.release_requested', targetType: 'pact', targetId: pact.id, ip: meta.ip, metadata: { amount: pool } });
    return;
  }
  await releaseTx(ctx, q, pact, userId, 'organizer');
  await audit(q, { actorId: userId, action: 'pact.released', targetType: 'pact', targetId: pact.id, ip: meta.ip });
}

/**
 * The organiser says the plan actually happened. Funded is not finished: reaching the target
 * gave the group the money, this records that the group used it. It moves no money by itself.
 *
 * If anything is left in the pool the organiser has to say what happens to it, so nothing is
 * released by silence: `releaseRemaining: true` completes and releases it in one go (through the
 * normal release rules: PIN, verified identity, co-organiser approval). To keep paying from the
 * Pact instead, don't complete yet.
 */
export async function completePact(ctx: Ctx, userId: string, pactId: string, input: { releaseRemaining?: boolean; pin?: string }, meta: ReqMeta) {
  const { member } = await loadVisible(ctx.db, pactId, userId);
  if (member!.role !== 'organizer') throw forbidden('Only the organiser can complete the Pact.');
  // Releasing what is left is a money move: same checks as a release, done before anything changes.
  let firstName = '';
  if (input.releaseRemaining) {
    if (!input.pin) throw badRequest('pin_required', 'Enter your PIN to release what is left.');
    await verifyPin(ctx, userId, input.pin, meta);
    const user = await getUser(ctx.db, userId);
    if (!TIER_LIMITS[user.kyc_tier as KycTier].canRelease) {
      throw new AppError(403, 'kyc_required', 'Verify your BVN to release funds. It takes about a minute.');
    }
    firstName = user.first_name;
  }
  await ctx.db.tx(async (q) => {
    const { pact, member: m } = await loadVisible(q, pactId, userId, true);
    if (m!.role !== 'organizer') throw forbidden('Only the organiser can complete the Pact.');
    if (pact.completed_at || pact.status === 'released') throw badRequest('already_completed', 'This Pact is already completed.');
    if (pact.status !== 'funded') {
      throw badRequest(pact.status === 'open' ? 'not_funded' : 'pact_closed', pact.status === 'open' ? 'A Pact can be completed once it is funded.' : 'This Pact is closed.');
    }
    // A payment still on its way decides what is left, so it has to land (or be turned down) first.
    const inFlight = await q.query(`SELECT 1 FROM pact_payouts WHERE pact_id = $1 AND kind = 'vendor' AND status IN ('awaiting_approval', 'pending', 'processing') LIMIT 1`, [pactId]);
    if (inFlight.rowCount) throw badRequest('payment_pending', 'A payment is still waiting for approval or on its way. Let it finish before completing the Pact.');
    if (pact.release_requested_by) throw badRequest('release_requested', 'A release is waiting for your co-organiser. Hear back from them first.');
    const pool = (await q.query<{ balance: number }>('SELECT balance FROM accounts WHERE id = $1', [pact.account_id])).rows[0].balance;
    if (pool > 0 && input.releaseRemaining === undefined) {
      throw new AppError(422, 'remaining_balance', `${formatNgn(pool)} is still in this Pact. Say what should happen to it.`, { remaining: pool });
    }
    await q.query('UPDATE pacts SET completed_at = now(), completed_by = $2 WHERE id = $1', [pactId, userId]);
    await recordActivity(q, { pactId, actorId: userId, type: 'pact_completed' });
    await completeFromPact(q, pactId, userId);
    const others = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined' AND user_id <> $2`, [pactId, userId]);
    await notify(q, others.rows.map((x) => x.user_id), { type: 'completed', title: 'We made it happen', body: `${pact.title} is complete.`, pactId, push: `${pact.title} is complete.` });
    await audit(q, { actorId: userId, action: 'pact.completed', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { remaining: pool, release: !!input.releaseRemaining && pool > 0 } });
    if (pool > 0 && input.releaseRemaining) await startRelease(ctx, q, { ...pact, completed_at: new Date() }, userId, firstName, meta);
  });
  return getPact(ctx, userId, pactId);
}

/** The co-organiser decides on the organiser's release request. */
export async function decideRelease(ctx: Ctx, userId: string, pactId: string, decision: 'approve' | 'decline', pin: string | null, meta: ReqMeta) {
  const { member } = await loadVisible(ctx.db, pactId, userId);
  if (member!.role !== 'co_organizer' && !(decision === 'decline' && member!.role === 'organizer')) {
    throw forbidden('Only the co-organiser can approve a release.');
  }
  if (decision === 'approve') {
    if (!pin) throw badRequest('pin_required', 'Enter your PIN to approve.');
    await verifyPin(ctx, userId, pin, meta);
    const me = await getUser(ctx.db, userId);
    if (!TIER_LIMITS[me.kyc_tier as KycTier].canRelease) throw new AppError(403, 'kyc_required', 'Verify your BVN to approve a release.');
  }
  await ctx.db.tx(async (q) => {
    const { pact, member: m } = await loadVisible(q, pactId, userId, true);
    if (!pact.release_requested_by) throw badRequest('no_release_request', 'Nobody has asked to release the funds.');
    if (decision === 'approve') {
      if (m!.role !== 'co_organizer') throw forbidden('Only the co-organiser can approve a release.');
      await settleWaitingPayouts(q, pact, 'block');
      await releaseTx(ctx, q, pact, pact.organizer_id, 'organizer');
    } else {
      await q.query('UPDATE pacts SET release_requested_by = NULL, release_requested_at = NULL WHERE id = $1', [pactId]);
      if (m!.role === 'co_organizer') {
        await notify(q, [pact.organizer_id], { type: 'approval', title: 'Release not approved', body: `The funds stay in ${pact.title}. You can still pay vendors from it.`, pactId });
      }
    }
    await audit(q, { actorId: userId, action: `pact.release_${decision === 'approve' ? 'approved' : 'declined'}`, targetType: 'pact', targetId: pactId, ip: meta.ip });
  });
  return getPact(ctx, userId, pactId);
}

/** Funded, or past the deadline with a Pact whose rule is to release: otherwise a clear reason. */
function assertReleasable(ctx: Ctx, pact: PactRow) {
  const missed = pact.status === 'open' && pact.deadline < lagosToday(ctx.now());
  if (pact.status === 'funded' || (missed && pact.missed_goal_policy === 'release')) return;
  if (pact.status === 'open' && !missed) throw badRequest('not_funded', 'Funds can be released once the goal is reached.');
  if (missed) throw badRequest('refund_policy', 'Everyone agreed to refunds if the goal was missed, so this Pact will refund.');
  throw badRequest('pact_closed', 'This Pact is already closed.');
}

async function releaseTx(ctx: Ctx, q: Queryable, pact: PactRow, actorId: string | null, by: 'organizer' | 'rule') {
  assertReleasable(ctx, pact);
  const pool = await q.query<{ balance: number }>('SELECT balance FROM accounts WHERE id = $1', [pact.account_id]);
  const amount = pool.rows[0].balance;
  if (amount > 0) {
    await post(q, {
      kind: 'pact_release',
      reference: `release:${pact.id}`,
      description: `${pact.title} funds released`,
      userId: actorId,
      pactId: pact.id,
      metadata: { by },
      postings: [
        { accountId: pact.account_id, amount: -amount },
        { accountId: await walletAccountId(q, pact.organizer_id), amount },
      ],
    });
  }
  await q.query(`UPDATE pacts SET status = 'released', closed_at = now(), release_requested_by = NULL, release_requested_at = NULL WHERE id = $1`, [pact.id]);
  await closePactAccountTx(q, pact.id);
  await closePledgesTx(q, pact.id);
  await recordActivity(q, { pactId: pact.id, actorId: pact.organizer_id, type: 'released', amount });
  const members = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined' AND user_id <> $2`, [pact.id, pact.organizer_id]);
  await notify(q, members.rows.map((m) => m.user_id), { type: 'released', title: 'Funds released', body: `${formatNgn(amount)} from ${pact.title} was released to the organiser.`, pactId: pact.id, meta: { amount } });
  await notify(q, [pact.organizer_id], { type: 'released', title: 'Funds in your wallet', body: `${formatNgn(amount)} from ${pact.title} is in your wallet.`, pactId: pact.id, meta: { amount } });
}

/**
 * Splits `available` across what each person is owed, in proportion, to the kobo.
 * Leftover kobo from rounding go one each to the largest remainders.
 */
export function prorate(owed: { key: string; amount: number }[], available: number): Map<string, number> {
  const total = owed.reduce((s, o) => s + o.amount, 0);
  const out = new Map<string, number>();
  if (total <= 0) return out;
  if (available >= total) {
    for (const o of owed) out.set(o.key, o.amount);
    return out;
  }
  const exact = owed.map((o) => ({ key: o.key, raw: (o.amount * available) / total }));
  let left = available;
  for (const e of exact) {
    const v = Math.floor(e.raw);
    out.set(e.key, v);
    left -= v;
  }
  for (const e of [...exact].sort((a, b) => (b.raw % 1) - (a.raw % 1))) {
    if (left <= 0) break;
    out.set(e.key, out.get(e.key)! + 1);
    left--;
  }
  return out;
}

/**
 * Gives the pool back the way it came in: wallet contributions to wallets, and every bank
 * transfer to the account it was sent from. Who a transfer is shown under never decides
 * where its refund goes, so reassigning a stranger's transfer can't redirect their money.
 * If vendors were already paid, everyone gets the same share of what's left.
 */
async function refundTx(q: Queryable, pact: PactRow, finalStatus: 'refunded' | 'cancelled', actorId: string | null) {
  if (!['open', 'funded'].includes(pact.status)) throw badRequest('pact_closed', 'This Pact is already closed.');
  const contributors = await q.query<{ user_id: string; contributed: number }>(
    'SELECT user_id, contributed FROM pact_members WHERE pact_id = $1 AND contributed > 0',
    [pact.id],
  );
  const transfers = await q.query<{ id: string; amount: number; user_id: string | null }>(
    `SELECT id, amount, user_id FROM pact_transfers WHERE pact_id = $1 AND status = 'credited'`,
    [pact.id],
  );
  const byTransfer = new Map<string, number>();
  for (const t of transfers.rows) if (t.user_id) byTransfer.set(t.user_id, (byTransfer.get(t.user_id) ?? 0) + t.amount);
  const fromWallet = (c: { user_id: string; contributed: number }) => Math.max(0, c.contributed - (byTransfer.get(c.user_id) ?? 0));
  const pool = (await q.query<{ balance: number }>('SELECT balance FROM accounts WHERE id = $1', [pact.account_id])).rows[0].balance;
  const shares = prorate(
    [...contributors.rows.map((c) => ({ key: `m:${c.user_id}`, amount: fromWallet(c) })), ...transfers.rows.map((t) => ({ key: `t:${t.id}`, amount: t.amount }))],
    pool,
  );
  const walletShare = (userId: string) => shares.get(`m:${userId}`) ?? 0;
  const toWallets = contributors.rows.reduce((s, c) => s + walletShare(c.user_id), 0);
  if (toWallets > 0) {
    const postings = [{ accountId: pact.account_id, amount: -toWallets }];
    for (const c of contributors.rows) if (walletShare(c.user_id) > 0) postings.push({ accountId: await walletAccountId(q, c.user_id), amount: walletShare(c.user_id) });
    await post(q, { kind: 'refund', reference: `refund:${pact.id}`, description: `Refund from ${pact.title}`, userId: actorId, pactId: pact.id, postings });
  }
  await refundGuestsTx(q, pact, new Map(transfers.rows.map((t) => [t.id, shares.get(`t:${t.id}`) ?? 0])));
  const refunded = [...shares.values()].reduce((s, v) => s + v, 0);
  await q.query(`UPDATE pacts SET status = $2, closed_at = now(), release_requested_by = NULL, release_requested_at = NULL WHERE id = $1`, [pact.id, finalStatus]);
  await closePactAccountTx(q, pact.id);
  await closePledgesTx(q, pact.id);
  await recordActivity(q, { pactId: pact.id, actorId, type: finalStatus === 'cancelled' ? 'cancelled' : 'refunded', amount: refunded });
  const members = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined'`, [pact.id]);
  for (const c of contributors.rows) {
    const wallet = walletShare(c.user_id);
    const bank = transfers.rows.filter((t) => t.user_id === c.user_id).reduce((s, t) => s + (shares.get(`t:${t.id}`) ?? 0), 0);
    const parts = [wallet ? `${formatNgn(wallet)} is back in your wallet` : '', bank ? `${formatNgn(bank)} is on its way back to the bank account you paid from` : ''].filter(Boolean);
    const short = wallet + bank < c.contributed ? ' The rest had already been paid to vendors.' : '';
    await notify(q, [c.user_id], { type: 'refund', title: 'Refunded', body: `${parts.join(', and ')} from ${pact.title}.${short}`, pactId: pact.id });
  }
  const others = members.rows.map((m) => m.user_id).filter((id) => !contributors.rows.some((c) => c.user_id === id));
  await notify(q, others, { type: 'closed', title: `${pact.title} closed`, body: finalStatus === 'cancelled' ? 'The organiser closed this Pact.' : 'The goal wasn’t reached, so everyone was refunded.', pactId: pact.id });
  return refunded;
}

export async function cancel(ctx: Ctx, userId: string, pactId: string, pin: string, meta: ReqMeta) {
  await loadVisible(ctx.db, pactId, userId);
  await verifyPin(ctx, userId, pin, meta);
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member!.role !== 'organizer') throw forbidden('Only the organiser can close the Pact.');
    // Once the plan has happened there is nothing to call off: what is left is released, not refunded.
    if (pact.completed_at) throw badRequest('pact_completed', 'This Pact is completed. Release what is left instead.');
    await settleWaitingPayouts(q, pact, 'block');
    await refundTx(q, pact, 'cancelled', userId);
    await audit(q, { actorId: userId, action: 'pact.cancelled', targetType: 'pact', targetId: pactId, ip: meta.ip });
  });
  return getPact(ctx, userId, pactId);
}

/**
 * Reminders that read like momentum, not debt collection: each person gets the most
 * useful line for where they stand. Rule-based and at most once a day per person.
 */
export async function nudge(ctx: Ctx, userId: string, pactId: string) {
  return ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member!.role !== 'organizer') throw forbidden('Only the organiser can send reminders.');
    if (pact.status !== 'open') throw badRequest('pact_closed', 'This Pact is closed.');
    const targets = await q.query<{ user_id: string; participation: Participation | null; requested_amount: number | null; contributed: number }>(
      `UPDATE pact_members SET last_nudged_at = now()
        WHERE pact_id = $1 AND user_id <> $2 AND status IN ('joined', 'invited')
          AND (contributed = 0 OR requested_amount IS NOT NULL OR participation IS NULL OR participation = 'later')
          AND (last_nudged_at IS NULL OR last_nudged_at < now() - make_interval(hours => $3))
        RETURNING user_id, participation, requested_amount, contributed`,
      [pactId, userId, NUDGE_COOLDOWN_HOURS],
    );
    if (!targets.rowCount) throw conflict('nothing_to_nudge', 'Everyone is in, or was reminded in the last day.');
    const pct = Math.floor((pact.raised_amount / pact.target_amount) * 100);
    const days = Math.max(0, Math.round((new Date(`${pact.deadline}T00:00:00Z`).getTime() - new Date(`${lagosToday(ctx.now())}T00:00:00Z`).getTime()) / 86_400_000));
    const unconfirmed = targets.rows.filter((t) => !t.participation || t.participation === 'later').length;
    const openTask = (await q.query<{ title: string }>(`SELECT title FROM tasks WHERE pact_id = $1 AND assignee_id IS NULL AND status <> 'done' ORDER BY created_at LIMIT 1`, [pactId])).rows[0];
    const when = days === 0 ? 'It’s today' : `${days} ${days === 1 ? 'day' : 'days'} to go`;

    for (const t of targets.rows) {
      let body: string;
      if (t.requested_amount) body = `You’re ${formatNgn(t.requested_amount)} away from your share. ${pact.title} is ${pct}% funded.`;
      else if (!t.participation || t.participation === 'later')
        body = unconfirmed > 1 ? `${pact.title} is ${pct}% funded. You’re one of ${unconfirmed} people who haven’t confirmed yet.` : `${pact.title} is ${pct}% funded. Let everyone know how you’re showing up.`;
      else if (openTask && (t.participation === 'task' || t.participation === 'both')) body = `“${openTask.title}” still needs someone for ${pact.title}. Want to take it?`;
      else body = `${when} for ${pact.title}. The group is ${pct}% funded.`;
      await notify(q, [t.user_id], { type: 'nudge', title: pact.title, body, pactId });
    }
    await recordActivity(q, { pactId, actorId: userId, type: 'nudge' });
    return { reminded: targets.rowCount };
  });
}

/* --------------------------------------------------------------------------
   Deadline sweep (worker, hourly): reminders and the missed-goal rule
   -------------------------------------------------------------------------- */

export async function sweepDeadlines(ctx: Ctx) {
  const today = lagosToday(ctx.now());

  // Three days out: remind people who haven't contributed. Deduped per Pact per day.
  const soon = await ctx.db.query<{ id: string; title: string }>(`SELECT id, title FROM pacts WHERE status = 'open' AND deadline = $1`, [addDays(today, 3)]);
  for (const p of soon.rows) {
    await ctx.db.tx(async (q) => {
      const done = await q.query(`INSERT INTO jobs (type, payload, dedupe_key, done_at) VALUES ('marker', '{}', $1, now()) ON CONFLICT DO NOTHING RETURNING id`, [`reminder3:${p.id}`]);
      if (!done.rowCount) return;
      const who = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined' AND contributed = 0`, [p.id]);
      await notify(q, who.rows.map((w) => w.user_id), { type: 'reminder', title: '3 days left', body: `${p.title} closes in 3 days. Add your share before then.`, pactId: p.id });
    });
  }

  // Two days out: whoever still holds an unfinished task is told it is theirs and time is short. Deduped per Pact.
  const closing = await ctx.db.query<{ id: string; title: string }>(`SELECT id, title FROM pacts WHERE status IN ('open', 'funded') AND completed_at IS NULL AND deadline = $1`, [addDays(today, 2)]);
  for (const p of closing.rows) {
    await ctx.db.tx(async (q) => {
      const done = await q.query(`INSERT INTO jobs (type, payload, dedupe_key, done_at) VALUES ('marker', '{}', $1, now()) ON CONFLICT DO NOTHING RETURNING id`, [`taskdue2:${p.id}`]);
      if (!done.rowCount) return;
      const holders = await q.query<{ assignee_id: string; n: number; first: string }>(
        `SELECT assignee_id, count(*)::int AS n, min(title) AS first FROM tasks WHERE pact_id = $1 AND assignee_id IS NOT NULL AND status <> 'done' GROUP BY assignee_id`,
        [p.id],
      );
      for (const h of holders.rows) {
        await notify(q, [h.assignee_id], {
          type: 'task_due',
          title: 'Your task is due soon',
          body: h.n === 1 ? `“${h.first}” is still open, and ${p.title} closes in 2 days.` : `${h.n} tasks are still open, and ${p.title} closes in 2 days.`,
          pactId: p.id,
          push: `You have a task due soon for ${p.title}.`,
        });
      }
    });
  }

  // Missed goals past the grace period: apply the rule everyone agreed to at the start.
  const cutoff = addDays(today, -MISSED_GOAL_GRACE_DAYS);
  const missed = await ctx.db.query<{ id: string }>(`SELECT id FROM pacts WHERE status = 'open' AND deadline < $1 LIMIT 100`, [cutoff]);
  let settled = 0;
  for (const { id } of missed.rows) {
    try {
      await ctx.db.tx(async (q) => {
        const p = (await q.query<PactRow>(`SELECT * FROM pacts WHERE id = $1 AND status = 'open' FOR UPDATE SKIP LOCKED`, [id])).rows[0];
        if (!p) return;
        await settleWaitingPayouts(q, p, 'reject');
        if (p.mode === 'orders') {
          // Pay-by date passed: unpaid orders lapse; what was bought is the Pact's total.
          const after = await lapseUnpaidOrders(q, p);
          if (after.target_amount > 0) {
            await q.query(`UPDATE pacts SET status = 'funded', funded_at = COALESCE(funded_at, now()) WHERE id = $1`, [p.id]);
            await recordActivity(q, { pactId: p.id, actorId: null, type: 'completed' });
          } else {
            await refundTx(q, after, 'refunded', null);
          }
          await audit(q, { action: 'pact.orders_closed', targetType: 'pact', targetId: id, metadata: { total: after.target_amount } });
          return;
        }
        const organizer = await getUser(q, p.organizer_id);
        const canRelease = TIER_LIMITS[organizer.kyc_tier as KycTier].canRelease;
        if (p.missed_goal_policy === 'release' && canRelease) await releaseTx(ctx, q, p, null, 'rule');
        else await refundTx(q, p, 'refunded', null);
        await audit(q, { action: 'pact.missed_goal_settled', targetType: 'pact', targetId: id, metadata: { policy: p.missed_goal_policy, canRelease } });
      });
      settled++;
    } catch (err) {
      ctx.log.error({ err, pactId: id }, 'failed to settle missed Pact');
    }
  }
  return { reminded: soon.rowCount, settled };
}

import type { AskSummaryDTO, Attendance, CircleTint, PactDraftDTO, PersonDTO, PlanDTO, PlanNeedDTO, PlanStatus, PlanSummaryDTO } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { randomToken } from '../lib/crypto.js';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors.js';
import { track, visitorId } from '../lib/events.js';
import { addDays, lagosToday } from '../lib/time.js';
import { assertCanHandOver, ownerMayTakeOver } from './circles.js';
import { aliasPeople, askSummariesForPlans, assertCreateBudget, minimalPeople } from './asks.js';
import { joinByToken } from './circles.js';
import { audit, notify } from './platform.js';

/**
 * Plans: "what are we actually trying to do together?" A Plan is lighter than a Pact: a title, maybe a date, a place and a
 * rough budget, who is in, a few tasks, and questions linked from the Circle. It may become one Pact (never two), and it stays
 * afterwards as the social history behind it.
 *
 * Who may do what, decided here and never by the client:
 *   - Circle members see a Plan, RSVP, add tasks, take an unassigned task, finish their own, and link questions.
 *   - The person who made the Plan edits it, confirms, finishes or cancels it, assigns people, and turns it into a Pact.
 *   - Anyone holding the share link sees a safe preview (no tasks, no budget, no activity) and, once signed in, can RSVP.
 * Outsiders and guessed ids get a 404. Link visitors see first names and avatars only.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const MAX_ACTIVE_PER_CIRCLE = 30;
const MAX_TASKS = 30;

interface PlanRow {
  id: string;
  circle_id: string;
  title: string;
  category: PlanSummaryDTO['category'];
  description: string | null;
  date: string | null;
  end_date: string | null;
  location: string | null;
  rough_budget: number | null;
  status: PlanStatus;
  created_by: string;
  pact_id: string | null;
  rsvp_open: boolean;
  share_token: string;
  created_at: Date;
  cname: string;
  cemoji: string;
  ctint: CircleTint;
}

const SELECT = `SELECT p.id, p.circle_id, p.title, p.category, p.description, p.date::text AS date, p.end_date::text AS end_date, p.location,
                       p.rough_budget, p.status, p.created_by, p.pact_id, p.rsvp_open, p.share_token, p.created_at,
                       c.name AS cname, c.emoji AS cemoji, c.tint AS ctint
                  FROM plans p JOIN circles c ON c.id = p.circle_id`;
const gone = () => notFound('That plan');
const isOpen = (p: PlanRow) => p.status === 'planning' || p.status === 'confirmed';

const isMember = async (q: Queryable, circleId: string, userId: string) =>
  !!(await q.query(`SELECT 1 FROM circle_members WHERE circle_id = $1 AND user_id = $2 AND status = 'joined'`, [circleId, userId])).rowCount;

async function loadForMember(q: Queryable, planId: string, userId: string, lock = false): Promise<PlanRow> {
  if (!UUID_RE.test(planId)) throw gone();
  const p = (await q.query<PlanRow>(`${SELECT} WHERE p.id = $1 ${lock ? 'FOR UPDATE OF p' : ''}`, [planId])).rows[0];
  if (!p || !(await isMember(q, p.circle_id, userId))) throw gone();
  return p;
}

/* ---------------------------------------------------------------- building answers */

interface Built {
  dto: PlanDTO;
  peopleIds: string[];
}

async function build(ctx: Ctx, q: Queryable, rows: PlanRow[], viewerId: string | null, member: (circleId: string) => boolean, detail: boolean, publicView: boolean): Promise<Built[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const circles = [...new Set(rows.map((r) => r.circle_id))];
  const [rsvp, mine, members, tasksOpen, askCounts] = await Promise.all([
    q.query<{ plan_id: string; status: Attendance; n: number }>(`SELECT plan_id, status, COUNT(*)::int AS n FROM plan_rsvps WHERE plan_id = ANY($1::uuid[]) GROUP BY plan_id, status`, [ids]),
    viewerId ? q.query<{ plan_id: string; status: Attendance }>(`SELECT plan_id, status FROM plan_rsvps WHERE plan_id = ANY($1::uuid[]) AND user_id = $2`, [ids, viewerId]) : Promise.resolve({ rows: [] as { plan_id: string; status: Attendance }[] }),
    q.query<{ circle_id: string; n: number }>(`SELECT circle_id, COUNT(*)::int AS n FROM circle_members WHERE circle_id = ANY($1::uuid[]) AND status = 'joined' GROUP BY circle_id`, [circles]),
    q.query<{ plan_id: string; n: number }>(`SELECT plan_id, COUNT(*)::int AS n FROM plan_tasks WHERE plan_id = ANY($1::uuid[]) AND status = 'open' GROUP BY plan_id`, [ids]),
    q.query<{ plan_id: string; open: number; closed: number }>(
      `SELECT plan_id, COUNT(*) FILTER (WHERE status = 'open' AND (closes_at IS NULL OR closes_at > now()))::int AS open,
              COUNT(*) FILTER (WHERE status = 'closed' OR (closes_at IS NOT NULL AND closes_at <= now()))::int AS closed
         FROM asks WHERE plan_id = ANY($1::uuid[]) GROUP BY plan_id`,
      [ids],
    ),
  ]);
  let rsvps: { plan_id: string; user_id: string; status: Attendance; at: Date }[] = [];
  let tasks: { id: string; plan_id: string; title: string; assignee_id: string | null; status: 'open' | 'done'; created_by: string; completed_at: Date | null }[] = [];
  let activity: { plan_id: string; user_id: string; kind: PlanDTO['activity'][number]['kind']; status: Attendance | null; detail: string | null; at: Date }[] = [];
  let waiting: { plan_id: string; user_id: string }[] = [];
  let asks = new Map<string, AskSummaryDTO[]>();
  if (detail) {
    rsvps = (await q.query(`SELECT plan_id, user_id, status, updated_at AS at FROM plan_rsvps WHERE plan_id = ANY($1::uuid[]) ORDER BY updated_at DESC`, [ids])).rows as typeof rsvps;
    if (!publicView) {
      tasks = (await q.query(`SELECT id, plan_id, title, assignee_id, status, created_by, completed_at FROM plan_tasks WHERE plan_id = ANY($1::uuid[]) ORDER BY created_at`, [ids])).rows as typeof tasks;
      activity = (await q.query(`SELECT plan_id, user_id, kind, status, detail, created_at AS at FROM plan_activity WHERE plan_id = ANY($1::uuid[]) ORDER BY created_at DESC LIMIT 60`, [ids])).rows as typeof activity;
      asks = await askSummariesForPlans(ctx, q, ids, viewerId);
      const mem = rows.filter((r) => member(r.circle_id));
      if (mem.length) {
        waiting = (
          await q.query(
            `SELECT p.id AS plan_id, m.user_id FROM plans p JOIN circle_members m ON m.circle_id = p.circle_id AND m.status = 'joined'
              WHERE p.id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM plan_rsvps r WHERE r.plan_id = p.id AND r.user_id = m.user_id)`,
            [mem.map((r) => r.id)],
          )
        ).rows as typeof waiting;
      }
    }
  }
  const takeover = new Set<string>();
  if (viewerId && !publicView) for (const r of rows) if (member(r.circle_id) && r.created_by !== viewerId && (await ownerMayTakeOver(q, r.circle_id, viewerId, r.created_by))) takeover.add(r.id);
  return rows.map((p) => {
    const counts = { in: 0, maybe: 0, out: 0 };
    for (const r of rsvp.rows) if (r.plan_id === p.id) counts[r.status] = r.n;
    const ac = askCounts.rows.find((a) => a.plan_id === p.id);
    const isM = viewerId ? member(p.circle_id) : false;
    const mineRow = mine.rows.find((m) => m.plan_id === p.id);
    const isCreator = viewerId === p.created_by;
    const dto: PlanDTO = {
      id: p.id,
      circleId: p.circle_id,
      circle: { name: p.cname, emoji: p.cemoji, tint: p.ctint },
      title: p.title,
      category: p.category,
      date: p.date,
      endDate: p.end_date,
      location: p.location,
      status: p.status,
      pactId: p.pact_id,
      rsvpOpen: p.rsvp_open,
      counts,
      memberCount: members.rows.find((m) => m.circle_id === p.circle_id)?.n ?? 0,
      mine: mineRow?.status ?? null,
      undecided: publicView ? 0 : ac?.open ?? 0,
      tasksOpen: publicView ? 0 : tasksOpen.rows.find((t) => t.plan_id === p.id)?.n ?? 0,
      createdAt: p.created_at.toISOString(),
      description: p.description,
      roughBudget: publicView ? null : p.rough_budget,
      createdBy: p.created_by,
      rsvps: rsvps.filter((r) => r.plan_id === p.id).map((r) => ({ userId: r.user_id, status: r.status, at: new Date(r.at).toISOString() })),
      waiting: isM ? waiting.filter((w) => w.plan_id === p.id).map((w) => w.user_id) : [],
      tasks: tasks.filter((t) => t.plan_id === p.id).map((t) => ({ id: t.id, title: t.title, assigneeId: t.assignee_id, status: t.status, createdBy: t.created_by, completedAt: t.completed_at ? new Date(t.completed_at).toISOString() : null })),
      asks: asks.get(p.id) ?? [],
      decisions: publicView ? 0 : ac?.closed ?? 0,
      activity: activity.filter((a) => a.plan_id === p.id).slice(0, 15).map((a) => ({ kind: a.kind, userId: a.user_id, status: a.status, detail: a.detail, at: new Date(a.at).toISOString() })),
      isMember: isM,
      canEdit: isM && isCreator && isOpen(p),
      canHandOver: isM && isOpen(p) && (isCreator || takeover.has(p.id)),
      canMakePact: isM && isCreator && isOpen(p) && !p.pact_id,
      shareToken: isM ? p.share_token : null,
    };
    const peopleIds = [p.created_by, ...dto.rsvps.map((r) => r.userId), ...dto.waiting, ...dto.activity.map((a) => a.userId), ...dto.tasks.flatMap((t) => (t.assigneeId ? [t.assigneeId] : []))];
    return { dto, peopleIds };
  });
}

/** Every id on a plan that a link visitor must not be given as it is: people, and the plan, its Circle and its Pact. */
const planIds = (d: PlanDTO) => [d.createdBy, d.id, d.circleId, ...(d.pactId ? [d.pactId] : []), ...d.rsvps.map((r) => r.userId), ...d.waiting, ...d.activity.map((a) => a.userId), ...d.tasks.flatMap((t) => [t.createdBy, ...(t.assigneeId ? [t.assigneeId] : [])])];

const summary = (d: PlanDTO): PlanSummaryDTO => ({
  id: d.id,
  circleId: d.circleId,
  circle: d.circle,
  title: d.title,
  category: d.category,
  date: d.date,
  endDate: d.endDate,
  location: d.location,
  status: d.status,
  pactId: d.pactId,
  rsvpOpen: d.rsvpOpen,
  counts: d.counts,
  memberCount: d.memberCount,
  mine: d.mine,
  undecided: d.undecided,
  tasksOpen: d.tasksOpen,
  createdAt: d.createdAt,
});

/* ---------------------------------------------------------------- reads */

export async function getPlan(ctx: Ctx, userId: string, planId: string, from?: 'circle' | 'home') {
  const p = await loadForMember(ctx.db, planId, userId);
  const [b] = await build(ctx, ctx.db, [p], userId, () => true, true, false);
  if (from) await track(ctx.db, ctx.config, 'plan_opened', { userId, planId, key: `po:${userId}:${planId}:${ctx.now().toISOString().slice(0, 10)}`, props: { from, status: p.status } });
  return { data: b.dto, people: await minimalPeople(ctx.db, b.peopleIds) };
}

export async function listCirclePlans(ctx: Ctx, userId: string, circleId: string) {
  if (!UUID_RE.test(circleId) || !(await isMember(ctx.db, circleId, userId))) throw notFound('That Circle');
  const rows = (
    await ctx.db.query<PlanRow>(
      `${SELECT} WHERE p.circle_id = $1 AND p.status <> 'cancelled'
        ORDER BY (p.status IN ('planning', 'confirmed')) DESC, p.date NULLS LAST, p.created_at DESC LIMIT 20`,
      [circleId],
    )
  ).rows;
  const built = await build(ctx, ctx.db, rows, userId, () => true, false, false);
  return { data: built.map((b) => summary(b.dto)), people: [] as PersonDTO[] };
}

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-NG', { weekday: 'long', timeZone: 'UTC' });
const startsText = (date: string, today: string) => {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days <= 0 ? 'Starts today' : days === 1 ? 'Starts tomorrow' : days < 7 ? `Starts ${weekday(date)}` : `Starts in ${days} days`;
};

/** What on Home is waiting on me, or about to happen: an RSVP, a task I took, something starting soon. */
export async function needsYou(ctx: Ctx, userId: string): Promise<{ data: PlanNeedDTO[]; people: PersonDTO[] }> {
  const today = lagosToday(ctx.now());
  const out: PlanNeedDTO[] = [];
  const rsvp = await ctx.db.query<PlanRow>(
    `${SELECT} JOIN circle_members me ON me.circle_id = p.circle_id AND me.user_id = $1 AND me.status = 'joined'
      WHERE p.status IN ('planning', 'confirmed') AND p.pact_id IS NULL AND (p.date IS NULL OR p.date >= $2::date) AND p.created_by <> $1
        AND NOT EXISTS (SELECT 1 FROM plan_rsvps r WHERE r.plan_id = p.id AND r.user_id = $1)
      ORDER BY p.created_at DESC LIMIT 5`,
    [userId, today],
  );
  for (const p of rsvp.rows) out.push({ planId: p.id, title: p.title, circle: { name: p.cname, emoji: p.cemoji, tint: p.ctint }, kind: 'rsvp', text: 'Are you coming?' });
  const tasks = await ctx.db.query<PlanRow & { task: string }>(
    `${SELECT.replace('FROM plans p', ', t.title AS task FROM plans p')} JOIN plan_tasks t ON t.plan_id = p.id AND t.assignee_id = $1 AND t.status = 'open'
      WHERE p.status IN ('planning', 'confirmed') ORDER BY t.created_at DESC LIMIT 5`,
    [userId],
  );
  for (const p of tasks.rows) out.push({ planId: p.id, title: p.title, circle: { name: p.cname, emoji: p.cemoji, tint: p.ctint }, kind: 'task', text: `You’re handling “${p.task}”` });
  const soon = await ctx.db.query<PlanRow>(
    `${SELECT} JOIN plan_rsvps me ON me.plan_id = p.id AND me.user_id = $1 AND me.status IN ('in', 'maybe')
      WHERE p.status IN ('planning', 'confirmed') AND p.date BETWEEN $2::date AND $3::date ORDER BY p.date LIMIT 5`,
    [userId, today, addDays(today, 7)],
  );
  for (const p of soon.rows) if (p.date) out.push({ planId: p.id, title: p.title, circle: { name: p.cname, emoji: p.cemoji, tint: p.ctint }, kind: 'soon', text: startsText(p.date, today) });
  const seen = new Set<string>();
  return { data: out.filter((n) => (seen.has(`${n.planId}:${n.kind}:${n.text}`) ? false : (seen.add(`${n.planId}:${n.kind}:${n.text}`), true))).slice(0, 6), people: [] };
}

/** One live line per Circle from its Plans, for the Circles list. Something needing me comes first. */
export async function planSignals(ctx: Ctx, q: Queryable, userId: string, circleIds: string[]) {
  const out = new Map<string, { text: string; needsYou: boolean }>();
  if (!circleIds.length) return out;
  const today = lagosToday(ctx.now());
  const rows = (await q.query<PlanRow>(`${SELECT} WHERE p.circle_id = ANY($1::uuid[]) AND p.status IN ('planning', 'confirmed') AND (p.date IS NULL OR p.date >= $2::date) ORDER BY p.date NULLS LAST, p.created_at DESC LIMIT 200`, [circleIds, today])).rows;
  const built = (await build(ctx, q, rows, userId, () => true, false, false)).map((b) => b.dto);
  for (const id of circleIds) {
    const mine = built.filter((d) => d.circleId === id);
    const need = mine.find((d) => !d.mine && d.createdBy !== userId);
    if (need) out.set(id, { needsYou: true, text: `${need.title} · are you coming?` });
    else if (mine[0]) {
      const d = mine[0];
      const soon = d.date ? startsText(d.date, today) : null;
      out.set(id, { needsYou: false, text: `${d.title} · ${d.counts.in} in${soon && d.date! <= addDays(today, 7) ? ` · ${soon.toLowerCase()}` : ''}` });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- commands */

const detailOf = (s: string | null | undefined) => (s ? s.slice(0, 80) : null);

async function logActivity(q: Queryable, planId: string, userId: string, kind: PlanDTO['activity'][number]['kind'], status: Attendance | null = null, detail: string | null = null) {
  await q.query('INSERT INTO plan_activity (plan_id, user_id, kind, status, detail) VALUES ($1, $2, $3, $4, $5)', [planId, userId, kind, status, detailOf(detail)]);
}

interface CreateInput {
  title: string;
  category: PlanSummaryDTO['category'];
  description?: string;
  date?: string;
  endDate?: string;
  location?: string;
  roughBudget?: number;
}

export async function createPlan(ctx: Ctx, userId: string, circleId: string, input: CreateInput, meta: ReqMeta) {
  if (!UUID_RE.test(circleId) || !(await isMember(ctx.db, circleId, userId))) throw notFound('That Circle');
  const today = lagosToday(ctx.now());
  if (input.date && input.date < today) throw badRequest('invalid_date', 'Choose a date that hasn’t passed.');
  const id = await ctx.db.tx(async (q) => {
    await assertCreateBudget(ctx, q, userId);
    const active = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM plans WHERE circle_id = $1 AND status IN ('planning', 'confirmed')`, [circleId]);
    if (active.rows[0].n >= MAX_ACTIVE_PER_CIRCLE) throw badRequest('too_many_plans', 'This Circle has a lot of active plans. Finish or cancel a few first.');
    const r = await q.query<{ id: string }>(
      `INSERT INTO plans (circle_id, title, category, description, date, end_date, location, rough_budget, created_by, share_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [circleId, input.title, input.category, input.description ?? null, input.date ?? null, input.endDate ?? null, input.location ?? null, input.roughBudget ?? null, userId, randomToken(32)],
    );
    const planId = r.rows[0].id;
    // The person who made it is in. Everyone else is asked.
    await q.query(`INSERT INTO plan_rsvps (plan_id, user_id, status) VALUES ($1, $2, 'in')`, [planId, userId]);
    await logActivity(q, planId, userId, 'created');
    await q.query('UPDATE circles SET updated_at = now() WHERE id = $1', [circleId]);
    await audit(q, { actorId: userId, action: 'plan.created', targetType: 'plan', targetId: planId, ip: meta.ip });
    await track(q, ctx.config, 'plan_created', { userId, planId, key: `pc:${planId}`, props: { category: input.category, has_date: !!input.date, has_location: !!input.location, has_budget: input.roughBudget !== undefined } }, true);
    const c = (await q.query<{ name: string }>('SELECT name FROM circles WHERE id = $1', [circleId])).rows[0];
    const me = (await q.query<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [userId])).rows[0];
    const others = (await q.query<{ user_id: string }>(`SELECT user_id FROM circle_members WHERE circle_id = $1 AND status = 'joined' AND user_id <> $2`, [circleId, userId])).rows.map((x) => x.user_id);
    await notify(q, others, {
      type: 'plan_new',
      title: `${me.first_name} is planning ${input.title}`,
      body: 'Are you in?',
      refId: planId,
      meta: { actor: me.first_name, about: c.name },
      push: `${c.name} has a new plan. Are you in?`,
    });
    return planId;
  });
  return getPlan(ctx, userId, id);
}

export async function updatePlan(ctx: Ctx, userId: string, planId: string, patch: Record<string, unknown>, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    if (p.created_by !== userId) throw forbidden('Only the person who made the plan can change it.');
    if (!isOpen(p)) throw new AppError(409, 'plan_closed', 'This plan is finished, so it can’t be changed.');
    const next = { title: p.title, category: p.category, description: p.description, date: p.date, end_date: p.end_date, location: p.location, rough_budget: p.rough_budget } as Record<string, unknown>;
    const map: Record<string, string> = { title: 'title', category: 'category', description: 'description', date: 'date', endDate: 'end_date', location: 'location', roughBudget: 'rough_budget' };
    for (const [k, col] of Object.entries(map)) if (k in patch) next[col] = patch[k] ?? null;
    const today = lagosToday(ctx.now());
    if (next.date && next.date !== p.date && (next.date as string) < today) throw badRequest('invalid_date', 'Choose a date that hasn’t passed.');
    if (next.end_date && (!next.date || (next.end_date as string) < (next.date as string))) throw badRequest('invalid_date', 'The end date needs to be on or after the start.');

    // A new date or place changes the Plan for everyone who has answered. Say so first; never change it quietly.
    const dateChanged = next.date !== p.date || next.end_date !== p.end_date;
    const placeChanged = next.location !== p.location;
    if (dateChanged || placeChanged) {
      const others = (await q.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM plan_rsvps WHERE plan_id = $1 AND user_id <> $2', [planId, userId])).rows[0].n;
      if ((others > 0 || p.status === 'confirmed') && patch.confirm !== true) {
        throw new AppError(409, 'confirm_needed', p.status === 'confirmed' ? 'People have already agreed to this plan. Update it anyway?' : 'This changes the plan for everyone.');
      }
    }
    await q.query(
      `UPDATE plans SET title = $2, category = $3, description = $4, date = $5, end_date = $6, location = $7, rough_budget = $8, updated_at = now() WHERE id = $1`,
      [planId, next.title, next.category, next.description, next.date, next.end_date, next.location, next.rough_budget],
    );
    await audit(q, { actorId: userId, action: 'plan.updated', targetType: 'plan', targetId: planId, ip: meta.ip });
    // Only meaningful changes leave a trace: not a fixed typo or a tweaked description.
    // And only once someone else has engaged: before that the organiser is just shaping the plan.
    if ((dateChanged || placeChanged) && (await hasOutsideEngagement(q, planId, userId))) {
      if (dateChanged) await logActivity(q, planId, userId, 'date_changed', null, `${next.date ?? ''}|${next.end_date ?? ''}`);
      if (placeChanged) await logActivity(q, planId, userId, 'location_changed', null, (next.location as string | null) ?? '');
      // Whoever said in or maybe hears about it in the app (no push: it is a note, not an emergency).
      const who = (await q.query<{ user_id: string }>(`SELECT user_id FROM plan_rsvps WHERE plan_id = $1 AND status IN ('in', 'maybe') AND user_id <> $2`, [planId, userId])).rows.map((r) => r.user_id);
      const me = (await q.query<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [userId])).rows[0];
      await notify(q, who, {
        type: 'plan_changed',
        title: `${next.title} changed`,
        body: dateChanged && placeChanged ? 'New date and place.' : dateChanged ? 'It has a new date.' : 'It has a new place.',
        refId: planId,
        meta: { actor: me.first_name, about: p.cname },
      });
    }
  });
  return getPlan(ctx, userId, planId);
}

/**
 * Has anyone other than the organiser touched this Plan? Another person's RSVP, a task handed to or finished by someone else, or
 * an answer to a linked question. Until then the organiser is still shaping it and edits leave no trace.
 */
async function hasOutsideEngagement(q: Queryable, planId: string, creatorId: string): Promise<boolean> {
  const r = await q.query(
    `SELECT 1 WHERE EXISTS (SELECT 1 FROM plan_rsvps WHERE plan_id = $1 AND user_id <> $2)
        OR EXISTS (SELECT 1 FROM plan_tasks WHERE plan_id = $1 AND assignee_id IS NOT NULL AND assignee_id <> $2)
        OR EXISTS (SELECT 1 FROM ask_responses r JOIN asks a ON a.id = r.ask_id WHERE a.plan_id = $1 AND r.user_id <> $2)`,
    [planId, creatorId],
  );
  return !!r.rowCount;
}

/** The organiser stops (or resumes) taking answers. Answers already given stay. */
export async function setRsvpOpen(ctx: Ctx, userId: string, planId: string, open: boolean, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    if (p.created_by !== userId) throw forbidden('Only the person who made the plan can do that.');
    if (!isOpen(p)) throw new AppError(409, 'plan_closed', 'This plan is finished.');
    if (p.rsvp_open === open) return;
    await q.query('UPDATE plans SET rsvp_open = $2, updated_at = now() WHERE id = $1', [planId, open]);
    await audit(q, { actorId: userId, action: open ? 'plan.rsvp_opened' : 'plan.rsvp_closed', targetType: 'plan', targetId: planId, ip: meta.ip });
  });
  return getPlan(ctx, userId, planId);
}

const NEXT: Record<PlanStatus, PlanStatus[]> = { planning: ['confirmed', 'done', 'cancelled'], confirmed: ['planning', 'done', 'cancelled'], done: [], cancelled: [] };

export async function setStatus(ctx: Ctx, userId: string, planId: string, status: PlanStatus, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    if (p.created_by !== userId) throw forbidden('Only the person who made the plan can do that.');
    if (p.status === status) return;
    if (!NEXT[p.status].includes(status)) throw new AppError(409, 'plan_closed', 'This plan is finished, so its status can’t change.');
    // Once it is a Pact, the Pact is the commitment. The Plan stays as history and is not cancelled out from under it.
    if (status === 'done' && p.pact_id) throw badRequest('plan_completes_via_pact', 'This Plan is now being completed through its Pact.');
    if (status === 'cancelled' && p.pact_id) throw new AppError(409, 'plan_has_pact', 'This plan became a Pact, so it can’t be cancelled here. Manage it from the Pact.');
    await q.query('UPDATE plans SET status = $2, updated_at = now() WHERE id = $1', [planId, status]);
    await audit(q, { actorId: userId, action: `plan.${status}`, targetType: 'plan', targetId: planId, ip: meta.ip });
    if (status === 'planning') return;
    await logActivity(q, planId, userId, status === 'confirmed' ? 'confirmed' : status === 'done' ? 'done' : 'cancelled');
    if (status === 'confirmed') {
      const inCount = (await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM plan_rsvps WHERE plan_id = $1 AND status = 'in'`, [planId])).rows[0].n;
      await track(q, ctx.config, 'plan_confirmed', { userId, planId, key: `pcf:${planId}`, props: { in_count: inCount } }, true);
      // Only the people who said yes or maybe hear about it. One note, and a push, since the date being settled is the news.
      const who = (await q.query<{ user_id: string }>(`SELECT user_id FROM plan_rsvps WHERE plan_id = $1 AND status IN ('in', 'maybe') AND user_id <> $2`, [planId, userId])).rows.map((r) => r.user_id);
      await notify(q, who, { type: 'plan_confirmed', title: `${p.title} is on`, body: p.date ? 'The plan is confirmed.' : 'The plan is confirmed. Dates to follow.', refId: planId, meta: { about: p.cname }, push: `A plan in ${p.cname} is confirmed.` });
    }
  });
  return getPlan(ctx, userId, planId);
}

/* ---- RSVP */

async function upsertRsvp(ctx: Ctx, q: Queryable, p: PlanRow, userId: string, status: Attendance, member: boolean, afterAuth: boolean) {
  if (!isOpen(p)) throw new AppError(409, 'plan_closed', p.status === 'cancelled' ? 'This plan was cancelled.' : 'This plan is finished, so RSVPs are closed.');
  const prev = (await q.query<{ status: Attendance }>('SELECT status FROM plan_rsvps WHERE plan_id = $1 AND user_id = $2 FOR UPDATE', [p.id, userId])).rows[0];
  if (prev?.status === status) return;
  // Closing stops everyone else; the organiser can still say whether they are coming.
  if (!p.rsvp_open && userId !== p.created_by) throw new AppError(409, 'rsvps_closed', 'RSVPs are closed.');
  await q.query(
    `INSERT INTO plan_rsvps (plan_id, user_id, status) VALUES ($1, $2, $3) ON CONFLICT (plan_id, user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
    [p.id, userId, status],
  );
  await logActivity(q, p.id, userId, prev ? 'rsvp_changed' : 'rsvp', status);
  const day = ctx.now().toISOString().slice(0, 10);
  if (prev) await track(q, ctx.config, 'plan_rsvp_changed', { userId, planId: p.id, key: `prc:${userId}:${p.id}:${day}`, props: { status } }, true);
  else await track(q, ctx.config, 'plan_rsvp_submitted', { userId, planId: p.id, key: `prs:${userId}:${p.id}`, props: { status, member, after_auth: afterAuth } }, true);
}

export async function rsvpAsMember(ctx: Ctx, userId: string, planId: string, status: Attendance) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    await upsertRsvp(ctx, q, p, userId, status, true, false);
  });
  return getPlan(ctx, userId, planId);
}

/* ---- tasks */

export async function addTask(ctx: Ctx, userId: string, planId: string, input: { title: string; assigneeId?: string | null }) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    if (!isOpen(p)) throw new AppError(409, 'plan_closed', 'This plan is finished, so tasks are closed.');
    const count = (await q.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM plan_tasks WHERE plan_id = $1', [planId])).rows[0].n;
    if (count >= MAX_TASKS) throw badRequest('too_many_tasks', 'That’s a lot of tasks. Finish a few first.');
    const assignee = input.assigneeId ?? null;
    if (assignee && assignee !== userId && p.created_by !== userId) throw forbidden('Only the person who made the plan can give a task to someone else.');
    if (assignee && !(await isMember(q, p.circle_id, assignee))) throw badRequest('unknown_person', 'Give it to someone in the Circle.');
    const t = await q.query<{ id: string }>('INSERT INTO plan_tasks (plan_id, title, assignee_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [planId, input.title, assignee, userId]);
    await logActivity(q, planId, userId, 'task_added', null, input.title);
    await track(q, ctx.config, 'plan_task_created', { userId, planId, props: { assigned: !!assignee } }, true);
    if (assignee && assignee !== userId) await notifyAssigned(q, p, userId, assignee, input.title, t.rows[0].id);
  });
  return getPlan(ctx, userId, planId);
}

async function notifyAssigned(q: Queryable, p: PlanRow, actor: string, assignee: string, title: string, _taskId: string) {
  const me = (await q.query<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [actor])).rows[0];
  // In-app only: being handed a task is worth a note, not a buzz.
  await notify(q, [assignee], { type: 'plan_task', title: `${me.first_name} gave you a task`, body: `${title} · ${p.title}`, refId: p.id, meta: { actor: me.first_name, taskName: title, about: p.cname } });
}

export async function patchTask(ctx: Ctx, userId: string, planId: string, taskId: string, patch: { title?: string; assigneeId?: string | null; status?: 'open' | 'done' }) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    if (!isOpen(p)) throw new AppError(409, 'plan_closed', 'This plan is finished, so tasks are closed.');
    if (!UUID_RE.test(taskId)) throw notFound('That task');
    const t = (await q.query<{ id: string; title: string; assignee_id: string | null; status: 'open' | 'done'; created_by: string }>('SELECT id, title, assignee_id, status, created_by FROM plan_tasks WHERE id = $1 AND plan_id = $2 FOR UPDATE', [taskId, planId])).rows[0];
    if (!t) throw notFound('That task');
    const organiser = p.created_by === userId;
    if (patch.title !== undefined && !organiser && t.created_by !== userId) throw forbidden('Only the person who added a task can rename it.');
    let assignee = t.assignee_id;
    if (patch.assigneeId !== undefined) {
      const next = patch.assigneeId;
      const claiming = next === userId && !t.assignee_id;
      const releasing = next === null && t.assignee_id === userId;
      if (!organiser && !claiming && !releasing) throw forbidden('You can take an open task, or give your own back.');
      if (next && !(await isMember(q, p.circle_id, next))) throw badRequest('unknown_person', 'Give it to someone in the Circle.');
      assignee = next;
    }
    let status = t.status;
    if (patch.status !== undefined && patch.status !== t.status) {
      if (!organiser && assignee !== userId) throw forbidden('Only the person handling a task can finish it.');
      status = patch.status;
    }
    await q.query(`UPDATE plan_tasks SET title = $2, assignee_id = $3, status = $4, completed_at = CASE WHEN $4 = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END WHERE id = $1`, [taskId, patch.title ?? t.title, assignee, status]);
    if (status === 'done' && t.status !== 'done') {
      await logActivity(q, planId, userId, 'task_done', null, patch.title ?? t.title);
      await track(q, ctx.config, 'plan_task_completed', { userId, planId, props: { by_assignee: assignee === userId } }, true);
    }
    if (assignee && assignee !== t.assignee_id && assignee !== userId) await notifyAssigned(q, p, userId, assignee, patch.title ?? t.title, taskId);
  });
  return getPlan(ctx, userId, planId);
}

export async function deleteTask(ctx: Ctx, userId: string, planId: string, taskId: string) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    if (!isOpen(p)) throw new AppError(409, 'plan_closed', 'This plan is finished, so tasks are closed.');
    if (!UUID_RE.test(taskId)) throw notFound('That task');
    const t = (await q.query<{ created_by: string }>('SELECT created_by FROM plan_tasks WHERE id = $1 AND plan_id = $2', [taskId, planId])).rows[0];
    if (!t) throw notFound('That task');
    if (p.created_by !== userId && t.created_by !== userId) throw forbidden('Only the person who added a task, or the one who made the plan, can remove it.');
    await q.query('DELETE FROM plan_tasks WHERE id = $1', [taskId]);
  });
  return getPlan(ctx, userId, planId);
}

/* ---- linked questions */

export async function linkAsk(ctx: Ctx, userId: string, planId: string, askId: string) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    if (!isOpen(p)) throw new AppError(409, 'plan_closed', 'This plan is finished, so it can’t take new questions.');
    const a = (await q.query<{ title: string; created_by: string; plan_id: string | null }>('SELECT title, created_by, plan_id FROM asks WHERE id = $1 AND circle_id = $2 FOR UPDATE', [askId, p.circle_id])).rows[0];
    if (!a) throw notFound('That question');
    if (p.created_by !== userId && a.created_by !== userId) throw forbidden('Link your own question, or ask the person who made the plan.');
    if (a.plan_id === planId) return;
    await q.query('UPDATE asks SET plan_id = $2, updated_at = now() WHERE id = $1', [askId, planId]);
    await logActivity(q, planId, userId, 'ask_linked', null, a.title);
    await track(q, ctx.config, 'plan_ask_linked', { userId, planId, askId, props: { via: 'link' } }, true);
  });
  return getPlan(ctx, userId, planId);
}

export async function unlinkAsk(ctx: Ctx, userId: string, planId: string, askId: string) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    const a = (await q.query<{ created_by: string }>('SELECT created_by FROM asks WHERE id = $1 AND plan_id = $2 FOR UPDATE', [askId, planId])).rows[0];
    if (!a) throw notFound('That question');
    if (p.created_by !== userId && a.created_by !== userId) throw forbidden('Only the person who asked, or the one who made the plan, can unlink it.');
    await q.query('UPDATE asks SET plan_id = NULL, updated_at = now() WHERE id = $1', [askId]);
  });
  return getPlan(ctx, userId, planId);
}

/* ---------------------------------------------------------------- sharing */

async function loadByToken(q: Queryable, token: string): Promise<PlanRow> {
  if (!TOKEN.test(token)) throw gone();
  const p = (await q.query<PlanRow>(`${SELECT} WHERE p.share_token = $1`, [token])).rows[0];
  if (!p) {
    if ((await q.query('SELECT 1 FROM plan_revoked_links WHERE token = $1', [token])).rowCount) throw new AppError(410, 'plan_link_off', 'This link is no longer active.');
    throw gone();
  }
  return p;
}

/** What a link is for. Public: title, when, where, who is in. No tasks, budget or activity. */
export async function previewLink(ctx: Ctx, token: string, req: ReqMeta) {
  const p = await loadByToken(ctx.db, token);
  const [b] = await build(ctx, ctx.db, [p], null, () => false, true, true);
  // Signed out: totals and the organiser's first name only. No names of who is coming.
  b.dto.rsvps = [];
  b.peopleIds = [p.created_by];
  const who = visitorId(ctx.config, req.ip, req.userAgent, ctx.now().toISOString().slice(0, 10));
  await track(ctx.db, ctx.config, 'plan_opened', { actor: who, planId: p.id, key: `pov:${who}:${p.id}`, props: { from: 'share', status: p.status } });
  return aliasPeople(ctx, token, null, { data: b.dto, people: await minimalPeople(ctx.db, b.peopleIds) }, planIds(b.dto));
}

/** The signed-in viewer's side of a link: their RSVP, whether they are in the Circle, and whether they could join it. */
export async function myLinkState(ctx: Ctx, userId: string, token: string) {
  const p = await loadByToken(ctx.db, token);
  const member = await isMember(ctx.db, p.circle_id, userId);
  const [b] = await build(ctx, ctx.db, [p], userId, () => member, true, !member);
  if (!member) {
    // Someone who has answered may see who else is in (first names). Someone who has not sees totals, like a signed-out visitor.
    b.dto.rsvps = b.dto.mine ? b.dto.rsvps.filter((r) => r.status === 'in' || r.userId === userId) : [];
    b.peopleIds = [p.created_by, ...b.dto.rsvps.map((r) => r.userId)];
  }
  const canJoin = !member && !!(await ctx.db.query(`SELECT 1 FROM circle_invites WHERE circle_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`, [p.circle_id])).rowCount;
  const out = { data: { plan: b.dto, canJoinCircle: canJoin }, people: await minimalPeople(ctx.db, b.peopleIds) };
  return member ? out : aliasPeople(ctx, token, userId, out, planIds(b.dto));
}

export async function rsvpViaLink(ctx: Ctx, userId: string, token: string, status: Attendance, afterAuth = false) {
  const p0 = await loadByToken(ctx.db, token);
  const member = await isMember(ctx.db, p0.circle_id, userId);
  await ctx.db.tx(async (q) => {
    const p = (await q.query<PlanRow>(`${SELECT} WHERE p.id = $1 FOR UPDATE OF p`, [p0.id])).rows[0];
    await upsertRsvp(ctx, q, p, userId, status, member, afterAuth);
  });
  return myLinkState(ctx, userId, token);
}

export async function joinCircleFromPlan(ctx: Ctx, userId: string, token: string, meta: ReqMeta) {
  const p = await loadByToken(ctx.db, token);
  const inv = (await ctx.db.query<{ token: string }>(`SELECT token FROM circle_invites WHERE circle_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC LIMIT 1`, [p.circle_id])).rows[0];
  if (!inv) throw new AppError(410, 'invite_revoked', 'This Circle isn’t taking new people right now. Ask the person who started it.');
  return joinByToken(ctx, userId, inv.token, meta, undefined, p.id);
}

export async function recordShared(ctx: Ctx, userId: string, planId: string, via: 'native' | 'copy') {
  await loadForMember(ctx.db, planId, userId);
  await track(ctx.db, ctx.config, 'plan_shared', { userId, planId, key: `psd:${userId}:${planId}:${ctx.now().toISOString().slice(0, 10)}`, props: { via } });
  return { ok: true };
}

export async function recordLinkShared(ctx: Ctx, userId: string, token: string, via: 'native' | 'copy') {
  const p = await loadByToken(ctx.db, token);
  await track(ctx.db, ctx.config, 'plan_shared', { userId, planId: p.id, key: `psd:${userId}:${p.id}:${ctx.now().toISOString().slice(0, 10)}`, props: { via } });
  return { ok: true };
}

export async function handOver(ctx: Ctx, userId: string, planId: string, toId: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    await assertCanHandOver(q, p.circle_id, userId, p.created_by, toId);
    await q.query('UPDATE plans SET created_by = $2, updated_at = now() WHERE id = $1', [planId, toId]);
    await audit(q, { actorId: userId, action: 'plan.handed_over', targetType: 'plan', targetId: planId, ip: meta.ip, metadata: { to: toId } });
    await notify(q, [toId], { type: 'plan_pact', title: `You’re now running ${p.title}`, body: 'You can edit it and make it a Pact.', refId: planId, meta: { about: p.cname }, push: `You were handed a plan in ${p.cname}.` });
  });
  return getPlan(ctx, userId, planId);
}

export async function resetShare(ctx: Ctx, userId: string, planId: string, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const p = await loadForMember(q, planId, userId, true);
    if (p.created_by !== userId) throw forbidden('Only the person who made the plan can reset the link.');
    await q.query('INSERT INTO plan_revoked_links (token, plan_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [p.share_token, planId]);
    await q.query('UPDATE plans SET share_token = $2, updated_at = now() WHERE id = $1', [planId, randomToken(32)]);
    await audit(q, { actorId: userId, action: 'plan.link_reset', targetType: 'plan', targetId: planId, ip: meta.ip });
  });
  return getPlan(ctx, userId, planId);
}

/* ---------------------------------------------------------------- Plan → Pact */

/** What the existing Pact form starts with. Nothing is created: the organiser reviews and confirms there. */
export async function pactDraft(ctx: Ctx, userId: string, planId: string): Promise<PactDraftDTO> {
  const p = await loadForMember(ctx.db, planId, userId);
  if (p.created_by !== userId) throw forbidden('Only the person who made the plan can make it a Pact.');
  if (p.pact_id) throw new AppError(409, 'plan_already_pact', 'This plan already became a Pact.');
  if (!isOpen(p)) throw new AppError(409, 'plan_closed', 'This plan is finished, so it can’t become a Pact.');
  const today = lagosToday(ctx.now());
  const early = p.date ? addDays(p.date, -2) : null;
  const deadline = early && early > today ? early : p.date && p.date > today ? p.date : null;
  const [tasks, going] = await Promise.all([
    ctx.db.query<{ title: string }>(`SELECT title FROM plan_tasks WHERE plan_id = $1 AND status = 'open' ORDER BY created_at`, [planId]),
    ctx.db.query<{ user_id: string }>(`SELECT r.user_id FROM plan_rsvps r JOIN circle_members m ON m.circle_id = $2 AND m.user_id = r.user_id AND m.status = 'joined' WHERE r.plan_id = $1 AND r.status IN ('in', 'maybe') AND r.user_id <> $3`, [planId, p.circle_id, userId]),
  ]);
  await track(ctx.db, ctx.config, 'plan_conversion_started', { userId, planId, key: `pcs:${planId}:${userId}`, props: {} });
  return { planId, title: p.title, category: p.category, circleId: p.circle_id, deadline, target: p.rough_budget && p.rough_budget >= 100_000 ? p.rough_budget : null, tasks: tasks.rows.map((t) => t.title).slice(0, 12), inviteUserIds: going.rows.map((r) => r.user_id).slice(0, 50) };
}

/** Called by Pact creation, inside its transaction, before anything is written: the Plan must be theirs, open, and not yet a Pact. */
export async function lockPlanForPact(q: Queryable, planId: string, userId: string): Promise<PlanRow> {
  const p = await loadForMember(q, planId, userId, true);
  if (p.created_by !== userId) throw forbidden('Only the person who made the plan can make it a Pact.');
  if (p.pact_id) throw new AppError(409, 'plan_already_pact', 'This plan already became a Pact.');
  if (!isOpen(p)) throw new AppError(409, 'plan_closed', 'This plan is finished, so it can’t become a Pact.');
  return p;
}

/**
 * Called inside the Pact's completion transaction: the Pact finishing is the Plan happening. Idempotent (only an open Plan moves),
 * and it writes the one activity line, so there is no separate "Plan marked done".
 */
export async function completeFromPact(q: Queryable, pactId: string, userId: string) {
  const r = await q.query<{ id: string }>(`UPDATE plans SET status = 'done', updated_at = now() WHERE pact_id = $1 AND status IN ('planning', 'confirmed') RETURNING id`, [pactId]);
  for (const { id } of r.rows) await logActivity(q, id, userId, 'done', null, 'pact');
}

/**
 * Called inside the transaction that closes a Pact without completing it (cancelled, or refunded because the goal was missed).
 * The Plan was waiting on that Pact; it gets its link cleared and a line in its history, so the group can edit it, cancel it or try again.
 */
export async function releaseFromPact(q: Queryable, pactId: string, actorId: string | null) {
  const r = await q.query<{ id: string; created_by: string }>(`UPDATE plans SET pact_id = NULL, updated_at = now() WHERE pact_id = $1 AND status IN ('planning', 'confirmed') RETURNING id, created_by`, [pactId]);
  for (const p of r.rows) await logActivity(q, p.id, actorId ?? p.created_by, 'pact_closed');
}

/** Called by Pact creation once the Pact exists: ties the two together, keeps the Plan, tells the people who were in. */
export async function completeConversion(ctx: Ctx, q: Queryable, p: PlanRow, pactId: string, userId: string, stats: { tasks: number; invitees: number; hasBudget: boolean }) {
  await q.query('UPDATE plans SET pact_id = $2, updated_at = now() WHERE id = $1', [p.id, pactId]);
  await logActivity(q, p.id, userId, 'pact', null, p.title);
  await track(q, ctx.config, 'plan_converted_to_pact', { userId, planId: p.id, pactId, key: `pcp:${p.id}`, props: { tasks: stats.tasks, invitees: stats.invitees, has_budget: stats.hasBudget } }, true);
  const who = (await q.query<{ user_id: string }>(`SELECT user_id FROM plan_rsvps WHERE plan_id = $1 AND status IN ('in', 'maybe') AND user_id <> $2`, [p.id, userId])).rows.map((r) => r.user_id);
  await notify(q, who, { type: 'plan_pact', title: `${p.title} became a Pact`, body: 'Time to make it happen together.', refId: p.id, meta: { about: p.cname }, push: `A plan in ${p.cname} became a Pact.` });
}

export type { PlanRow };

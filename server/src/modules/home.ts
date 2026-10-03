import type { CircleTint, ComingUpItem, HomeCircleDTO, HomeDTO, HomeObject, NeedsYouItem, NeedsYouType, PersonDTO, RecapCardDTO, RecapDTO, RecentItem } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { randomToken } from '../lib/crypto.js';
import { AppError, forbidden, notFound } from '../lib/errors.js';
import { track, visitorId } from '../lib/events.js';
import { formatNgn } from '../lib/money.js';
import { addDays, lagosToday } from '../lib/time.js';
import * as asks from './asks.js';
import { minimalPeople } from './asks.js';
import { listCircles } from './circles.js';
import { audit } from './platform.js';
import * as plans from './plans.js';
import { compactNgn } from './splits.js';
import * as splits from './splits.js';

/**
 * Home: what needs me right now, and everything I am doing with my people, from one request.
 *
 * Needs You only ever holds something the viewer can do now, and leaves the moment it is done (it is recomputed from the real
 * rows each time; nothing is hidden by the client). Everything on one object is one card. The order is fixed rules, no scoring:
 * a base weight per kind of action, plus a bump when it is due within three days. Highest first, then the soonest due.
 *
 * Recaps are derived from the finished Plan, Pact or Split. The only stored thing is a share link the organiser chose to make.
 */

const NEEDS_VISIBLE = 12;
const BASE: Record<NeedsYouType, number> = { pact_approval: 100, pact_task: 75, pact_contribution: 70, plan_task: 65, plan_rsvp: 55, ask: 50, attendance: 50, split_debt: 45, split_collect: 30 };
const SOON_DAYS = 3;
const CATEGORY_EMOJI: Record<string, string> = { birthday: '🎉', trip: '✈️', wedding: '💍', gift: '🎁', event: '🎶', dinner: '🍽️', household: '🏠', fund: '💰', other: '✨' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

type Circ = { name: string; emoji: string; tint: CircleTint } | null;
interface Part {
  key: string;
  objectType: HomeObject;
  sourceId: string;
  type: NeedsYouType;
  title: string;
  circleId?: string;
  circle: Circ;
  sentence: string;
  label: string;
  actionLabel: string;
  url: string;
  dueAt?: string | null;
}

/* ---------------------------------------------------------------- Needs You */

async function pactParts(q: Queryable, userId: string): Promise<Part[]> {
  const circ = (r: { circle_id: string | null; cname: string | null; cemoji: string | null; ctint: CircleTint | null }): Circ => (r.circle_id ? { name: r.cname!, emoji: r.cemoji!, tint: r.ctint! } : null);
  const base = `p.id AS pact_id, p.title, p.deadline::text AS deadline, p.circle_id, c.name AS cname, c.emoji AS cemoji, c.tint AS ctint`;
  const join = `JOIN pact_members m ON m.pact_id = p.id AND m.user_id = $1 AND m.status = 'joined' LEFT JOIN circles c ON c.id = p.circle_id`;
  const [contrib, tasks, approve] = await Promise.all([
    q.query<{ pact_id: string; title: string; deadline: string; circle_id: string | null; cname: string | null; cemoji: string | null; ctint: CircleTint | null; requested: number | null }>(
      `SELECT ${base}, m.requested_amount AS requested FROM pacts p ${join}
        WHERE p.status = 'open' AND p.mode <> 'orders' AND p.raised_amount < p.target_amount
          AND (m.requested_amount > 0 OR (m.participation IN ('money', 'both') AND m.contributed = 0 AND (m.role <> 'organizer' OR p.raised_amount > 0)))
        ORDER BY p.deadline LIMIT 10`,
      [userId],
    ),
    q.query<{ pact_id: string; title: string; deadline: string; circle_id: string | null; cname: string | null; cemoji: string | null; ctint: CircleTint | null; task: string }>(
      `SELECT ${base}, t.title AS task FROM tasks t JOIN pacts p ON p.id = t.pact_id ${join}
        WHERE t.assignee_id = $1 AND t.status <> 'done' AND p.status IN ('open', 'funded') AND p.completed_at IS NULL
        ORDER BY t.created_at LIMIT 20`,
      [userId],
    ),
    q.query<{ pact_id: string; title: string; deadline: string; circle_id: string | null; cname: string | null; cemoji: string | null; ctint: CircleTint | null; purpose: string | null }>(
      `SELECT ${base}, po.purpose FROM pact_payouts po JOIN pacts p ON p.id = po.pact_id
         JOIN pact_members m ON m.pact_id = p.id AND m.user_id = $1 AND m.status = 'joined' AND m.role IN ('organizer', 'co_organizer')
         LEFT JOIN circles c ON c.id = p.circle_id
        WHERE po.status = 'awaiting_approval' AND po.kind = 'vendor' AND po.requested_by IS DISTINCT FROM $1 AND p.completed_at IS NULL
        ORDER BY po.created_at LIMIT 10`,
      [userId],
    ),
  ]);
  const mk = (r: { pact_id: string; title: string; deadline: string; circle_id: string | null; cname: string | null; cemoji: string | null; ctint: CircleTint | null }, type: NeedsYouType, sentence: string, label: string, actionLabel: string): Part => ({
    key: `pact:${r.pact_id}`, objectType: 'pact', sourceId: r.pact_id, type, title: r.title, circleId: r.circle_id ?? undefined, circle: circ(r), sentence, label, actionLabel, url: `/app/pact/${r.pact_id}`, dueAt: r.deadline,
  });
  return [
    ...approve.rows.map((r) => mk(r, 'pact_approval', `A payment${r.purpose ? ` for ${r.purpose}` : ''} needs your approval.`, 'Approve', 'Review')),
    ...tasks.rows.map((r) => mk(r, 'pact_task', `You’re handling “${r.task}”.`, 'task', 'Mark done')),
    ...contrib.rows.map((r) => mk(r, 'pact_contribution', r.requested ? `Your share is ${formatNgn(r.requested)}.` : 'Your contribution is still needed.', 'Add money', 'Add money')),
  ];
}

/** Several things on one object become one card: the most important leads, and the rest are named underneath. */
function fold(parts: Part[], today: string): NeedsYouItem[] {
  const groups = new Map<string, Part[]>();
  for (const p of parts) groups.set(p.key, [...(groups.get(p.key) ?? []), p]);
  const soon = addDays(today, SOON_DAYS);
  const score = (p: Part) => BASE[p.type] + (p.dueAt && p.dueAt <= soon ? 20 : 0);
  const out: NeedsYouItem[] = [];
  for (const [key, g] of groups) {
    g.sort((a, b) => score(b) - score(a));
    const lead = g[0];
    const tasks = g.filter((p) => p.label === 'task' || p.label === 'Pick up').length;
    const labels = [...new Set(g.filter((p) => p.label !== 'task').map((p) => p.label))];
    if (tasks) labels.push(`${tasks} ${tasks === 1 ? 'task' : 'tasks'}`);
    const dues = g.map((p) => p.dueAt).filter(Boolean).sort() as string[];
    const many = g.length > 1;
    out.push({
      id: key,
      type: lead.type,
      objectType: lead.objectType,
      sourceId: lead.sourceId,
      circleId: lead.circleId,
      circle: lead.circle,
      title: lead.title,
      context: many ? `${g.length} things need you` : lead.sentence,
      parts: many ? labels : [lead.label === 'task' ? 'Task' : lead.label],
      actionLabel: many ? (lead.objectType === 'plan' ? 'Open Plan' : lead.objectType === 'pact' ? 'Open Pact' : lead.objectType === 'split' ? 'View Split' : 'Open') : lead.actionLabel,
      actionUrl: lead.url,
      priority: Math.max(...g.map(score)),
      ...(dues[0] ? { dueAt: dues[0] } : {}),
    });
  }
  return out.sort((a, b) => b.priority - a.priority || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.title.localeCompare(b.title));
}

async function needsYou(ctx: Ctx, userId: string, today: string) {
  const [askN, planN, splitN, pact] = await Promise.all([asks.needsYou(ctx, userId), plans.needsYou(ctx, userId), splits.needsYou(ctx, userId), pactParts(ctx.db, userId)]);
  const planIds = [...new Set([...planN.data.map((n) => n.planId), ...askN.data.flatMap((a) => (a.planId ? [a.planId] : []))])];
  const meta = new Map<string, { title: string; date: string | null; circle_id: string; circle: Circ }>();
  if (planIds.length) {
    const r = await ctx.db.query<{ id: string; title: string; date: string | null; circle_id: string; cname: string; cemoji: string; ctint: CircleTint }>(
      `SELECT p.id, p.title, p.date::text AS date, p.circle_id, c.name AS cname, c.emoji AS cemoji, c.tint AS ctint FROM plans p JOIN circles c ON c.id = p.circle_id WHERE p.id = ANY($1::uuid[])`,
      [planIds],
    );
    for (const x of r.rows) meta.set(x.id, { title: x.title, date: x.date, circle_id: x.circle_id, circle: { name: x.cname, emoji: x.cemoji, tint: x.ctint } });
  }
  const parts: Part[] = [...pact];
  for (const a of askN.data) {
    const pm = a.planId ? meta.get(a.planId) : undefined;
    if (pm && a.planId) {
      parts.push({ key: `plan:${a.planId}`, objectType: 'plan', sourceId: a.planId, type: a.type === 'attendance' ? 'attendance' : 'ask', title: pm.title, circleId: pm.circle_id, circle: pm.circle, sentence: a.type === 'attendance' ? 'They’re asking who’s in.' : 'They need your vote.', label: a.type === 'attendance' ? 'Who’s in' : 'Vote', actionLabel: 'Open Plan', url: `/app/plans/${a.planId}?from=home`, dueAt: pm.date });
    } else {
      parts.push({ key: `ask:${a.id}`, objectType: 'ask', sourceId: a.id, type: a.type === 'attendance' ? 'attendance' : 'ask', title: a.title, circleId: a.circleId, circle: a.circle, sentence: a.type === 'attendance' ? 'Are you coming?' : 'They need your vote.', label: a.type === 'attendance' ? 'Respond' : 'Vote', actionLabel: a.type === 'attendance' ? 'Respond' : 'Vote', url: `/app/asks/${a.id}?from=home` });
    }
  }
  for (const n of planN.data) {
    if (n.kind === 'soon') continue; // a date, not an action: it belongs in Coming up
    const pm = meta.get(n.planId);
    parts.push({
      key: `plan:${n.planId}`, objectType: 'plan', sourceId: n.planId, type: n.kind === 'rsvp' ? 'plan_rsvp' : 'plan_task', title: n.title, circleId: pm?.circle_id, circle: n.circle,
      sentence: n.kind === 'rsvp' ? 'You haven’t RSVP’d.' : n.text.endsWith('.') ? n.text : `${n.text}.`, label: n.kind === 'rsvp' ? 'RSVP' : 'task', actionLabel: n.kind === 'rsvp' ? 'RSVP' : 'Open task', url: `/app/plans/${n.planId}?from=home`, dueAt: pm?.date,
    });
  }
  for (const n of splitN.data) {
    parts.push({ key: `split:${n.splitId}`, objectType: 'split', sourceId: n.splitId, type: n.kind === 'owe' ? 'split_debt' : 'split_collect', title: n.title, circle: n.circle, sentence: `${n.text}.`, label: n.kind === 'owe' ? 'Owe' : 'Collect', actionLabel: n.kind === 'owe' ? 'View Split' : 'View', url: `/app/splits/${n.splitId}?from=home` });
  }
  const items = fold(parts, today);
  return { items: items.slice(0, NEEDS_VISIBLE), total: items.length, askPeople: [] as PersonDTO[] };
}

/* ---------------------------------------------------------------- Circles, Coming up, Recent, Recaps */

async function circlesShelf(ctx: Ctx, userId: string, needs: NeedsYouItem[]): Promise<{ list: HomeCircleDTO[]; people: PersonDTO[] }> {
  const r = await listCircles(ctx, userId);
  const circles = r.data.slice(0, 12);
  const ids = circles.map((c) => c.id);
  const pacts = ids.length
    ? (await ctx.db.query<{ circle_id: string; n: number }>(`SELECT p.circle_id, COUNT(*)::int AS n FROM pacts p JOIN pact_members m ON m.pact_id = p.id AND m.user_id = $1 AND m.status = 'joined' WHERE p.circle_id = ANY($2::uuid[]) AND p.status IN ('open', 'funded') AND p.completed_at IS NULL GROUP BY p.circle_id`, [userId, ids])).rows
    : [];
  const list = circles.map<HomeCircleDTO>((c) => {
    const mine = needs.filter((n) => n.circleId === c.id).length;
    const n = pacts.find((x) => x.circle_id === c.id)?.n ?? 0;
    // One signal: something for me, then what is coming up or active, then a Pact, then quiet.
    const signal: HomeCircleDTO['signal'] = c.live?.needsYou ? { text: c.live.text, kind: 'needs_you' } : mine ? { text: `${mine} ${mine === 1 ? 'thing needs' : 'things need'} your response`, kind: 'needs_you' } : c.live ? { text: c.live.text, kind: /unsettled/.test(c.live.text) ? 'split' : /starts/.test(c.live.text) ? 'soon' : 'plan' } : n ? { text: `${n} active ${n === 1 ? 'Pact' : 'Pacts'}`, kind: 'pact' } : { text: 'No action needed', kind: 'quiet' };
    return { id: c.id, name: c.name, emoji: c.emoji, tint: c.tint, memberCount: c.memberCount, memberIds: c.memberIds.slice(0, 3), signal };
  });
  list.sort((a, b) => Number(b.signal.kind === 'needs_you') - Number(a.signal.kind === 'needs_you'));
  return { list: list.slice(0, 6), people: r.people };
}

async function comingUp(q: Queryable, userId: string, today: string): Promise<ComingUpItem[]> {
  const until = addDays(today, 30);
  const [pl, pa] = await Promise.all([
    q.query<{ id: string; title: string; category: string; date: string; end_date: string | null; n_in: number; n_maybe: number }>(
      `SELECT p.id, p.title, p.category, p.date::text AS date, p.end_date::text AS end_date,
              (SELECT COUNT(*)::int FROM plan_rsvps r WHERE r.plan_id = p.id AND r.status = 'in') AS n_in,
              (SELECT COUNT(*)::int FROM plan_rsvps r WHERE r.plan_id = p.id AND r.status = 'maybe') AS n_maybe
         FROM plans p JOIN circle_members me ON me.circle_id = p.circle_id AND me.user_id = $1 AND me.status = 'joined'
        WHERE p.status IN ('planning', 'confirmed') AND p.pact_id IS NULL AND p.date BETWEEN $2::date AND $3::date ORDER BY p.date LIMIT 5`,
      [userId, today, until],
    ),
    q.query<{ id: string; title: string; category: string; deadline: string; status: string; raised: number; target: number }>(
      `SELECT p.id, p.title, p.category, p.deadline::text AS deadline, p.status, p.raised_amount::float8 AS raised, p.target_amount::float8 AS target
         FROM pacts p JOIN pact_members m ON m.pact_id = p.id AND m.user_id = $1 AND m.status = 'joined'
        WHERE p.status IN ('open', 'funded') AND p.completed_at IS NULL AND p.deadline BETWEEN $2::date AND $3::date ORDER BY p.deadline LIMIT 5`,
      [userId, today, until],
    ),
  ]);
  const items: ComingUpItem[] = [
    ...pl.rows.map<ComingUpItem>((p) => ({ kind: 'plan', id: p.id, title: p.title, emoji: CATEGORY_EMOJI[p.category] ?? '✨', date: p.date, endDate: p.end_date, text: `${p.n_in} in${p.n_maybe ? ` · ${p.n_maybe} maybe` : ''}`, url: `/app/plans/${p.id}?from=home` })),
    ...pa.rows.map<ComingUpItem>((p) => ({ kind: 'pact', id: p.id, title: p.title, emoji: CATEGORY_EMOJI[p.category] ?? '✨', date: p.deadline, endDate: null, text: p.status === 'funded' ? 'Funded' : `${Math.min(100, Math.round((p.raised / Math.max(1, p.target)) * 100))}% funded`, url: `/app/pact/${p.id}` })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
}

interface RecentRow {
  at: Date;
  actor_id: string | null;
  actor: string | null;
  text: string;
  object: HomeObject;
  url: string;
}

async function recent(q: Queryable, userId: string): Promise<RecentItem[]> {
  const win = `now() - interval '14 days'`;
  const circle = (alias: string, col = 'circle_id') => `JOIN circle_members me ON me.circle_id = ${alias}.${col} AND me.user_id = $1 AND me.status = 'joined'`;
  const [ask, plan, split, pact] = await Promise.all([
    q.query<{ at: Date; uid: string; first: string; kind: string; attendance: string | null; label: string | null; title: string; id: string }>(
      `SELECT aa.created_at AS at, aa.user_id AS uid, u.first_name AS first, aa.kind, aa.attendance, o.label, a.title, a.id
         FROM ask_activity aa JOIN asks a ON a.id = aa.ask_id ${circle('a')} JOIN users u ON u.id = aa.user_id LEFT JOIN ask_options o ON o.id = aa.option_id
        WHERE aa.created_at > ${win} AND aa.user_id <> $1 AND aa.kind IN ('responded', 'closed') ORDER BY aa.created_at DESC LIMIT 12`,
      [userId],
    ),
    q.query<{ at: Date; uid: string; first: string; kind: string; status: string | null; detail: string | null; title: string; id: string }>(
      `SELECT pa.created_at AS at, pa.user_id AS uid, u.first_name AS first, pa.kind, pa.status, pa.detail, p.title, p.id
         FROM plan_activity pa JOIN plans p ON p.id = pa.plan_id ${circle('p')} JOIN users u ON u.id = pa.user_id
        WHERE pa.created_at > ${win} AND pa.user_id <> $1 AND (pa.kind IN ('created', 'task_done', 'confirmed', 'done', 'cancelled', 'pact', 'date_changed') OR (pa.kind = 'rsvp' AND pa.status = 'in'))
        ORDER BY pa.created_at DESC LIMIT 12`,
      [userId],
    ),
    q.query<{ at: Date; uid: string; first: string; tfirst: string | null; kind: string; amount: number | null; title: string; id: string }>(
      `SELECT sa.created_at AS at, sa.user_id AS uid, u.first_name AS first, t.first_name AS tfirst, sa.kind, sa.amount::float8 AS amount, s.title, s.id
         FROM split_activity sa JOIN splits s ON s.id = sa.split_id ${circle('s')} JOIN users u ON u.id = sa.user_id LEFT JOIN users t ON t.id = sa.target_id
        WHERE sa.created_at > ${win} AND sa.user_id <> $1 AND sa.kind IN ('created', 'settled', 'completed') ORDER BY sa.created_at DESC LIMIT 12`,
      [userId],
    ),
    q.query<{ at: Date; uid: string | null; first: string | null; type: string; amount: number | null; detail: string | null; title: string; id: string }>(
      `SELECT a.created_at AS at, a.actor_id AS uid, u.first_name AS first, a.type, a.amount::float8 AS amount, a.detail, p.title, p.id
         FROM activities a JOIN pacts p ON p.id = a.pact_id JOIN pact_members me ON me.pact_id = p.id AND me.user_id = $1 AND me.status = 'joined' LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.created_at > ${win} AND a.actor_id IS DISTINCT FROM $1 AND a.type IN ('contribution', 'task_done', 'join', 'pact_completed', 'completed') ORDER BY a.created_at DESC LIMIT 12`,
      [userId],
    ),
  ]);
  const rows: RecentRow[] = [];
  for (const r of ask.rows) {
    const url = `/app/asks/${r.id}?from=home`;
    const text = r.kind === 'closed' ? `Decision made: ${r.title}` : r.label ? `${r.first} voted for ${r.label}` : r.attendance === 'in' ? `${r.first} is in for ${r.title}` : r.attendance === 'maybe' ? `${r.first} said maybe to ${r.title}` : `${r.first} can’t make ${r.title}`;
    rows.push({ at: r.at, actor_id: r.uid, actor: r.first, text, object: 'ask', url });
  }
  for (const r of plan.rows) {
    const url = `/app/plans/${r.id}?from=home`;
    const t: Record<string, string> = {
      created: `${r.first} made a plan: ${r.title}`,
      rsvp: `${r.first} is in for ${r.title}`,
      task_done: `${r.first} completed ${r.detail ?? 'a task'}`,
      confirmed: `${r.title} was confirmed`,
      done: `${r.title} was completed`,
      cancelled: `${r.title} was cancelled`,
      pact: `${r.title} became a Pact`,
      date_changed: `${r.first} changed the date for ${r.title}`,
    };
    rows.push({ at: r.at, actor_id: r.uid, actor: r.first, text: t[r.kind] ?? r.title, object: 'plan', url });
  }
  for (const r of split.rows) {
    const url = `/app/splits/${r.id}?from=home`;
    const text = r.kind === 'settled' ? `${r.tfirst ?? r.first} settled ${r.amount ? formatNgn(r.amount) : 'their share'}` : r.kind === 'completed' ? `${r.title} is all settled` : `${r.first} split ${r.title}`;
    rows.push({ at: r.at, actor_id: r.uid, actor: r.first, text, object: 'split', url });
  }
  for (const r of pact.rows) {
    const url = `/app/pact/${r.id}`;
    const who = r.first ?? 'Someone';
    const text = r.type === 'contribution' ? `${who} added ${r.amount ? compactNgn(r.amount) : 'money'} to ${r.title}` : r.type === 'task_done' ? `${who} completed ${r.detail ?? 'a task'}` : r.type === 'join' ? `${who} joined ${r.title}` : r.type === 'completed' ? `${r.title} reached its goal` : `${r.title} was completed`;
    rows.push({ at: r.at, actor_id: r.uid, actor: r.first, text, object: 'pact', url });
  }
  return rows
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10)
    .map((r, i) => ({ id: `${r.object}-${new Date(r.at).getTime()}-${i}`, objectType: r.object, actorId: r.actor_id, text: r.text, at: new Date(r.at).toISOString(), url: r.url }));
}

async function recaps(q: Queryable, userId: string): Promise<RecapCardDTO[]> {
  const win = `now() - interval '60 days'`;
  const [pl, pa, sp] = await Promise.all([
    q.query<{ id: string; title: string; category: string; at: Date; people: number; cname: string }>(
      `SELECT p.id, p.title, p.category, p.updated_at AS at, GREATEST(1, (SELECT COUNT(*)::int FROM plan_rsvps r WHERE r.plan_id = p.id AND r.status = 'in')) AS people, c.name AS cname
         FROM plans p JOIN circles c ON c.id = p.circle_id JOIN circle_members me ON me.circle_id = p.circle_id AND me.user_id = $1 AND me.status = 'joined'
        WHERE p.status = 'done' AND p.updated_at > ${win} ORDER BY p.updated_at DESC LIMIT 3`,
      [userId],
    ),
    q.query<{ id: string; title: string; category: string; at: Date; people: number; cname: string | null }>(
      `SELECT p.id, p.title, p.category, p.completed_at AS at, (SELECT COUNT(*)::int FROM pact_members x WHERE x.pact_id = p.id AND x.status = 'joined') AS people, c.name AS cname
         FROM pacts p JOIN pact_members m ON m.pact_id = p.id AND m.user_id = $1 AND m.status = 'joined' LEFT JOIN circles c ON c.id = p.circle_id
        WHERE p.completed_at IS NOT NULL AND p.completed_at > ${win} ORDER BY p.completed_at DESC LIMIT 3`,
      [userId],
    ),
    q.query<{ id: string; title: string; at: Date; people: number; cname: string }>(
      `SELECT s.id, s.title, s.settled_at AS at, (SELECT COUNT(*)::int FROM split_shares x WHERE x.split_id = s.id) AS people, c.name AS cname
         FROM splits s JOIN circles c ON c.id = s.circle_id JOIN circle_members me ON me.circle_id = s.circle_id AND me.user_id = $1 AND me.status = 'joined'
        WHERE s.status = 'settled' AND s.settled_at > ${win} ORDER BY s.settled_at DESC LIMIT 3`,
      [userId],
    ),
  ]);
  const all: RecapCardDTO[] = [
    ...pl.rows.map<RecapCardDTO>((r) => ({ kind: 'plan', id: r.id, title: r.title, emoji: CATEGORY_EMOJI[r.category] ?? '✨', circleName: r.cname, completedAt: new Date(r.at).toISOString(), people: r.people, url: `/app/recap/plan/${r.id}` })),
    ...pa.rows.map<RecapCardDTO>((r) => ({ kind: 'pact', id: r.id, title: r.title, emoji: CATEGORY_EMOJI[r.category] ?? '✨', circleName: r.cname, completedAt: new Date(r.at).toISOString(), people: r.people, url: `/app/recap/pact/${r.id}` })),
    ...sp.rows.map<RecapCardDTO>((r) => ({ kind: 'split', id: r.id, title: r.title, emoji: '🧾', circleName: r.cname, completedAt: new Date(r.at).toISOString(), people: r.people, url: `/app/recap/split/${r.id}` })),
  ];
  return all.sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 3);
}

/** New (nothing yet), finished-only (made things happen, nothing running), or active. */
async function homeState(q: Queryable, userId: string, hasRecaps: boolean): Promise<HomeDTO['state']> {
  const r = (
    await q.query<{ any_obj: boolean; running: boolean }>(
      `SELECT (EXISTS (SELECT 1 FROM pact_members WHERE user_id = $1 AND status IN ('joined', 'invited'))
               OR EXISTS (SELECT 1 FROM circle_members WHERE user_id = $1 AND status = 'joined')) AS any_obj,
              (EXISTS (SELECT 1 FROM pact_members m JOIN pacts p ON p.id = m.pact_id WHERE m.user_id = $1 AND m.status IN ('joined', 'invited') AND p.status IN ('open', 'funded') AND p.completed_at IS NULL)
               OR EXISTS (SELECT 1 FROM plans p JOIN circle_members me ON me.circle_id = p.circle_id AND me.user_id = $1 AND me.status = 'joined' WHERE p.status IN ('planning', 'confirmed'))
               OR EXISTS (SELECT 1 FROM splits s JOIN circle_members me ON me.circle_id = s.circle_id AND me.user_id = $1 AND me.status = 'joined' WHERE s.status = 'open')
               OR EXISTS (SELECT 1 FROM asks a JOIN circle_members me ON me.circle_id = a.circle_id AND me.user_id = $1 AND me.status = 'joined' WHERE a.status = 'open')) AS running`,
      [userId],
    )
  ).rows[0];
  if (!r.any_obj) return 'new';
  return !r.running && hasRecaps ? 'finished_only' : 'active';
}

export async function getHome(ctx: Ctx, userId: string) {
  const today = lagosToday(ctx.now());
  const needs = await needsYou(ctx, userId, today);
  const [shelf, soon, rec, recapList] = await Promise.all([circlesShelf(ctx, userId, needs.items), comingUp(ctx.db, userId, today), recent(ctx.db, userId), recaps(ctx.db, userId)]);
  const state = await homeState(ctx.db, userId, recapList.length > 0);
  const data: HomeDTO = { state, needsYou: needs.items, needsYouTotal: needs.total, circles: shelf.list, comingUp: soon, recent: rec, recaps: recapList };
  const ids = [...shelf.list.flatMap((c) => c.memberIds), ...rec.flatMap((r) => (r.actorId ? [r.actorId] : []))];
  return { data, people: [...(await minimalPeople(ctx.db, ids)), ...shelf.people.filter((p) => ids.includes(p.id))] };
}

/* ---------------------------------------------------------------- Recaps */

type Kind = 'plan' | 'pact' | 'split';
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const rangeText = (d: string, e: string | null) => (!e || e === d ? short(d) : d.slice(5, 7) === e.slice(5, 7) ? `${short(d)}–${Number(e.slice(8, 10))}` : `${short(d)} – ${short(e)}`);

interface Built {
  recap: Omit<RecapDTO, 'share' | 'personIds'>;
  personIds: string[];
  canManage: (userId: string) => boolean;
  circleId: string | null;
  pseudo: { planId?: string; pactId?: string; splitId?: string };
}

/** Everything a recap says, from the finished object. `member` adds the viewer-only extras (names, money). Null if not finished. */
async function build(q: Queryable, kind: Kind, id: string, member: boolean): Promise<Built | null> {
  if (!UUID_RE.test(id)) return null;
  if (kind === 'plan') {
    const p = (await q.query<{ id: string; title: string; category: string; date: string | null; end_date: string | null; status: string; updated_at: Date; created_by: string; circle_id: string; cname: string; cemoji: string; ctint: CircleTint }>(
      `SELECT p.id, p.title, p.category, p.date::text AS date, p.end_date::text AS end_date, p.status, p.updated_at, p.created_by, p.circle_id, c.name AS cname, c.emoji AS cemoji, c.tint AS ctint FROM plans p JOIN circles c ON c.id = p.circle_id WHERE p.id = $1`,
      [id],
    )).rows[0];
    if (!p || p.status !== 'done') return null;
    const [ins, dec, tasks] = await Promise.all([
      q.query<{ user_id: string }>(`SELECT user_id FROM plan_rsvps WHERE plan_id = $1 AND status = 'in'`, [id]),
      q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM asks WHERE plan_id = $1 AND (status = 'closed' OR (closes_at IS NOT NULL AND closes_at <= now()))`, [id]),
      q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM plan_tasks WHERE plan_id = $1 AND status = 'done'`, [id]),
    ]);
    const people = Math.max(1, ins.rows.length);
    const metrics = [{ label: people === 1 ? 'person' : 'people', value: String(people) }];
    if (dec.rows[0].n) metrics.push({ label: dec.rows[0].n === 1 ? 'decision' : 'decisions', value: String(dec.rows[0].n) });
    if (tasks.rows[0].n) metrics.push({ label: tasks.rows[0].n === 1 ? 'task' : 'tasks', value: String(tasks.rows[0].n) });
    if (p.date && p.end_date && p.end_date > p.date) metrics.push({ label: 'days together', value: String(dayDiff(p.date, p.end_date) + 1) });
    return {
      recap: { kind, title: p.title, emoji: CATEGORY_EMOJI[p.category] ?? '✨', circle: { name: p.cname, emoji: p.cemoji, tint: p.ctint }, headline: 'We made it happen.', completedAt: p.updated_at.toISOString(), metrics, when: p.date ? rangeText(p.date, p.end_date) : null },
      personIds: member ? ins.rows.map((r) => r.user_id) : [], canManage: (u) => u === p.created_by, circleId: p.circle_id, pseudo: { planId: id },
    };
  }
  if (kind === 'pact') {
    const p = (await q.query<{ id: string; title: string; category: string; completed_at: Date; organizer_id: string; raised: number; circle_id: string | null; cname: string | null; cemoji: string | null; ctint: CircleTint | null }>(
      `SELECT p.id, p.title, p.category, p.completed_at, p.organizer_id, p.raised_amount::float8 AS raised, p.circle_id, c.name AS cname, c.emoji AS cemoji, c.tint AS ctint FROM pacts p LEFT JOIN circles c ON c.id = p.circle_id WHERE p.id = $1`,
      [id],
    )).rows[0];
    if (!p || !p.completed_at) return null;
    const [mem, tasks] = await Promise.all([
      q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined'`, [id]),
      q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM tasks WHERE pact_id = $1 AND status = 'done'`, [id]),
    ]);
    const metrics = [{ label: mem.rows.length === 1 ? 'person' : 'people', value: String(mem.rows.length) }];
    if (p.raised > 0) metrics.push({ label: 'coordinated', value: compactNgn(p.raised) });
    if (tasks.rows[0].n) metrics.push({ label: tasks.rows[0].n === 1 ? 'task completed' : 'tasks completed', value: String(tasks.rows[0].n) });
    return {
      recap: { kind, title: p.title, emoji: CATEGORY_EMOJI[p.category] ?? '✨', circle: p.circle_id ? { name: p.cname!, emoji: p.cemoji!, tint: p.ctint! } : null, headline: 'We made it happen.', completedAt: p.completed_at.toISOString(), metrics, when: null },
      personIds: member ? mem.rows.map((r) => r.user_id) : [], canManage: (u) => u === p.organizer_id, circleId: p.circle_id, pseudo: { pactId: id },
    };
  }
  const s = (await q.query<{ id: string; title: string; total: number; status: string; settled_at: Date | null; created_by: string; circle_id: string; cname: string; cemoji: string; ctint: CircleTint }>(
    `SELECT s.id, s.title, s.total_amount::float8 AS total, s.status, s.settled_at, s.created_by, s.circle_id, c.name AS cname, c.emoji AS cemoji, c.tint AS ctint FROM splits s JOIN circles c ON c.id = s.circle_id WHERE s.id = $1`,
    [id],
  )).rows[0];
  if (!s || s.status !== 'settled' || !s.settled_at) return null;
  const shares = (await q.query<{ user_id: string }>('SELECT user_id FROM split_shares WHERE split_id = $1', [id])).rows;
  // The amount is for people in the Circle. A shared recap says who it was for and that it is settled, never what anyone owed.
  const metrics = [{ label: shares.length === 1 ? 'person' : 'people', value: String(shares.length) }];
  if (member) metrics.push({ label: 'split', value: formatNgn(s.total) });
  return {
    recap: { kind, title: s.title, emoji: '🧾', circle: { name: s.cname, emoji: s.cemoji, tint: s.ctint }, headline: 'All settled ✓', completedAt: s.settled_at.toISOString(), metrics, when: null },
    personIds: member ? shares.map((r) => r.user_id) : [], canManage: (u) => u === s.created_by, circleId: s.circle_id, pseudo: { splitId: id },
  };
}

const memberOf = async (q: Queryable, kind: Kind, id: string, userId: string) => {
  if (!UUID_RE.test(id)) return false;
  const sql =
    kind === 'pact'
      ? `SELECT 1 FROM pact_members WHERE pact_id = $1 AND user_id = $2 AND status = 'joined'`
      : `SELECT 1 FROM ${kind === 'plan' ? 'plans' : 'splits'} x JOIN circle_members m ON m.circle_id = x.circle_id AND m.user_id = $2 AND m.status = 'joined' WHERE x.id = $1`;
  return !!(await q.query(sql, [id, userId])).rowCount;
};

const activeToken = async (q: Queryable, kind: Kind, id: string) => (await q.query<{ token: string }>('SELECT token FROM recap_links WHERE kind = $1 AND object_id = $2 AND revoked_at IS NULL', [kind, id])).rows[0]?.token ?? null;

export async function getRecap(ctx: Ctx, userId: string, kind: Kind, id: string, from: 'home' | 'object' = 'object') {
  if (!(await memberOf(ctx.db, kind, id, userId))) throw notFound('That recap');
  const b = await build(ctx.db, kind, id, true);
  if (!b) throw notFound('That recap');
  await track(ctx.db, ctx.config, 'recap_viewed', { userId, ...b.pseudo, key: `rv:${userId}:${kind}:${id}:${ctx.now().toISOString().slice(0, 10)}`, props: { object_type: kind, from } });
  const data: RecapDTO = { ...b.recap, personIds: b.personIds, share: { token: await activeToken(ctx.db, kind, id), canManage: b.canManage(userId) } };
  return { data, people: await minimalPeople(ctx.db, b.personIds) };
}

/** The organiser turns sharing on. Idempotent: one live link per recap. */
export async function enableShare(ctx: Ctx, userId: string, kind: Kind, id: string, meta: ReqMeta) {
  if (!(await memberOf(ctx.db, kind, id, userId))) throw notFound('That recap');
  await ctx.db.tx(async (q) => {
    const b = await build(q, kind, id, false);
    if (!b) throw notFound('That recap');
    if (!b.canManage(userId)) throw forbidden('Only the person who organised it can share its recap.');
    if (!(await activeToken(q, kind, id))) {
      await q.query('INSERT INTO recap_links (token, kind, object_id, created_by) VALUES ($1, $2, $3, $4)', [randomToken(32), kind, id, userId]);
      await audit(q, { actorId: userId, action: 'recap.share_on', targetType: kind, targetId: id, ip: meta.ip });
    }
  });
  return getRecap(ctx, userId, kind, id);
}

export async function revokeShare(ctx: Ctx, userId: string, kind: Kind, id: string, meta: ReqMeta) {
  if (!(await memberOf(ctx.db, kind, id, userId))) throw notFound('That recap');
  await ctx.db.tx(async (q) => {
    const b = await build(q, kind, id, false);
    if (!b) throw notFound('That recap');
    if (!b.canManage(userId)) throw forbidden('Only the person who organised it can turn the link off.');
    await q.query('UPDATE recap_links SET revoked_at = now() WHERE kind = $1 AND object_id = $2 AND revoked_at IS NULL', [kind, id]);
    await audit(q, { actorId: userId, action: 'recap.share_off', targetType: kind, targetId: id, ip: meta.ip });
  });
  return getRecap(ctx, userId, kind, id);
}

/** What a shared recap link shows anyone: the headline and a few numbers. No names, no debts, no money for Splits. */
export async function previewShared(ctx: Ctx, token: string, req: ReqMeta) {
  if (!TOKEN.test(token)) throw notFound('That recap');
  const link = (await ctx.db.query<{ kind: Kind; object_id: string; revoked_at: Date | null }>('SELECT kind, object_id, revoked_at FROM recap_links WHERE token = $1', [token])).rows[0];
  if (!link) throw notFound('That recap');
  if (link.revoked_at) throw new AppError(410, 'recap_link_off', 'This link is no longer active.');
  const b = await build(ctx.db, link.kind, link.object_id, false);
  if (!b) throw notFound('That recap');
  const who = visitorId(ctx.config, req.ip, req.userAgent, ctx.now().toISOString().slice(0, 10));
  await track(ctx.db, ctx.config, 'recap_share_opened', { actor: who, ...b.pseudo, key: `rso:${who}:${link.object_id}`, props: { object_type: link.kind } });
  const data: RecapDTO = { ...b.recap, personIds: [], share: null };
  return { data, people: [] as PersonDTO[] };
}

export async function recordRecapShared(ctx: Ctx, userId: string, kind: Kind, id: string, via: 'native' | 'copy') {
  if (!(await memberOf(ctx.db, kind, id, userId))) throw notFound('That recap');
  const b = await build(ctx.db, kind, id, false);
  if (!b) throw notFound('That recap');
  await track(ctx.db, ctx.config, 'recap_shared', { userId, ...b.pseudo, key: `rsh:${userId}:${id}:${ctx.now().toISOString().slice(0, 10)}`, props: { object_type: kind, via, section: 'recap' } });
  return { ok: true };
}

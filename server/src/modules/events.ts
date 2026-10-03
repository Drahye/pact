import type { Ctx } from '../context.js';
import { pactId as pactPseudo, personId, rowKey, track, type ClientEventName, type EventName, amountBand } from '../lib/events.js';

/**
 * Turns what the server has already recorded (users, Pacts, members, activities) into product events.
 * Reading committed state means every event is authoritative, and none of the money or join code
 * paths had to change (two choices made at the moment of joining are the exception; see joinByCode). Each event has an idempotency key, so running this again, or from two
 * workers, records nothing twice. Only pseudonyms are written; see lib/events.ts.
 */
interface Source {
  name: EventName;
  /** Rows after $1 (a timestamp), oldest first. Must expose `ts`. */
  sql: string;
  map: (r: Record<string, any>, ctx: Ctx) => { userId?: string | null; pactId?: string | null; key: string; props: Record<string, unknown> };
}

const DAY = 86_400_000;
const days = (a: Date, b: Date) => Math.max(0, Math.floor((new Date(a).getTime() - new Date(b).getTime()) / DAY));
const labelToParticipation = (d: string | null) => (!d ? null : d.includes('and taking') ? 'both' : d.includes('confirm') ? 'later' : d.includes('money') ? 'money' : d.includes('task') ? 'task' : null);

const sources: Source[] = [
  {
    name: 'signup_completed',
    sql: `SELECT u.id AS user_id, u.created_at AS ts, (u.referred_by IS NOT NULL) AS referred,
                 EXISTS (SELECT 1 FROM pact_phone_invites i WHERE i.phone = u.phone AND i.claimed_at IS NOT NULL) AS had_invite
            FROM users u WHERE u.created_at > $1 ORDER BY u.created_at LIMIT 2000`,
    map: (r, ctx) => ({ userId: r.user_id, key: `s:${personId(ctx.config, r.user_id)}`, props: { referred: r.referred, had_invite: r.had_invite } }),
  },
  {
    name: 'pact_created',
    sql: `SELECT p.id AS pact_id, p.organizer_id AS user_id, p.created_at AS ts, p.category, p.mode, p.split_mode, p.missed_goal_policy,
                 (SELECT COUNT(*)::int FROM budget_items b WHERE b.pact_id = p.id) AS budget_lines,
                 (SELECT COUNT(*)::int FROM tasks t WHERE t.pact_id = p.id AND t.created_by = p.organizer_id AND t.created_at <= p.created_at + interval '1 minute') AS tasks,
                 (SELECT COUNT(*)::int FROM pact_members m WHERE m.pact_id = p.id AND m.invited_by = p.organizer_id AND m.created_at <= p.created_at + interval '1 minute')
                   + (SELECT COUNT(*)::int FROM pact_phone_invites i WHERE i.pact_id = p.id AND i.invited_by = p.organizer_id AND i.created_at <= p.created_at + interval '1 minute') AS invites,
                 EXISTS (SELECT 1 FROM pact_members m WHERE m.user_id = p.organizer_id AND m.role = 'member' AND m.joined_at IS NOT NULL AND m.joined_at < p.created_at) AS was_participant
            FROM pacts p WHERE p.created_at > $1 ORDER BY p.created_at LIMIT 2000`,
    map: (r, ctx) => ({
      userId: r.user_id,
      pactId: r.pact_id,
      key: `pc:${pactPseudo(ctx.config, r.pact_id)}`,
      props: { category: r.category, mode: r.mode === 'orders' ? 'orders' : r.budget_lines > 0 ? 'budget' : 'target', tasks: r.tasks, invites: r.invites, split_mode: r.split_mode, missed_goal: r.missed_goal_policy, was_participant: r.was_participant },
    }),
  },
  {
    name: 'second_pact_created',
    sql: `SELECT * FROM (SELECT p.id AS pact_id, p.organizer_id AS user_id, p.created_at AS ts,
                 ROW_NUMBER() OVER (PARTITION BY p.organizer_id ORDER BY p.created_at) AS n FROM pacts p) x
           WHERE n = 2 AND ts > $1 ORDER BY ts LIMIT 2000`,
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `sp:${personId(ctx.config, r.user_id)}`, props: {} }),
  },
  {
    name: 'first_pact_created',
    sql: `SELECT * FROM (SELECT p.id AS pact_id, p.organizer_id AS user_id, p.created_at AS ts, p.category,
                 ROW_NUMBER() OVER (PARTITION BY p.organizer_id ORDER BY p.created_at) AS n FROM pacts p) x
           WHERE n = 1 AND ts > $1 ORDER BY ts LIMIT 2000`,
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `fp:${personId(ctx.config, r.user_id)}`, props: { category: r.category } }),
  },
  {
    name: 'first_invite_created',
    sql: `SELECT * FROM (
            SELECT x.*, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts) AS n FROM (
              SELECT m.pact_id, m.invited_by AS user_id, m.created_at AS ts, 'member' AS via FROM pact_members m WHERE m.invited_by IS NOT NULL
              UNION ALL
              SELECT i.pact_id, i.invited_by, i.created_at, 'phone' FROM pact_phone_invites i) x) y
           WHERE n = 1 AND ts > $1 ORDER BY ts LIMIT 2000`,
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `fi:${personId(ctx.config, r.user_id)}`, props: { via: r.via } }),
  },
  {
    name: 'first_pact_joined',
    sql: `SELECT * FROM (SELECT m.pact_id, m.user_id, m.joined_at AS ts, (m.invited_by IS NOT NULL) AS invited,
                 ROW_NUMBER() OVER (PARTITION BY m.user_id ORDER BY m.joined_at) AS n
                 FROM pact_members m WHERE m.role = 'member' AND m.joined_at IS NOT NULL) x
           WHERE n = 1 AND ts > $1 ORDER BY ts LIMIT 2000`,
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `fj:${personId(ctx.config, r.user_id)}`, props: { via: r.invited ? 'invite' : 'link' } }),
  },
  {
    name: 'invite_created',
    sql: `SELECT m.pact_id, m.invited_by AS user_id, m.user_id AS invitee, m.created_at AS ts, 'member' AS via,
                 (m.created_at <= p.created_at + interval '1 minute') AS at_create
            FROM pact_members m JOIN pacts p ON p.id = m.pact_id WHERE m.invited_by IS NOT NULL AND m.created_at > $1
          UNION ALL
          SELECT i.pact_id, i.invited_by, NULL, i.created_at, 'phone', (i.created_at <= p.created_at + interval '1 minute')
            FROM pact_phone_invites i JOIN pacts p ON p.id = i.pact_id WHERE i.created_at > $1
          ORDER BY ts LIMIT 4000`,
    // Phone invites have no id here; (pact, inviter, timestamp) is unique enough for a key.
    map: (r, ctx) => ({
      userId: r.user_id,
      pactId: r.pact_id,
      key: `i:${rowKey(ctx.config, r.via, `${r.pact_id}:${r.invitee ?? new Date(r.ts).getTime()}:${r.user_id}`)}`,
      props: { via: r.via, count: 1, at: r.at_create ? 'create' : 'later' },
    }),
  },
  {
    name: 'pact_joined',
    sql: `SELECT m.pact_id, m.user_id, m.joined_at AS ts, (m.invited_by IS NOT NULL) AS invited
            FROM pact_members m WHERE m.role = 'member' AND m.joined_at IS NOT NULL AND m.joined_at > $1 ORDER BY m.joined_at LIMIT 4000`,
    // Counted once per person per Pact, even if they leave and come back.
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `j:${personId(ctx.config, r.user_id)}:${pactPseudo(ctx.config, r.pact_id)}`, props: { via: r.invited ? 'invite' : 'link' } }),
  },
  {
    name: 'participation_selected',
    sql: `SELECT a.id, a.pact_id, a.actor_id AS user_id, a.created_at AS ts, a.detail FROM activities a WHERE a.type = 'committed' AND a.created_at > $1 ORDER BY a.created_at LIMIT 4000`,
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `ps:${rowKey(ctx.config, 'a', r.id)}`, props: { participation: labelToParticipation(r.detail), at: 'later' } }),
  },
  {
    name: 'task_claimed',
    sql: `SELECT a.id, a.pact_id, a.actor_id AS user_id, a.created_at AS ts FROM activities a WHERE a.type = 'task_claimed' AND a.created_at > $1 ORDER BY a.created_at LIMIT 4000`,
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `tk:${rowKey(ctx.config, 'a', r.id)}`, props: { self: true } }),
  },
  {
    name: 'task_completed',
    sql: `SELECT a.id, a.pact_id, a.actor_id AS user_id, a.created_at AS ts FROM activities a WHERE a.type = 'task_done' AND a.created_at > $1 ORDER BY a.created_at LIMIT 4000`,
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `td:${rowKey(ctx.config, 'a', r.id)}`, props: { by_assignee: true } }),
  },
  {
    name: 'contribution_completed',
    sql: `SELECT a.id, a.pact_id, a.actor_id AS user_id, a.created_at AS ts, a.amount, (a.type = 'guest_contribution') AS guest,
                 NOT EXISTS (SELECT 1 FROM activities b WHERE b.pact_id = a.pact_id AND b.actor_id = a.actor_id AND b.type = 'contribution' AND b.created_at < a.created_at) AS first_for_person
            FROM activities a WHERE a.type IN ('contribution', 'guest_contribution') AND a.created_at > $1 ORDER BY a.created_at LIMIT 4000`,
    map: (r, ctx) => ({
      userId: r.user_id,
      pactId: r.pact_id,
      key: `c:${rowKey(ctx.config, 'a', r.id)}`,
      props: { amount_band: amountBand(Number(r.amount ?? 0) / 100), guest: r.guest, first_for_person: r.guest ? undefined : r.first_for_person },
    }),
  },
  {
    name: 'pact_funded',
    sql: `SELECT p.id AS pact_id, p.funded_at AS ts, p.created_at, p.mode, (SELECT COUNT(*)::int FROM budget_items b WHERE b.pact_id = p.id) AS budget_lines
            FROM pacts p WHERE p.funded_at IS NOT NULL AND p.funded_at > $1 ORDER BY p.funded_at LIMIT 2000`,
    map: (r, ctx) => ({ pactId: r.pact_id, key: `pf:${pactPseudo(ctx.config, r.pact_id)}`, props: { mode: r.mode === 'orders' ? 'orders' : r.budget_lines > 0 ? 'budget' : 'target', days_to_fund: days(r.ts, r.created_at) } }),
  },
  {
    name: 'pact_completed',
    sql: `SELECT p.id AS pact_id, p.closed_at AS ts, p.funded_at FROM pacts p WHERE p.status = 'released' AND p.closed_at IS NOT NULL AND p.closed_at > $1 ORDER BY p.closed_at LIMIT 2000`,
    map: (r, ctx) => ({ pactId: r.pact_id, key: `pk:${pactPseudo(ctx.config, r.pact_id)}`, props: { days_since_funded: r.funded_at ? days(r.ts, r.funded_at) : 0 } }),
  },
  {
    // The first payment asked for from the pool: the moment funding turns into execution.
    name: 'pact_execution_started',
    sql: `SELECT x.pact_id, x.ts, p.funded_at, x.with_line FROM (
            SELECT pact_id, MIN(created_at) AS ts, BOOL_OR(budget_item_id IS NOT NULL) AS with_line
              FROM pact_payouts WHERE kind = 'vendor' GROUP BY pact_id) x
            JOIN pacts p ON p.id = x.pact_id WHERE x.ts > $1 ORDER BY x.ts LIMIT 2000`,
    map: (r, ctx) => ({ pactId: r.pact_id, key: `xs:${pactPseudo(ctx.config, r.pact_id)}`, props: { days_since_funded: r.funded_at ? days(r.ts, r.funded_at) : 0, with_budget_line: r.with_line } }),
  },
  {
    name: 'pact_payment_completed',
    sql: `SELECT o.id, o.pact_id, o.completed_at AS ts, o.amount, (o.budget_item_id IS NOT NULL) AS with_line, (o.decided_by IS NOT NULL) AS approved
            FROM pact_payouts o WHERE o.kind = 'vendor' AND o.status = 'succeeded' AND o.completed_at > $1 ORDER BY o.completed_at LIMIT 4000`,
    map: (r, ctx) => ({ pactId: r.pact_id, key: `xp:${rowKey(ctx.config, 'o', r.id)}`, props: { amount_band: amountBand(Number(r.amount) / 100), with_budget_line: r.with_line, needed_approval: r.approved } }),
  },
  {
    name: 'pact_outcome_completed',
    sql: `SELECT p.id AS pact_id, p.completed_by AS user_id, p.completed_at AS ts, p.funded_at,
                 (SELECT COUNT(DISTINCT o.budget_item_id)::int FROM pact_payouts o WHERE o.pact_id = p.id AND o.kind = 'vendor' AND o.status = 'succeeded' AND o.budget_item_id IS NOT NULL) AS paid_lines,
                 (SELECT COUNT(*)::int FROM tasks t WHERE t.pact_id = p.id) AS tasks,
                 (SELECT COUNT(*)::int FROM tasks t WHERE t.pact_id = p.id AND t.status = 'done') AS tasks_done,
                 (p.status = 'released') AS released
            FROM pacts p WHERE p.completed_at IS NOT NULL AND p.completed_at > $1 ORDER BY p.completed_at LIMIT 2000`,
    map: (r, ctx) => ({
      userId: r.user_id,
      pactId: r.pact_id,
      key: `po:${pactPseudo(ctx.config, r.pact_id)}`,
      props: {
        days_since_funded: r.funded_at ? days(r.ts, r.funded_at) : 0,
        paid_lines: r.paid_lines,
        tasks_done_band: r.tasks === 0 ? 'no_tasks' : r.tasks_done === 0 ? 'none' : r.tasks_done === r.tasks ? 'all' : r.tasks_done / r.tasks >= 0.5 ? 'most' : 'some',
        released_remaining: r.released,
      },
    }),
  },
  {
    name: 'pact_update_posted',
    sql: `SELECT u.id, u.pact_id, u.author_id AS user_id, u.created_at AS ts, char_length(u.body) AS len FROM pact_updates u WHERE u.created_at > $1 ORDER BY u.created_at LIMIT 4000`,
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `up:${rowKey(ctx.config, 'u', r.id)}`, props: { length: r.len < 60 ? 'short' : r.len < 200 ? 'medium' : 'long' } }),
  },
  {
    name: 'activity_commented',
    sql: `SELECT c.id, c.pact_id, c.user_id, c.created_at AS ts, (a.type = 'update') AS on_update,
                 NOT EXISTS (SELECT 1 FROM activity_comments p WHERE p.activity_id = c.activity_id AND p.created_at < c.created_at) AS first_on_item
            FROM activity_comments c JOIN activities a ON a.id = c.activity_id WHERE c.created_at > $1 ORDER BY c.created_at LIMIT 4000`,
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `ac:${rowKey(ctx.config, 'c', r.id)}`, props: { on: r.on_update ? 'update' : 'system', first_on_item: r.first_on_item } }),
  },
  {
    name: 'activity_reacted',
    sql: `SELECT r.activity_id, r.user_id, r.pact_id, r.reaction, r.created_at AS ts, (a.type = 'update') AS on_update
            FROM activity_reactions r JOIN activities a ON a.id = r.activity_id WHERE r.created_at > $1 ORDER BY r.created_at LIMIT 4000`,
    map: (r, ctx) => ({ userId: r.user_id, pactId: r.pact_id, key: `ar:${rowKey(ctx.config, 'r', `${r.activity_id}:${r.user_id}:${r.reaction}`)}`, props: { reaction: r.reaction, on: r.on_update ? 'update' : 'system' } }),
  },
  {
    name: 'memory_added',
    sql: `SELECT pact_id, MIN(ts) AS ts, BOOL_OR(photo) AS has_photo FROM (
            SELECT pact_id, updated_at AS ts, false AS photo FROM pact_memories
            UNION ALL SELECT pact_id, created_at, true FROM memory_photos) x
           GROUP BY pact_id HAVING MIN(ts) > $1 ORDER BY MIN(ts) LIMIT 2000`,
    map: (r, ctx) => ({ pactId: r.pact_id, key: `m:${pactPseudo(ctx.config, r.pact_id)}`, props: { has_photo: r.has_photo } }),
  },
];

/** Brings product_events up to date. Safe to run as often as you like, from any number of instances. Returns how many events it looked at. */
export async function syncProductEvents(ctx: Ctx): Promise<number> {
  let added = 0;
  for (const src of sources) {
    const mark = await ctx.db.query<{ t: Date | null }>('SELECT MAX(occurred_at) AS t FROM product_events WHERE name = $1', [src.name]);
    // A little overlap: rows written just before the last event but committed after it are caught, and keys stop duplicates.
    const from = mark.rows[0]?.t ? new Date(new Date(mark.rows[0].t).getTime() - 60 * 60 * 1000) : new Date(0);
    const rows = await ctx.db.query<Record<string, any>>(src.sql, [from]);
    for (const r of rows.rows) {
      const m = src.map(r, ctx);
      const before = added;
      await track(ctx.db, ctx.config, src.name, { userId: m.userId, pactId: m.pactId, key: m.key, props: m.props, at: new Date(r.ts) });
      added = before + 1;
    }
  }
  return added;
}

/**
 * Events the app sends about the first-time experience. Only a name and a few fixed choices are accepted, and each is
 * recorded once per person (per demo or intent where that is the point), so a refresh or a replay counts nothing twice.
 */
export async function recordClientEvent(ctx: Ctx, userId: string, input: { name: ClientEventName; props?: Record<string, unknown> }) {
  const who = personId(ctx.config, userId);
  const p = input.props ?? {};
  // Installing, sharing a link and opening the create sheet can all happen again, so these count once per person per day rather than once ever.
  const day = new Date().toISOString().slice(0, 10);
  const suffix = input.name === 'pwa_install_started' || input.name === 'pwa_install_completed' || input.name === 'circle_invite_shared' || input.name === 'universal_create_opened' ? `:${day}` : input.name.startsWith('home_') || input.name === 'circle_opened_from_home' || input.name === 'coming_up_opened' || input.name === 'recent_activity_opened' || input.name === 'recap_shared' ? `:${day}:${String(p.object_type ?? '')}:${String(p.section ?? '')}` : input.name === 'onboarding_intent_selected' ? `:${String(p.intent)}` : input.name === 'demo_pact_opened' || input.name === 'demo_pact_completed_view' ? `:${String(p.demo)}` : '';
  await track(ctx.db, ctx.config, input.name, { userId, key: `cl:${input.name}:${who}${suffix}`, props: p });
}

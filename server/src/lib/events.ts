import type { Config } from '../config.js';
import type { Queryable } from '../db/index.js';
import { keyedHash } from './crypto.js';

/**
 * First-party product events for the closed beta. Deliberately small:
 * - thirteen named events, nothing else is accepted;
 * - people and Pacts are keyed-hash pseudonyms, never ids, numbers or names;
 * - each event keeps a few coarse props from a fixed allow-list. Anything else is dropped, so a
 *   careless caller can't leak a PIN, an account number, a message or an amount by accident.
 * Events are recorded by the server after the thing actually happened.
 */
export const EVENT_NAMES = [
  'pact_created',
  'invite_created',
  'invite_previewed',
  'signup_completed',
  'pact_joined',
  'participation_selected',
  'contribution_completed',
  'task_claimed',
  'task_completed',
  'pact_funded',
  'pact_completed',
  'memory_added',
  'second_pact_created',
  'pact_execution_started',
  'pact_payment_completed',
  'pact_outcome_completed',
  'pact_update_posted',
  'activity_commented',
  'activity_reacted',
  'activity_pinned',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

type Rule = 'bool' | 'count' | readonly string[];
const CATEGORY = ['birthday', 'dinner', 'gift', 'trip', 'event', 'household', 'wedding', 'fund', 'other'] as const;
const PARTICIPATION = ['money', 'task', 'both', 'later'] as const;

/** What each event may carry. */
export const EVENT_PROPS: Record<EventName, Record<string, Rule>> = {
  pact_created: { category: CATEGORY, mode: ['target', 'budget', 'orders'], tasks: 'count', invites: 'count', split_mode: ['flexible', 'equal'], missed_goal: ['refund', 'release'], was_participant: 'bool' },
  invite_created: { via: ['member', 'phone'], count: 'count', at: ['create', 'later'] },
  invite_previewed: { status: ['open', 'funded', 'closed'], has_pay_account: 'bool' },
  signup_completed: { referred: 'bool', had_invite: 'bool' },
  pact_joined: { via: ['link', 'invite'], participation: [...PARTICIPATION, 'none'] },
  participation_selected: { participation: PARTICIPATION, at: ['join', 'later'] },
  contribution_completed: { amount_band: ['under_5k', 'under_25k', 'under_100k', 'over_100k'], guest: 'bool', first_for_person: 'bool' },
  task_claimed: { self: 'bool' },
  task_completed: { by_assignee: 'bool' },
  pact_funded: { mode: ['target', 'budget', 'orders'], days_to_fund: 'count' },
  pact_completed: { days_since_funded: 'count' },
  memory_added: { has_photo: 'bool' },
  second_pact_created: {},
  // The money was put to work: the first vendor payment was asked for.
  pact_execution_started: { days_since_funded: 'count', with_budget_line: 'bool' },
  // A payment from the Pact reached its recipient. Bands, never exact amounts or who was paid.
  pact_payment_completed: { amount_band: ['under_5k', 'under_25k', 'under_100k', 'over_100k'], with_budget_line: 'bool', needed_approval: 'bool' },
  // The organiser said the plan happened. `tasks_done_pct_band` is how much of the task list was done.
  // Conversation attached to activity. Never the text, only its shape.
  pact_update_posted: { length: ['short', 'medium', 'long'] },
  activity_commented: { on: ['update', 'system'], first_on_item: 'bool' },
  activity_reacted: { reaction: ['thumbs_up', 'heart', 'celebrate', 'raised_hands'], on: ['update', 'system'] },
  activity_pinned: { kind: ['update', 'system'] },
  pact_outcome_completed: { days_since_funded: 'count', paid_lines: 'count', tasks_done_band: ['none', 'some', 'most', 'all', 'no_tasks'], released_remaining: 'bool' },
};

export const amountBand = (naira: number) => (naira < 5_000 ? 'under_5k' : naira < 25_000 ? 'under_25k' : naira < 100_000 ? 'under_100k' : 'over_100k');

const pseudo = (cfg: Pick<Config, 'HASH_SECRET'>, kind: 'u' | 'p' | 'v', id: string) => keyedHash(cfg.HASH_SECRET, `events:${kind}:${id}`).slice(0, 22);
/** A stable, non-reversible key for any row id. */
export const rowKey = (cfg: Pick<Config, 'HASH_SECRET'>, kind: string, id: string) => keyedHash(cfg.HASH_SECRET, `events:r:${kind}:${id}`).slice(0, 22);
export const personId = (cfg: Pick<Config, 'HASH_SECRET'>, userId: string) => pseudo(cfg, 'u', userId);
export const pactId = (cfg: Pick<Config, 'HASH_SECRET'>, id: string) => pseudo(cfg, 'p', id);
/** A visitor with no account: a pseudonym that changes every day, from the connection details, which are never stored. */
export const visitorId = (cfg: Pick<Config, 'HASH_SECRET'>, ip: string | null, userAgent: string | null, day: string) => pseudo(cfg, 'v', `${day}:${ip ?? ''}:${userAgent ?? ''}`);

function clean(name: EventName, props: Record<string, unknown> = {}) {
  const rules = EVENT_PROPS[name];
  const out: Record<string, boolean | number | string> = {};
  for (const [k, rule] of Object.entries(rules)) {
    const v = props[k];
    if (v === undefined || v === null) continue;
    if (rule === 'bool' && typeof v === 'boolean') out[k] = v;
    else if (rule === 'count' && typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.min(10_000, Math.round(v)));
    else if (Array.isArray(rule) && typeof v === 'string' && rule.includes(v)) out[k] = v;
  }
  return out;
}

export interface TrackOptions {
  /** The person's real id: stored only as a pseudonym. */
  userId?: string | null;
  /** The Pact's real id: stored only as a pseudonym. */
  pactId?: string | null;
  /** A ready-made pseudonym (visitors). */
  actor?: string | null;
  props?: Record<string, unknown>;
  at?: Date;
  /** Makes the event idempotent: the same key is only ever recorded once. Built from pseudonyms, never raw ids. */
  key?: string;
}

/**
 * Records one event. Never throws: analytics must not be able to break a payment or a join.
 * Inside a transaction (`inTx`) it runs under a savepoint, so a failed insert can't poison the surrounding work.
 */
export async function track(q: Queryable, cfg: Pick<Config, 'HASH_SECRET'>, name: EventName, o: TrackOptions = {}, inTx = false): Promise<void> {
  try {
    const actor = o.actor ?? (o.userId ? personId(cfg, o.userId) : null);
    const pact = o.pactId ? pactId(cfg, o.pactId) : null;
    if (inTx) await q.query('SAVEPOINT product_event');
    try {
      await q.query(
        `INSERT INTO product_events (name, occurred_at, actor, pact, props, once_key) VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT DO NOTHING`,
        [name, o.at ?? new Date(), actor, pact, JSON.stringify(clean(name, o.props)), o.key ?? null],
      );
      if (inTx) await q.query('RELEASE SAVEPOINT product_event');
    } catch (err) {
      if (inTx) await q.query('ROLLBACK TO SAVEPOINT product_event').catch(() => undefined);
      throw err;
    }
  } catch {
    /* analytics is best effort */
  }
}

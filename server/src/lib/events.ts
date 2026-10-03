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
  'onboarding_started',
  'onboarding_completed',
  'onboarding_intent_selected',
  'demo_pact_opened',
  'demo_pact_completed_view',
  'first_pact_started',
  'first_pact_created',
  'first_invite_created',
  'first_pact_joined',
  'pwa_install_started',
  'pwa_install_completed',
  'circle_created',
  'circle_joined',
  'circle_invite_created',
  'circle_invite_opened',
  'circle_invite_shared',
  'universal_create_opened',
  'ask_created',
  'ask_shared',
  'ask_opened',
  'ask_response_started',
  'ask_responded',
  'ask_changed_response',
  'ask_closed',
  'ask_shared_link_opened',
  'ask_public_response_selected',
  'ask_auth_started_from_share',
  'ask_auth_completed_from_share',
  'ask_response_completed_from_share',
  'circle_join_prompt_shown',
  'circle_joined_from_ask',
  'ask_reshared',
  'plan_created',
  'plan_opened',
  'plan_shared',
  'plan_rsvp_submitted',
  'plan_rsvp_changed',
  'plan_task_created',
  'plan_task_completed',
  'plan_ask_linked',
  'plan_confirmed',
  'plan_conversion_started',
  'plan_converted_to_pact',
  'split_created',
  'split_opened',
  'split_shared',
  'split_share_opened',
  'split_settlement_marked',
  'split_settlement_undone',
  'split_completed',
  'split_cancelled',
  'circle_joined_from_split',
] as const;

/** The events the app itself sends (what someone looked at or chose). The rest are worked out from server records. */
export const CLIENT_EVENTS = ['onboarding_started', 'onboarding_completed', 'onboarding_intent_selected', 'demo_pact_opened', 'demo_pact_completed_view', 'first_pact_started', 'pwa_install_started', 'pwa_install_completed', 'circle_invite_shared', 'universal_create_opened'] as const;
export type ClientEventName = (typeof CLIENT_EVENTS)[number];
export type EventName = (typeof EVENT_NAMES)[number];

type Rule = 'bool' | 'count' | readonly string[];
const CATEGORY = ['birthday', 'dinner', 'gift', 'trip', 'event', 'household', 'wedding', 'fund', 'other'] as const;
const DEMOS = ['sarahs_birthday', 'december_trip', 'graduation_gift'] as const;
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
  // Onboarding and the first-Pact funnel. Choices from a fixed list; never a name, a title or anything typed.
  onboarding_started: {},
  onboarding_completed: { how: ['finished', 'skipped'] },
  onboarding_intent_selected: { intent: ['start', 'join', 'explore'] },
  demo_pact_opened: { demo: DEMOS, from: ['onboarding', 'home'] },
  demo_pact_completed_view: { demo: DEMOS },
  first_pact_started: { from: ['onboarding', 'home'] },
  first_pact_created: { category: CATEGORY },
  first_invite_created: { via: ['member', 'phone'] },
  first_pact_joined: { via: ['link', 'invite'] },
  // Someone asked the browser to install PACT, and it finished. Signed-in people only; no props.
  pwa_install_started: {},
  pwa_install_completed: {},
  // Circles. Coarse choices only: never a Circle's name or emoji, an invite link or anything typed.
  circle_created: {},
  circle_joined: { via: ['link'], from_ask: 'bool' },
  circle_invite_created: { role: ['owner', 'member'] },
  circle_invite_opened: { state: ['valid', 'revoked', 'expired'] },
  circle_invite_shared: { via: ['native', 'copy'] },
  universal_create_opened: { from: ['nav', 'circle', 'home'] },
  // Ask the group. The Ask's own pseudonym (the `ask` column) ties one question's whole path together. Never a title, an option or a link.
  ask_created: { type: ['choice', 'attendance'], option_count: 'count', from: ['circle', 'home', 'nav'] },
  ask_shared: { type: ['choice', 'attendance'], via: ['native', 'copy'] },
  ask_opened: { type: ['choice', 'attendance'], from: ['circle', 'home', 'share'], state: ['open', 'closed'] },
  ask_response_started: { type: ['choice', 'attendance'] },
  ask_responded: { type: ['choice', 'attendance'], member: 'bool' },
  ask_changed_response: { type: ['choice', 'attendance'] },
  ask_closed: { type: ['choice', 'attendance'], responses: 'count' },
  // The shared-link funnel, in order. `from` is read from the visitor's browser (WhatsApp's in-app browser says so); never a link or a name.
  ask_shared_link_opened: { type: ['choice', 'attendance'], auth_state: ['signed_in', 'signed_out'], from: ['whatsapp', 'share', 'unknown'], state: ['open', 'closed'] },
  ask_public_response_selected: { type: ['choice', 'attendance'], auth_state: ['signed_in', 'signed_out'] },
  ask_auth_started_from_share: { type: ['choice', 'attendance'] },
  ask_auth_completed_from_share: { type: ['choice', 'attendance'] },
  ask_response_completed_from_share: { type: ['choice', 'attendance'], member: 'bool', after_auth: 'bool' },
  circle_join_prompt_shown: { type: ['choice', 'attendance'], auth_state: ['signed_in', 'signed_out'] },
  circle_joined_from_ask: { type: ['choice', 'attendance'] },
  ask_reshared: { type: ['choice', 'attendance'], via: ['native', 'copy'] },
  // Plans. The Plan's own pseudonym (the `plan` column) ties its whole path together. Never a title, a place, a task or an amount.
  plan_created: { category: ['birthday', 'trip', 'wedding', 'gift', 'event', 'dinner', 'household', 'fund', 'other'], has_date: 'bool', has_location: 'bool', has_budget: 'bool' },
  plan_opened: { from: ['circle', 'home', 'share'], status: ['planning', 'confirmed', 'done', 'cancelled'] },
  plan_shared: { via: ['native', 'copy'] },
  plan_rsvp_submitted: { status: ['in', 'maybe', 'out'], member: 'bool', after_auth: 'bool' },
  plan_rsvp_changed: { status: ['in', 'maybe', 'out'] },
  plan_task_created: { assigned: 'bool' },
  plan_task_completed: { by_assignee: 'bool' },
  plan_ask_linked: { via: ['create', 'link'] },
  plan_confirmed: { in_count: 'count' },
  plan_conversion_started: {},
  plan_converted_to_pact: { tasks: 'count', invitees: 'count', has_budget: 'bool' },
  // Split an expense. The Split's own pseudonym (the `split` column) ties its whole path together. Never a title, a name, an amount or a link.
  split_created: { split_mode: ['equal', 'custom'], participant_count_band: ['2', '3_4', '5_8', '9_plus'], from: ['circle', 'home', 'nav'] },
  split_opened: { from: ['circle', 'home', 'share'], state: ['open', 'settled', 'cancelled'] },
  split_shared: { via: ['native', 'copy'] },
  split_share_opened: { auth_state: ['signed_in', 'signed_out'], state: ['open', 'settled', 'cancelled'] },
  split_settlement_marked: { by: ['self', 'organiser'], after_auth: 'bool' },
  split_settlement_undone: { by: ['self', 'organiser'] },
  split_completed: { participant_count_band: ['2', '3_4', '5_8', '9_plus'] },
  split_cancelled: { had_settlements: 'bool' },
  circle_joined_from_split: {},
  pact_outcome_completed: { days_since_funded: 'count', paid_lines: 'count', tasks_done_band: ['none', 'some', 'most', 'all', 'no_tasks'], released_remaining: 'bool' },
};

export const amountBand = (naira: number) => (naira < 5_000 ? 'under_5k' : naira < 25_000 ? 'under_25k' : naira < 100_000 ? 'under_100k' : 'over_100k');

const pseudo = (cfg: Pick<Config, 'HASH_SECRET'>, kind: 'u' | 'p' | 'v', id: string) => keyedHash(cfg.HASH_SECRET, `events:${kind}:${id}`).slice(0, 22);
/** A stable, non-reversible key for any row id. */
export const rowKey = (cfg: Pick<Config, 'HASH_SECRET'>, kind: string, id: string) => keyedHash(cfg.HASH_SECRET, `events:r:${kind}:${id}`).slice(0, 22);
export const personId = (cfg: Pick<Config, 'HASH_SECRET'>, userId: string) => pseudo(cfg, 'u', userId);
export const pactId = (cfg: Pick<Config, 'HASH_SECRET'>, id: string) => pseudo(cfg, 'p', id);
export const planPseudo = (cfg: Pick<Config, 'HASH_SECRET'>, id: string) => keyedHash(cfg.HASH_SECRET, `events:l:${id}`).slice(0, 22);
export const splitPseudo = (cfg: Pick<Config, 'HASH_SECRET'>, id: string) => keyedHash(cfg.HASH_SECRET, `events:s:${id}`).slice(0, 22);
export const askPseudo = (cfg: Pick<Config, 'HASH_SECRET'>, id: string) => keyedHash(cfg.HASH_SECRET, `events:a:${id}`).slice(0, 22);
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
  /** The Ask's real id: stored only as a pseudonym, in its own column. */
  askId?: string | null;
  /** The Plan's real id: stored only as a pseudonym, in its own column. */
  planId?: string | null;
  /** The Split's real id: stored only as a pseudonym, in its own column. */
  splitId?: string | null;
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
    const ask = o.askId ? askPseudo(cfg, o.askId) : null;
    const plan = o.planId ? planPseudo(cfg, o.planId) : null;
    const split = o.splitId ? splitPseudo(cfg, o.splitId) : null;
    if (inTx) await q.query('SAVEPOINT product_event');
    try {
      await q.query(
        `INSERT INTO product_events (name, occurred_at, actor, pact, ask, plan, split, props, once_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) ON CONFLICT DO NOTHING`,
        [name, o.at ?? new Date(), actor, pact, ask, plan, split, JSON.stringify(clean(name, o.props)), o.key ?? null],
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

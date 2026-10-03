import type { Queryable } from '../db/index.js';
import type { NotificationMeta } from '../../../shared/contracts.js';
import { notificationLink } from '../../../shared/notificationLink.js';

export async function audit(
  q: Queryable,
  entry: { actorId?: string | null; action: string; targetType?: string; targetId?: string; ip?: string | null; metadata?: Record<string, unknown> },
) {
  await q.query('INSERT INTO audit_log (actor_id, action, target_type, target_id, ip, metadata) VALUES ($1, $2, $3, $4, $5, $6)', [
    entry.actorId ?? null,
    entry.action,
    entry.targetType ?? null,
    entry.targetId ?? null,
    entry.ip ?? null,
    JSON.stringify(entry.metadata ?? {}),
  ]);
}

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  pactId?: string | null;
  /** What the notification is about inside the Pact (an activity item, for threads). Never shown to people. */
  refId?: string | null;
  /** Safe facts for the detail view (who, how much, for what). Only the keys of NotificationMeta are kept. */
  meta?: NotificationMeta;
  /**
   * Also send a browser push, with this text. Push is deliberately rarer than in-app notifications and its text is
   * written separately: lock screens are public, so it never carries amounts, names of banks, or account details.
   */
  push?: string;
}

export async function notify(q: Queryable, userIds: string[], n: NotifyInput) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await q.query(
    `INSERT INTO notifications (user_id, type, title, body, pact_id, ref_id, meta)
     SELECT u, $2, $3, $4, $5, $6, $7::jsonb FROM unnest($1::uuid[]) AS u`,
    [unique, n.type, n.title, n.body, n.pactId ?? null, n.refId ?? null, JSON.stringify(cleanMeta(n.meta))],
  );
  if (n.push) await enqueuePush(q, unique, n);
}

const META_KEYS = ['actor', 'amount', 'purpose', 'payee', 'taskName', 'reason', 'about', 'preview', 'pinned'] as const;

/** Keeps only the known, short, plain values: nothing else can ride along into the database. */
export function cleanMeta(meta?: NotificationMeta): NotificationMeta {
  const out: Record<string, string | number | boolean> = {};
  for (const k of META_KEYS) {
    const v = meta?.[k];
    if (typeof v === 'string' && v) out[k] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v);
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** Push delivery runs from the outbox, so a slow or failing push service never blocks (or rolls back) the real action. */
async function enqueuePush(q: Queryable, userIds: string[], n: Pick<NotifyInput, 'type' | 'pactId' | 'refId' | 'push'>) {
  await enqueue(q, 'push.send', { userIds, body: n.push, url: notificationLink(n) });
}

/**
 * Something that can happen many times in a row (comments on a thread, contributions to a Pact) becomes one
 * notification per person while it is unread: it moves to the top and its count grows, and the push (if any) goes
 * out only for the first. `many` words the grouped version, e.g. "3 new contributions".
 */
export async function notifyGrouped(
  q: Queryable,
  userIds: string[],
  n: {
    type: string;
    pactId: string | null;
    refId: string;
    first: { title: string; body: string };
    meta?: NotificationMeta;
    many: (count: number) => { title: string; body: string };
    push?: string;
  },
) {
  for (const userId of [...new Set(userIds)]) {
    const existing = await q.query<{ id: string; merged_count: number }>(
      `SELECT id, merged_count FROM notifications WHERE user_id = $1 AND type = $2 AND ref_id = $3 AND read_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [userId, n.type, n.refId],
    );
    const row = existing.rows[0];
    if (row) {
      const count = row.merged_count + 1;
      const w = n.many(count);
      await q.query('UPDATE notifications SET title = $2, body = $3, merged_count = $4, created_at = now() WHERE id = $1', [row.id, w.title, w.body, count]);
      continue;
    }
    await q.query('INSERT INTO notifications (user_id, type, title, body, pact_id, ref_id, meta) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)', [userId, n.type, n.first.title, n.first.body, n.pactId, n.refId, JSON.stringify(cleanMeta(n.meta))]);
    if (n.push) await enqueuePush(q, [userId], { type: n.type, pactId: n.pactId, refId: n.refId, push: n.push });
  }
}

export async function recordActivity(q: Queryable, a: { pactId: string; actorId: string | null; type: string; amount?: number | null; detail?: string | null }) {
  await q.query('INSERT INTO activities (pact_id, actor_id, type, amount, detail) VALUES ($1, $2, $3, $4, $5)', [
    a.pactId,
    a.actorId,
    a.type,
    a.amount ?? null,
    a.detail?.slice(0, 120) ?? null,
  ]);
}

/**
 * Adds a job to the outbox. Called inside the same transaction as the change that
 * caused it, so the job exists if and only if the change committed.
 */
export async function enqueue(
  q: Queryable,
  type: string,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
) {
  await q.query(
    `INSERT INTO jobs (type, payload, run_at, dedupe_key, max_attempts) VALUES ($1, $2, COALESCE($3, now()), $4, $5)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [type, JSON.stringify(payload), opts.runAt ?? null, opts.dedupeKey ?? null, opts.maxAttempts ?? 8],
  );
}

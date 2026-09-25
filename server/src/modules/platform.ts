import type { Queryable } from '../db/index.js';

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

export async function notify(
  q: Queryable,
  userIds: string[],
  n: { type: string; title: string; body: string; pactId?: string | null },
) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await q.query(
    `INSERT INTO notifications (user_id, type, title, body, pact_id)
     SELECT u, $2, $3, $4, $5 FROM unnest($1::uuid[]) AS u`,
    [unique, n.type, n.title, n.body, n.pactId ?? null],
  );
  // Push delivery (APNs / FCM) runs from the outbox so a slow push service never blocks a payment.
  await enqueue(q, 'push.send', { userIds: unique, title: n.title, body: n.body, pactId: n.pactId ?? null });
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

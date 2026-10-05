import type { Ctx } from '../context.js';
import { reconcile } from '../modules/ledger.js';
import { sweepDeadlines } from '../modules/pacts.js';
import { processPactPayout } from '../modules/pactMoney.js';
import { sweepPledges } from '../modules/pledges.js';
import { processPayout, reconcileTopupByRef } from '../modules/wallet.js';
import { handleWebhook } from '../modules/webhooks.js';
import { syncProductEvents } from '../modules/events.js';
import { enqueue } from '../modules/platform.js';
import { sendPush } from '../modules/push.js';

interface Job {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

type Handler = (ctx: Ctx, payload: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  'payout.process': (ctx, p) => processPayout(ctx, String(p.reference)),
  'topup.reconcile': (ctx, p) => reconcileTopupByRef(ctx, String(p.reference)),
  'pact_payout.process': (ctx, p) => processPactPayout(ctx, String(p.reference)),
  'pact_account.close': (ctx, p) => ctx.provider.closePactAccount(String(p.providerRef)),
  'pacts.sweep': async (ctx) => {
    // Replaced refresh tokens are only needed for the grace window and reuse detection.
    await ctx.db.query(`DELETE FROM refresh_tokens WHERE superseded_at < now() - interval '2 days'`);
    await ctx.db.query(`DELETE FROM otp_challenges WHERE created_at < now() - interval '2 days'`);
    await ctx.db.query(`DELETE FROM http_rate_limits WHERE expires_at < now()`);
    await ctx.db.query(`DELETE FROM push_subscriptions WHERE disabled_at < now() - interval '30 days'`);
    await ctx.db.query(`DELETE FROM product_events WHERE occurred_at < now() - interval '18 months'`);
    await sweepPledges(ctx);
    return sweepDeadlines(ctx);
  },
  'events.sync': (ctx) => syncProductEvents(ctx),
  'ledger.reconcile': async (ctx) => {
    const r = await reconcile(ctx.db);
    if (!r.ok) ctx.log.fatal({ drift: r.drift, total: r.total }, 'LEDGER DRIFT DETECTED');
    return r;
  },
  // Browser Web Push, best-effort: sendPush never throws, so a failing push service can't make this job retry forever.
  'push.send': (ctx, p) => sendPush(ctx, p.userIds as string[], { body: String(p.body ?? ''), url: typeof p.url === 'string' ? p.url : null }),
  'sms.invite': async (ctx, p) => {
    // Texts are switched off: the invite itself is kept, only the message is skipped (a thrown error would retry it forever).
    if (!ctx.config.phoneAuthEnabled) return;
    await ctx.sms.send(String(p.phone), `${p.inviter} invited you to a Pact on PACT. Get the app to join: ${ctx.config.APP_ORIGIN}/download`);
  },
  'ops.alert': async (ctx, p) => {
    ctx.log.error({ alert: p }, 'OPS ALERT');
  },
  'sandbox.transfer_webhook': async (ctx, p) => {
    if (ctx.provider.name !== 'sandbox') return;
    const body = JSON.stringify({ event: p.event, data: { reference: p.reference, amount: p.amount, id: `${Date.now()}` } });
    const sign = (ctx.provider as unknown as { sign(b: string): string }).sign;
    await handleWebhook(ctx, body, { 'x-paystack-signature': sign(body) });
  },
};

/** Claims due jobs with SKIP LOCKED, so any number of workers can drain the queue safely. */
export async function runDueJobs(ctx: Ctx, limit = 10): Promise<number> {
  const claimed = await ctx.db.query<Job>(
    `UPDATE jobs SET locked_until = now() + interval '2 minutes', attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM jobs
         WHERE done_at IS NULL AND run_at <= now() AND attempts < max_attempts
           AND (locked_until IS NULL OR locked_until < now())
         ORDER BY run_at LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING id, type, payload, attempts, max_attempts`,
    [limit],
  );
  for (const job of claimed.rows) {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for ${job.type}`);
      await handler(ctx, job.payload);
      await ctx.db.query('UPDATE jobs SET done_at = now(), last_error = NULL WHERE id = $1', [job.id]);
    } catch (err) {
      const backoffSec = Math.min(3600, 5 * 2 ** job.attempts);
      ctx.log.warn({ err, job: job.type, attempt: job.attempts }, 'job failed');
      await ctx.db.query(`UPDATE jobs SET last_error = $2, locked_until = NULL, run_at = now() + make_interval(secs => $3) WHERE id = $1`, [
        job.id,
        String((err as Error).message).slice(0, 500),
        backoffSec,
      ]);
      if (job.attempts >= job.max_attempts) await enqueue(ctx.db, 'ops.alert', { kind: 'job_dead', jobId: job.id, type: job.type });
    }
  }
  return claimed.rows.length;
}

/** Schedules recurring work. Dedupe keys make this safe to call from every instance. */
async function scheduleRecurring(ctx: Ctx) {
  const hour = ctx.now().toISOString().slice(0, 13);
  await enqueue(ctx.db, 'pacts.sweep', {}, { dedupeKey: `sweep:${hour}` });
  await enqueue(ctx.db, 'ledger.reconcile', {}, { dedupeKey: `reconcile:${hour}` });
  // Product events catch up every ten minutes.
  await enqueue(ctx.db, 'events.sync', {}, { dedupeKey: `events:${ctx.now().toISOString().slice(0, 15)}` });
}

export function startWorker(ctx: Ctx, intervalMs = 1000) {
  let stopped = false;
  let timer: NodeJS.Timeout;
  const tick = async () => {
    if (stopped) return;
    try {
      await scheduleRecurring(ctx);
      while (!stopped && (await runDueJobs(ctx)) > 0);
    } catch (err) {
      ctx.log.error({ err }, 'worker tick failed');
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

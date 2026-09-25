import type { Ctx } from '../context.js';
import { audit } from './platform.js';
import { failTopup, reverseWithdrawal, completeWithdrawal, settleTopup } from './wallet.js';

/**
 * Verified, deduplicated processing of processor events. The raw event is stored
 * first; a redelivery of an event we already processed is acknowledged and ignored.
 */
export async function handleWebhook(ctx: Ctx, rawBody: string, headers: Record<string, string | string[] | undefined>) {
  if (!ctx.provider.verifyWebhookSignature(rawBody, headers)) {
    await audit(ctx.db, { action: 'webhook.bad_signature', metadata: { provider: ctx.provider.name, bytes: rawBody.length } });
    return { status: 401 as const, body: { ok: false } };
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400 as const, body: { ok: false } };
  }
  const event = ctx.provider.parseWebhook(body);
  if (!event) return { status: 200 as const, body: { ok: true, ignored: true } };

  const stored = await ctx.db.query<{ id: string; processed_at: Date | null }>(
    `INSERT INTO webhook_events (provider, event_key, event_type, payload) VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, event_key) DO UPDATE SET received_at = webhook_events.received_at
     RETURNING id, processed_at`,
    [ctx.provider.name, event.eventKey, event.type, rawBody],
  );
  const row = stored.rows[0];
  if (row.processed_at) return { status: 200 as const, body: { ok: true, duplicate: true } };

  try {
    switch (event.type) {
      case 'charge.success':
        // Only naira is accepted; anything else is never credited.
        if (event.currency && event.currency !== 'NGN') await failTopup(ctx, event.reference, 'currency_mismatch');
        else await settleTopup(ctx, event.reference, event.amount, 'webhook');
        break;
      case 'charge.failed':
        await failTopup(ctx, event.reference, event.reason);
        break;
      case 'transfer.success':
        await completeWithdrawal(ctx, event.reference);
        break;
      case 'transfer.failed':
      case 'transfer.reversed':
        await reverseWithdrawal(ctx, event.reference, event.reason ?? 'The bank returned the transfer');
        break;
      default:
        break;
    }
    await ctx.db.query('UPDATE webhook_events SET processed_at = now(), error = NULL WHERE id = $1', [row.id]);
    return { status: 200 as const, body: { ok: true } };
  } catch (err) {
    await ctx.db.query('UPDATE webhook_events SET error = $2 WHERE id = $1', [row.id, String((err as Error).message).slice(0, 500)]);
    ctx.log.error({ err, event: event.eventKey }, 'webhook processing failed');
    // A 5xx makes the processor retry later.
    return { status: 500 as const, body: { ok: false } };
  }
}

import webpush from 'web-push';
import type { Config } from '../config.js';
import type { Ctx } from '../context.js';
import { badRequest } from '../lib/errors.js';

/**
 * Browser Web Push (standard Push API + VAPID). Best-effort by design: nothing here is ever awaited by the
 * action that caused a notification. It runs from the outbox job `push.send`, and a failure is logged and
 * forgotten, never thrown into a payment or a join.
 */

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Swappable so tests can see what would be sent and simulate a push service answering 410 Gone. */
export interface PushSender {
  send(target: PushTarget, payload: string): Promise<void>;
}

export function createPushSender(config: Config): PushSender | null {
  const vapid = config.push;
  if (!vapid) return null;
  return {
    async send(t, payload) {
      await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, {
        vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        TTL: 60 * 60 * 24,
        urgency: 'normal',
        timeout: 8_000,
      });
    },
  };
}

/** What the public config tells the browser: whether to offer push at all, and the key it subscribes with. */
export const pushPublicConfig = (config: Config) => ({ enabled: !!config.push, publicKey: config.push?.publicKey ?? null });

/**
 * A subscription endpoint is a URL this server will POST to, so it must be one of the real browser push services.
 * Without this, anyone signed in could point the server at an address of their choosing.
 */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com'];
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];

export function isPushEndpoint(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

const MAX_PER_PERSON = 8;

export async function saveSubscription(ctx: Ctx, userId: string, input: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  if (!ctx.push) throw badRequest('push_unavailable', 'Notifications from your browser aren’t available right now.');
  if (!isPushEndpoint(input.endpoint)) throw badRequest('invalid_subscription', 'That browser can’t receive PACT notifications.');
  await ctx.db.tx(async (q) => {
    // The same browser re-subscribing (or signing in as someone else) takes the subscription over.
    await q.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, disabled_at = NULL, created_at = now()`,
      [userId, input.endpoint, input.keys.p256dh, input.keys.auth],
    );
    // A person has a handful of browsers, not hundreds: keep the newest.
    await q.query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND id NOT IN (SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${MAX_PER_PERSON})`,
      [userId],
    );
  });
}

/** Turning notifications off, or signing out of this browser. Only ever touches the caller's own subscription. */
export async function removeSubscription(ctx: Ctx, userId: string, endpoint: string) {
  await ctx.db.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
}

export interface PushMessage {
  body: string;
  /** An in-app path (`/app/...`). Anything else is dropped, so a push can only open PACT. */
  url: string | null;
}

/** Sends to every active browser of these people. Never throws. */
export async function sendPush(ctx: Ctx, userIds: string[], msg: PushMessage) {
  if (!ctx.push || !userIds.length) return { sent: 0, disabled: 0 };
  const url = msg.url && /^\/app(\/|$)/.test(msg.url) ? msg.url : '/app/notifications';
  const payload = JSON.stringify({ title: 'PACT', body: msg.body.slice(0, 140), url });
  const subs = await ctx.db.query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[]) AND disabled_at IS NULL',
    [userIds],
  );
  let sent = 0;
  let disabled = 0;
  await Promise.all(
    subs.rows.map(async (s) => {
      try {
        await ctx.push!.send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload);
        sent++;
        await ctx.db.query('UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1', [s.id]);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The browser or the person revoked it: stop sending, and let the sweep remove it.
          disabled++;
          await ctx.db.query('UPDATE push_subscriptions SET disabled_at = now() WHERE id = $1', [s.id]).catch(() => undefined);
        } else {
          ctx.log.warn({ status }, 'web push delivery failed');
        }
      }
    }),
  );
  return { sent, disabled };
}

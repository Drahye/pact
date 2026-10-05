/**
 * What this browser's notification state really is, and how to repair it. Pure: everything it touches comes in through `PushEnv`, so the
 * rules can be tested without a browser. The truth is three things that can each disagree: the browser's permission, the browser's own
 * push subscription, and the server's record of that subscription for this person. A local flag is never the truth; it only records that
 * this person once turned notifications on here, which is what allows a quiet repair (re-subscribing) without asking again.
 */

export type PushState =
  | 'unsupported' // this browser can't do it (or is not on a secure page)
  | 'unavailable' // the server has no keys configured
  | 'blocked' // the person said no in the browser; only they can undo that
  | 'off' // possible, not turned on in this browser
  | 'on' // permission granted, a live subscription, and the server has it for this person
  | 'error'; // permission granted but a working subscription could not be established (after one repair attempt)

export type ServerStatus = 'active' | 'disabled' | 'none';

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** The VAPID key it was created with, when the browser says. */
  applicationServerKey: Uint8Array | null;
  unsubscribe(): Promise<unknown>;
}

export interface PushEnv {
  supported(): boolean;
  permission(): 'default' | 'granted' | 'denied';
  requestPermission(): Promise<'default' | 'granted' | 'denied'>;
  /** The browser's current subscription. With `register`, a missing service worker is registered first; without it nothing is installed. */
  getSubscription(register: boolean): Promise<PushSub | null>;
  subscribe(applicationServerKey: Uint8Array): Promise<PushSub>;
  serverStatus(endpoint: string): Promise<ServerStatus>;
  serverSave(sub: PushSub): Promise<void>;
  /** "This person turned notifications on in this browser." A hint that permits quiet repair; never proof that push works. */
  optedIn(): boolean;
  markOptedIn(): void;
}

export interface Diagnostics {
  permission: 'default' | 'granted' | 'denied' | 'unsupported';
  serviceWorkerRegistered: boolean;
  serviceWorkerActive: boolean;
  pushSubscription: boolean;
  serverSubscription: boolean | null; // null: could not ask
  vapidKey: boolean;
}

export function keyBytes(base64Url: string) {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const sameKey = (a: Uint8Array | null, b: Uint8Array) => !a || (a.length === b.length && a.every((v, i) => v === b[i]));

/**
 * Makes sure there is a live subscription that the server holds for this person: reuses the browser's own when it is the right one and
 * known to the server, otherwise saves it, or replaces it when the server says the push service dropped it or it was made with another key.
 * Throws if it cannot.
 */
async function establish(env: PushEnv, publicKey: string): Promise<void> {
  const key = keyBytes(publicKey);
  let sub = await env.getSubscription(true);
  if (sub && sameKey(sub.applicationServerKey, key)) {
    const status = await env.serverStatus(sub.endpoint).catch(() => 'none' as const);
    if (status === 'active') return;
    if (status === 'none') {
      await env.serverSave(sub);
      return;
    }
  }
  // Missing, made with a different key, or dead at the push service: a fresh one.
  if (sub) await sub.unsubscribe().catch(() => undefined);
  sub = await env.subscribe(key);
  await env.serverSave(sub);
}

/** The person chose to turn notifications on. The only place that asks the browser for permission. */
export async function enable(env: PushEnv, publicKey: string): Promise<PushState> {
  if (!env.supported()) return 'unsupported';
  if (!publicKey) return 'unavailable';
  if (env.permission() === 'denied') return 'blocked'; // asking again would only be refused silently
  const permission = env.permission() === 'granted' ? 'granted' : await env.requestPermission();
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'off'; // dismissed: stay off, ask nothing more
  try {
    await establish(env, publicKey);
  } catch {
    return 'error';
  }
  env.markOptedIn();
  return 'on';
}

/**
 * What is true right now, repairing it when someone who turned notifications on has lost the subscription (signed out and back in, a stale or
 * rotated subscription, a failed save). `allowRepair` is spent by the caller once per session, so a broken device ends in 'error', not a loop.
 */
export async function reconcile(env: PushEnv, input: { serverEnabled: boolean | undefined; publicKey: string | null; allowRepair: boolean }): Promise<PushState> {
  if (!env.supported()) return 'unsupported';
  if (!input.serverEnabled || !input.publicKey) return 'unavailable';
  const permission = env.permission();
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'off';

  const key = keyBytes(input.publicKey);
  const opted = env.optedIn();
  let sub: PushSub | null = null;
  try {
    sub = await env.getSubscription(opted);
  } catch {
    sub = null; // the service worker would not start: handled with the other broken cases below
  }
  if (sub && sameKey(sub.applicationServerKey, key)) {
    let status: ServerStatus | 'unknown';
    try {
      status = await env.serverStatus(sub.endpoint);
    } catch {
      status = 'unknown'; // offline or the server is down: nothing to repair from here, and nothing to scold about
    }
    if (status === 'active' || status === 'unknown') {
      if (status === 'active') env.markOptedIn();
      return 'on';
    }
    if (status === 'none' && !opted) return 'off'; // not this person's (or never saved): one tap turns it on, no browser question
  } else if (!opted) {
    return 'off';
  }
  if (!input.allowRepair) return 'error';
  try {
    await establish(env, input.publicKey);
  } catch {
    return 'error';
  }
  env.markOptedIn();
  return 'on';
}

import { api } from '../api/client';
import { enable, reconcile, type Diagnostics, type PushEnv, type PushState, type PushSub, type ServerStatus } from './pushSync';

/**
 * Browser Web Push, opt-in. The service worker is registered, and the browser's permission question asked, only when the person chooses
 * "Turn on" in a PACT prompt or in Settings. The rules for what state this browser is in, and how it is repaired, live in pushSync.ts.
 */

export type { PushState } from './pushSync';

export const pushSupported = () => typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const DISMISSED = 'pact.push.dismissed';

/** "Not now" is remembered on this device, so the prompt does not nag. */
export const promptDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED) !== null;
  } catch {
    return false;
  }
};
export const dismissPrompt = () => {
  try {
    localStorage.setItem(DISMISSED, String(Date.now()));
  } catch {
    /* without storage the prompt may show again, which is acceptable */
  }
};

const optInKey = (userId: string) => `pact.push.on.${userId}`;

const wrap = (s: PushSubscription): PushSub => {
  const json = s.toJSON();
  const k = s.options?.applicationServerKey;
  return {
    endpoint: s.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    applicationServerKey: k ? new Uint8Array(k as ArrayBuffer) : null,
    unsubscribe: () => s.unsubscribe(),
  };
};

const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

/** A ready, active registration (registering it first if allowed), or throws. */
async function activeRegistration(register: boolean) {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing && !register) return null;
  if (!existing) await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return withTimeout(navigator.serviceWorker.ready, 10_000);
}

/** The real browser, for one signed-in person. */
export function browserEnv(userId: string): PushEnv {
  return {
    supported: pushSupported,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    async getSubscription(register) {
      const reg = await activeRegistration(register);
      const s = await reg?.pushManager.getSubscription();
      return s ? wrap(s) : null;
    },
    async subscribe(key) {
      const reg = await activeRegistration(true);
      if (!reg) throw new Error('no service worker');
      return wrap(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource }));
    },
    serverStatus: async (endpoint) => (await api<{ status: ServerStatus }>('POST', '/push/status', { endpoint })).status,
    serverSave: async (sub) => {
      await api('POST', '/push/subscribe', { endpoint: sub.endpoint, keys: sub.keys });
    },
    optedIn: () => {
      try {
        return localStorage.getItem(optInKey(userId)) !== null;
      } catch {
        return false;
      }
    },
    markOptedIn: () => {
      try {
        localStorage.setItem(optInKey(userId), String(Date.now()));
      } catch {
        /* without storage a repair would ask once more, which is acceptable */
      }
    },
  };
}

// A repair that failed is not tried again until the page reloads or the person taps Try again: a device that cannot be repaired ends in 'error',
// never in a loop. A repair that worked costs nothing, so signing out and back in within one page load is repaired every time. In flight is shared.
const repairFailed = new Set<string>();
const inFlight = new Map<string, Promise<PushState>>();

/** What this browser is doing right now, repairing it once if this person had turned notifications on and lost the subscription. */
export function currentState(userId: string, serverEnabled: boolean | undefined, publicKey: string | null): Promise<PushState> {
  const running = inFlight.get(userId);
  if (running) return running;
  const run = (async () => {
    const env = browserEnv(userId);
    const state = await reconcile(env, { serverEnabled, publicKey, allowRepair: !repairFailed.has(userId) }).catch((): PushState => 'error');
    if (state === 'error') repairFailed.add(userId);
    else repairFailed.delete(userId);
    if (import.meta.env.DEV) void pushDiagnostics(publicKey).then((d) => console.info('[push]', state, d));
    return state;
  })().finally(() => inFlight.delete(userId));
  inFlight.set(userId, run);
  return run;
}

/** Asks the browser for permission (this is the only place that does), subscribes, and tells the server. */
export async function enablePush(userId: string, publicKey: string): Promise<PushState> {
  const state = await enable(browserEnv(userId), publicKey).catch((): PushState => 'error');
  repairFailed.delete(userId);
  return state;
}

/** Turns notifications off for this browser: the server forgets it and the browser unsubscribes. */
export async function disablePush(userId: string): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  // A deliberate "off" must not be quietly repaired back on.
  try {
    localStorage.removeItem(optInKey(userId));
  } catch {
    /* ignore */
  }
  return Notification.permission === 'denied' ? 'blocked' : 'off';
}

/**
 * Signing out of PACT must also stop this browser receiving that person's notifications. Never blocks sign-out. The "turned on here" hint stays,
 * so the same person signing back in gets their subscription back without being asked again.
 */
export async function detachPush(): Promise<void> {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  } catch {
    /* sign-out always continues */
  }
}

/** Everything that decides whether push works, side by side. Development aid: shown in Settings and logged to the console in dev builds. */
export async function pushDiagnostics(publicKey: string | null): Promise<Diagnostics> {
  const d: Diagnostics = { permission: 'unsupported', serviceWorkerRegistered: false, serviceWorkerActive: false, pushSubscription: false, serverSubscription: null, vapidKey: !!publicKey };
  if (typeof window === 'undefined' || !('Notification' in window)) return d;
  d.permission = Notification.permission;
  if (!('serviceWorker' in navigator)) return d;
  const reg = await navigator.serviceWorker.getRegistration('/').catch(() => undefined);
  d.serviceWorkerRegistered = !!reg;
  d.serviceWorkerActive = !!reg?.active;
  const sub = await reg?.pushManager?.getSubscription().catch(() => null);
  d.pushSubscription = !!sub;
  if (sub) d.serverSubscription = await api<{ status: ServerStatus }>('POST', '/push/status', { endpoint: sub.endpoint }).then((r) => r.status === 'active', () => null);
  else d.serverSubscription = false;
  return d;
}

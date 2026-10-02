import { api } from '../api/client';

/**
 * Browser Web Push, opt-in. Nothing here runs by itself: the service worker is registered, and the browser's
 * permission question asked, only when the person chooses "Turn on notifications" in a PACT prompt or in Profile.
 */

export type PushState =
  | 'unsupported' // this browser can't do it (or is not on a secure page)
  | 'unavailable' // the server has no keys configured
  | 'blocked' // the person said no in the browser; only they can undo that
  | 'off' // possible, not turned on in this browser
  | 'on';

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

function keyBytes(base64Url: string) {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** What this browser is doing right now, without asking for anything. */
export async function currentState(serverEnabled: boolean | undefined): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!serverEnabled) return 'unavailable';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Asks the browser for permission (this is the only place that does), subscribes, and tells the server. */
export async function enablePush(publicKey: string): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'off'; // dismissed: stay off, ask nothing more
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const json = sub.toJSON();
  await api('POST', '/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
  return 'on';
}

/** Turns notifications off for this browser: the server forgets it and the browser unsubscribes. */
export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return Notification.permission === 'denied' ? 'blocked' : 'off';
}

/** Signing out of PACT must also stop this browser receiving that person's notifications. Never blocks sign-out. */
export async function detachPush(): Promise<void> {
  try {
    if (!pushSupported()) return;
    await disablePush();
  } catch {
    /* sign-out always continues */
  }
}

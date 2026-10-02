import { useSyncExternalStore } from 'react';

/**
 * The visitor's cookie choice, kept on their own device (no account, no server record).
 *
 * `necessary` is always true: the sign-in cookie is what keeps PACT secure and a person signed in, so it is not
 * something a visitor can switch off here. `analytics` is for optional analytics that use browser storage. PACT's
 * product analytics today are first-party and server-side and set no cookie (see docs/ANALYTICS.md), so nothing is
 * gated by this yet. When something optional is added, it must check `analyticsAllowed()` before it stores anything.
 *
 * `version` lets a future policy change ask again: a stored choice with an older version counts as no choice.
 */
export const CONSENT_VERSION = 1;
const KEY = 'pact.consent';
const EVENT = 'pact:consent';
const OPEN_EVENT = 'pact:cookie-settings';

export interface Consent {
  version: number;
  necessary: true;
  analytics: boolean;
  decidedAt: string;
}

export function readConsent(): Consent | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Consent> | null;
    if (!raw || raw.version !== CONSENT_VERSION || typeof raw.analytics !== 'boolean') return null;
    return { version: CONSENT_VERSION, necessary: true, analytics: raw.analytics, decidedAt: String(raw.decidedAt ?? '') };
  } catch {
    return null;
  }
}

export function writeConsent(choice: { analytics: boolean }) {
  const value: Consent = { version: CONSENT_VERSION, necessary: true, analytics: choice.analytics, decidedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* without storage the choice lasts for this visit only */
  }
  cache = JSON.stringify(value);
  window.dispatchEvent(new Event(EVENT));
}

/** Gate for any optional analytics storage. False until the visitor has said yes. */
export const analyticsAllowed = () => readConsent()?.analytics === true;

/* A tiny external store, so every part of the page sees a change the moment it is made. */
let cache: string | null | undefined;
const snapshot = () => {
  if (cache === undefined) cache = JSON.stringify(readConsent());
  return cache;
};
const subscribe = (cb: () => void) => {
  const onChange = () => {
    cache = undefined;
    cb();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

export function useConsent(): Consent | null {
  const s = useSyncExternalStore(subscribe, snapshot, () => 'null');
  return JSON.parse(s ?? 'null') as Consent | null;
}

/** The footer's "Cookie settings" link opens the settings sheet from anywhere. */
export const openCookieSettings = () => window.dispatchEvent(new Event(OPEN_EVENT));
export const onOpenCookieSettings = (cb: () => void) => {
  window.addEventListener(OPEN_EVENT, cb);
  return () => window.removeEventListener(OPEN_EVENT, cb);
};

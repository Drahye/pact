import { useEffect, useRef } from 'react';

/**
 * Half-finished forms survive a refresh, a dropped connection or an expired session.
 * Drafts live only in this browser, are scoped to the signed-in person, and expire after a week.
 * Never put a PIN, a code, a BVN or a card number in a draft.
 */
const PREFIX = 'pact.draft.';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored<T> {
  t: number;
  data: T;
}

let owner: string | null = null;
/** Set by the auth provider: drafts belong to whoever is signed in, never to the next person on the device. */
export const setDraftOwner = (id: string | null) => {
  owner = id;
};

const fullKey = (key: string) => `${PREFIX}${owner ?? 'anon'}.${key}`;

/** Drafts thrown away this session (submitted, or "start over"). A pending save must not bring them back. */
const discarded = new Set<string>();

export function readDraft<T extends object>(key: string): T | null {
  if (!owner) return null;
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored<T>;
    if (!s || typeof s.t !== 'number' || Date.now() - s.t > TTL_MS || typeof s.data !== 'object' || !s.data) {
      localStorage.removeItem(fullKey(key));
      return null;
    }
    return s.data;
  } catch {
    return null;
  }
}

export function writeDraft<T extends object>(key: string, data: T) {
  if (!owner) return;
  discarded.delete(fullKey(key));
  try {
    localStorage.setItem(fullKey(key), JSON.stringify({ t: Date.now(), data } satisfies Stored<T>));
  } catch {
    /* storage full or unavailable: the form still works, it just won't be remembered */
  }
}

export function clearDraft(key: string) {
  discarded.add(fullKey(key));
  try {
    localStorage.removeItem(fullKey(key));
  } catch {
    /* ignore */
  }
}

/** Removes every draft and remembered value on this device. Called when someone chooses to sign out. */
export function clearAllDrafts() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k.startsWith(RECENT) || k.startsWith(DEVICE)) localStorage.removeItem(k);
    discarded.clear();
  } catch {
    /* ignore */
  }
}

/**
 * Saves `snapshot` shortly after it changes. When `isEmpty` is true the draft is removed instead,
 * so an untouched form never leaves anything behind. Pass `enabled: false` while submitting.
 */
export function useSaveDraft<T extends object>(key: string, snapshot: T, isEmpty: boolean, enabled = true) {
  const latest = useRef({ key, snapshot, isEmpty, enabled });
  latest.current = { key, snapshot, isEmpty, enabled };

  useEffect(() => {
    if (!enabled) return;
    // A change after a discard means the person is typing again: saving is allowed once more.
    discarded.delete(fullKey(key));
    const id = window.setTimeout(() => (isEmpty ? clearDraft(key) : writeDraft(key, snapshot)), 350);
    return () => window.clearTimeout(id);
    // The snapshot is a fresh object every render; its JSON is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, JSON.stringify(snapshot), isEmpty, enabled]);

  // Flush on the way out (tab hidden, page closed) so the last keystrokes count.
  useEffect(() => {
    const flush = () => {
      const l = latest.current;
      if (!l.enabled || discarded.has(fullKey(l.key))) return;
      if (l.isEmpty) clearDraft(l.key);
      else writeDraft(l.key, l.snapshot);
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
}

/* Remembered values: things worth offering again, such as a number you signed in with or a vendor you paid. */

const RECENT = 'pact.recent.';
const DEVICE = 'pact.device.';

/** Small values tied to this browser, not a person (the last number used to sign in). Cleared on sign-out. */
export const deviceMemory = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(DEVICE + key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(DEVICE + key, value);
    } catch {
      /* ignore */
    }
  },
  clear(key: string) {
    try {
      localStorage.removeItem(DEVICE + key);
    } catch {
      /* ignore */
    }
  },
};

export function readRecents<T extends object>(key: string): T[] {
  if (!owner) return [];
  try {
    const list = JSON.parse(localStorage.getItem(`${RECENT}${owner}.${key}`) ?? '[]') as T[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Puts `item` first, dropping any earlier entry with the same `idOf`. Keeps the newest `max`. */
export function pushRecent<T extends object>(key: string, item: T, idOf: (x: T) => string, max = 5) {
  if (!owner) return;
  const next = [item, ...readRecents<T>(key).filter((x) => idOf(x) !== idOf(item))].slice(0, max);
  try {
    localStorage.setItem(`${RECENT}${owner}.${key}`, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

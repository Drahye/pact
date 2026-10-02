/**
 * The install rules, with no browser globals so they can be tested on their own.
 * The browser is the source of truth: "installed" means this page is running standalone right now, never that
 * someone once installed. Only an explicit "Not now" is remembered, and only for a week.
 */

export const DISMISS_KEY = 'pact.installPromptDismissedAt';
export const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Running as an installed app (Android/desktop display-mode, or iOS's navigator.standalone). */
export function isStandalone(win: { matchMedia: (q: string) => { matches: boolean }; navigator: object }): boolean {
  try {
    return win.matchMedia('(display-mode: standalone)').matches || (win.navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** iPhone, iPod, and iPad (which reports itself as a Mac with a touch screen). */
export function isIos(ua: string, platform = '', touchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}

export function dismissedRecently(now: number, store: Store | null): boolean {
  try {
    const at = Number(store?.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && now - at < DISMISS_MS;
  } catch {
    return false;
  }
}

export function rememberDismissal(now: number, store: Store | null) {
  try {
    store?.setItem(DISMISS_KEY, String(now));
  } catch {
    /* private mode: the prompt just may reappear sooner */
  }
}

export function clearDismissal(store: Store | null) {
  try {
    store?.removeItem(DISMISS_KEY);
  } catch {
    /* nothing to clear */
  }
}



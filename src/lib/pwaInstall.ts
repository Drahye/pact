import { clearDismissal as clear, dismissedRecently as recent, isIos, isStandalone as standaloneIn, rememberDismissal as remember } from './pwaInstallRules';

/** The live install state for this page, plus the one install prompt the browser hands us. See pwaInstallRules.ts for the rules. */

/** The event Chromium fires when the page can be installed. Not in the DOM typings. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
export const isStandalone = () => standaloneIn(window);
export const clearDismissal = () => clear(safeStorage());
export const dismissedRecently = (now: number) => recent(now, safeStorage());
export const rememberDismissal = (now: number) => remember(now, safeStorage());

/* ---- the live store (browser only) ------------------------------------------------------------- */

export interface PwaSnapshot {
  standalone: boolean;
  ios: boolean;
  /** Chromium handed us an install prompt we can trigger from our own UI. */
  canPrompt: boolean;
}

export type PwaEvent = 'started' | 'completed';

let deferred: BeforeInstallPromptEvent | null = null;
let standalone = false;
let ios = false;
let snapshot: PwaSnapshot = { standalone: false, ios: false, canPrompt: false };
let started = false;
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: PwaEvent) => void>();

const refresh = () => {
  const next = { standalone, ios, canPrompt: !!deferred && !standalone };
  if (next.standalone !== snapshot.standalone || next.ios !== snapshot.ios || next.canPrompt !== snapshot.canPrompt) {
    snapshot = next;
    listeners.forEach((l) => l());
  }
};

/** Start listening. Safe to call more than once; call it before React renders so an early event is not missed. */
export function initPwaInstall() {
  if (started || typeof window === 'undefined') return;
  started = true;
  standalone = isStandalone();
  ios = isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  snapshot = { standalone, ios, canPrompt: false };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // no browser mini-infobar: PACT offers it from its own UI, at a good moment
    deferred = e as BeforeInstallPromptEvent;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    clearDismissal();
    eventListeners.forEach((l) => l('completed'));
    refresh();
  });
  const mq = window.matchMedia('(display-mode: standalone)');
  mq.addEventListener?.('change', () => {
    standalone = isStandalone();
    refresh();
  });
}

export const subscribePwa = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const getPwaSnapshot = () => snapshot;
export const getServerPwaSnapshot = (): PwaSnapshot => ({ standalone: false, ios: false, canPrompt: false });
export const onPwaEvent = (l: (e: PwaEvent) => void) => (eventListeners.add(l), () => void eventListeners.delete(l));

/** Show the browser's install dialog. Resolves with what the person chose; null when there is nothing to show. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
  const ev = deferred;
  if (!ev) return null;
  eventListeners.forEach((l) => l('started'));
  // A prompt can only be used once, whatever the answer.
  deferred = null;
  refresh();
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    return choice.outcome;
  } catch {
    return 'dismissed';
  }
}

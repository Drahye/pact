import { useCallback, useSyncExternalStore } from 'react';
import { clearDismissal, dismissedRecently, getPwaSnapshot, getServerPwaSnapshot, promptInstall, rememberDismissal, subscribePwa } from '../lib/pwaInstall';

/**
 * Whether and how PACT can be installed right now. Nothing here remembers that someone once
 * installed: `installed` is the browser's answer for this very page.
 */
export function usePwaInstall() {
  const s = useSyncExternalStore(subscribePwa, getPwaSnapshot, getServerPwaSnapshot);

  /** Show the native prompt (Chromium). Returns the choice, or null when this browser has no prompt. */
  const install = useCallback(async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') clearDismissal();
    return outcome;
  }, []);

  return {
    /** Running as the installed app. Never show install UI then. */
    installed: s.standalone,
    /** The browser gave us a prompt we can trigger. */
    canInstall: s.canPrompt,
    /** iPhone or iPad in a browser: installing means Share, then Add to Home Screen. */
    needsIosSteps: s.ios && !s.standalone,
    /** Either way of installing is available. */
    available: !s.standalone && (s.canPrompt || s.ios),
    install,
    /** "Not now": remembered for a week, no longer. */
    snooze: () => rememberDismissal(Date.now()),
    snoozed: () => dismissedRecently(Date.now()),
  };
}

/**
 * The install rules: the browser decides whether PACT is installed, and only "Not now" is remembered, for a week.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clearDismissal, dismissedRecently, DISMISS_KEY, DISMISS_MS, isIos, isStandalone, rememberDismissal } from '../../src/lib/pwaInstallRules.js';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), keys: () => [...m.keys()] };
};
const win = (standaloneMedia: boolean, navStandalone?: boolean) => ({ matchMedia: () => ({ matches: standaloneMedia }), navigator: { standalone: navStandalone } }) as never;

describe('PWA install state', () => {
  it('installed means running standalone right now (Android display-mode or iOS navigator.standalone), nothing remembered', () => {
    assert.equal(isStandalone(win(true)), true);
    assert.equal(isStandalone(win(false, true)), true);
    assert.equal(isStandalone(win(false)), false, 'deleted from the phone, back in the browser: not installed, so it can be offered again');
  });

  it('detects iPhone, iPad and iPadOS-as-Mac, not Android or desktop', () => {
    assert.equal(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
    assert.equal(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5), true, 'iPad reporting as a Mac');
    assert.equal(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), false);
    assert.equal(isIos('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv81', 5), false);
  });

  it('"Not now" is remembered for a week and then expires', () => {
    const store = memory();
    const t0 = Date.UTC(2026, 9, 2);
    assert.equal(dismissedRecently(t0, store), false);
    rememberDismissal(t0, store);
    assert.equal(dismissedRecently(t0 + DISMISS_MS - 1000, store), true);
    assert.equal(dismissedRecently(t0 + DISMISS_MS + 1000, store), false, 'may be offered again after seven days');
  });

  it('installing clears the dismissal; the only thing ever stored is the dismissal time', () => {
    const store = memory();
    rememberDismissal(Date.now(), store);
    assert.deepEqual(store.keys(), [DISMISS_KEY]);
    clearDismissal(store);
    assert.deepEqual(store.keys(), [], 'no "installed" flag exists to go stale');
    assert.equal(dismissedRecently(Date.now(), store), false);
  });

  it('survives storage that throws or holds junk', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    assert.equal(dismissedRecently(Date.now(), broken), false);
    assert.doesNotThrow(() => rememberDismissal(Date.now(), broken));
    const junk = memory();
    junk.setItem(DISMISS_KEY, 'not a number');
    assert.equal(dismissedRecently(Date.now(), junk), false);
  });
});

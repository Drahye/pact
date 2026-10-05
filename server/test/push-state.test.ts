/**
 * Browser notification state: the permission, the browser's own push subscription and the server's record of it, and how they are
 * reconciled. The rules (src/lib/pushSync.ts) are pure, so a fake browser and a fake server stand in for the real ones here.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import webpush from 'web-push';
import { enable, reconcile, type PushEnv, type PushSub, type ServerStatus } from '../../src/lib/pushSync.js';

const KEY = webpush.generateVAPIDKeys().publicKey;
const OTHER_KEY = webpush.generateVAPIDKeys().publicKey;
const bytes = (k: string) => new Uint8Array(Buffer.from(k, 'base64url'));

/** One browser (permission, one subscription slot, a local "turned on here" hint) and one server (a table of this person's subscriptions). */
function world(init: { permission?: 'default' | 'granted' | 'denied'; supported?: boolean; opted?: boolean; sub?: { endpoint: string; key?: string } | null; server?: Record<string, ServerStatus> } = {}) {
  const w = {
    permission: init.permission ?? 'default',
    supported: init.supported ?? true,
    opted: init.opted ?? false,
    sub: init.sub ? { endpoint: init.sub.endpoint, key: init.sub.key ?? KEY } : (null as { endpoint: string; key: string } | null),
    server: { ...(init.server ?? {}) } as Record<string, ServerStatus>,
    askedPermission: 0,
    subscribeCalls: 0,
    saveCalls: 0,
    registered: false,
    failSubscribe: false,
    failSave: false,
    serverDown: false,
    swBroken: false,
    nextPermissionAnswer: 'granted' as 'default' | 'granted' | 'denied',
    n: 0,
  };
  const wrap = (s: { endpoint: string; key: string }): PushSub => ({
    endpoint: s.endpoint,
    keys: { p256dh: 'p'.repeat(30), auth: 'a'.repeat(12) },
    applicationServerKey: bytes(s.key),
    unsubscribe: async () => {
      w.sub = null;
    },
  });
  const env: PushEnv = {
    supported: () => w.supported,
    permission: () => w.permission,
    requestPermission: async () => {
      w.askedPermission++;
      w.permission = w.nextPermissionAnswer;
      return w.permission;
    },
    async getSubscription(register) {
      if (register) {
        if (w.swBroken) throw new Error('service worker failed to start');
        w.registered = true;
      }
      return w.sub ? wrap(w.sub) : null;
    },
    async subscribe(key) {
      w.subscribeCalls++;
      if (w.failSubscribe) throw new Error('push service unavailable');
      w.sub = { endpoint: `https://fcm.googleapis.com/fcm/send/new-${++w.n}`, key: Buffer.from(key).toString('base64url') };
      return wrap(w.sub);
    },
    async serverStatus(endpoint) {
      if (w.serverDown) throw new Error('offline');
      return w.server[endpoint] ?? 'none';
    },
    async serverSave(sub) {
      w.saveCalls++;
      if (w.failSave) throw new Error('500');
      w.server[sub.endpoint] = 'active';
    },
    optedIn: () => w.opted,
    markOptedIn: () => {
      w.opted = true;
    },
  };
  return { w, env };
}
const input = (over: Partial<Parameters<typeof reconcile>[1]> = {}) => ({ serverEnabled: true, publicKey: KEY, allowRepair: true, ...over });
const EP = 'https://fcm.googleapis.com/fcm/send/existing';

describe('browser notification state', () => {
  it('first-time enable: asks once, subscribes with the VAPID key, saves, and is on', async () => {
    const { w, env } = world();
    assert.equal(await reconcile(env, input()), 'off', 'permission not asked yet: offer it');
    assert.equal(w.askedPermission, 0, 'reconciling never asks');
    assert.equal(await enable(env, KEY), 'on');
    assert.equal(w.askedPermission, 1);
    assert.equal(w.saveCalls, 1);
    assert.equal(w.opted, true);
    assert.deepEqual(Object.values(w.server), ['active']);
    assert.equal(w.sub?.key, KEY);
  });

  it('reload after enable: on, with no prompt, no new subscription and nothing re-saved', async () => {
    const { w, env } = world();
    await enable(env, KEY);
    const saves = w.saveCalls;
    const subs = w.subscribeCalls;
    for (let i = 0; i < 3; i++) assert.equal(await reconcile(env, input()), 'on');
    assert.equal(w.saveCalls, saves);
    assert.equal(w.subscribeCalls, subs);
    assert.equal(w.askedPermission, 1);
  });

  it('a returning signed-in person with a valid subscription: on, even with no local hint (and the hint is learned)', async () => {
    const { w, env } = world({ permission: 'granted', sub: { endpoint: EP }, server: { [EP]: 'active' } });
    assert.equal(w.opted, false);
    assert.equal(await reconcile(env, input()), 'on');
    assert.equal(w.opted, true);
    assert.equal(w.subscribeCalls, 0);
    assert.equal(w.saveCalls, 0);
  });

  it('permission denied: blocked, never asked again, never repaired', async () => {
    const { w, env } = world({ permission: 'denied', opted: true });
    assert.equal(await reconcile(env, input()), 'blocked');
    assert.equal(await enable(env, KEY), 'blocked');
    assert.equal(w.askedPermission, 0);
    assert.equal(w.subscribeCalls, 0);
  });

  it('answering the browser question with "no" is blocked; dismissing it leaves things off', async () => {
    const a = world();
    a.w.nextPermissionAnswer = 'denied';
    assert.equal(await enable(a.env, KEY), 'blocked');
    const b = world();
    b.w.nextPermissionAnswer = 'default';
    assert.equal(await enable(b.env, KEY), 'off');
    assert.equal(b.w.subscribeCalls, 0);
  });

  it('permission granted but no subscription, for someone who turned it on here: one quiet repair, no question, then on', async () => {
    const { w, env } = world({ permission: 'granted', opted: true, sub: null });
    assert.equal(await reconcile(env, input()), 'on');
    assert.equal(w.askedPermission, 0);
    assert.equal(w.subscribeCalls, 1);
    assert.equal(w.saveCalls, 1);
    assert.equal(await reconcile(env, input()), 'on', 'and it stays on at the next look');
    assert.equal(w.subscribeCalls, 1);
  });

  it('signing out and back in (the sign-out removed the subscription) restores it without the prompt', async () => {
    const { w, env } = world();
    await enable(env, KEY);
    w.sub = null; // detachPush on sign-out
    w.server = {};
    assert.equal(await reconcile(env, input()), 'on');
  });

  it('permission granted, no subscription, and this person never turned it on here (shared device): off, so one tap, with nothing subscribed behind their back', async () => {
    const { w, env } = world({ permission: 'granted', opted: false, sub: null });
    assert.equal(await reconcile(env, input()), 'off');
    assert.equal(w.subscribeCalls, 0);
    assert.equal(w.registered, false, 'no service worker installed for someone who has not asked');
    assert.equal(await enable(env, KEY), 'on');
    assert.equal(w.askedPermission, 0, 'already granted: no browser question');
  });

  it('a subscription the server does not hold (a failed save, or removed): saved again, same subscription', async () => {
    const { w, env } = world({ permission: 'granted', opted: true, sub: { endpoint: EP }, server: {} });
    assert.equal(await reconcile(env, input()), 'on');
    assert.equal(w.subscribeCalls, 0);
    assert.equal(w.server[EP], 'active');
  });

  it('stale subscription (the push service said gone, so the server disabled it): replaced with a fresh one', async () => {
    const { w, env } = world({ permission: 'granted', opted: true, sub: { endpoint: EP }, server: { [EP]: 'disabled' } });
    assert.equal(await reconcile(env, input()), 'on');
    assert.equal(w.subscribeCalls, 1);
    assert.notEqual(w.sub?.endpoint, EP);
    assert.equal(w.server[w.sub!.endpoint], 'active');
  });

  it('a subscription made with an old VAPID key is replaced, not trusted', async () => {
    const { w, env } = world({ permission: 'granted', opted: true, sub: { endpoint: EP, key: OTHER_KEY }, server: { [EP]: 'active' } });
    assert.equal(await reconcile(env, input()), 'on');
    assert.equal(w.sub?.key, KEY);
    assert.equal(w.subscribeCalls, 1);
  });

  it('a disabled subscription the server holds for this person proves they turned it on, so it is repaired even without the local hint', async () => {
    const { w, env } = world({ permission: 'granted', opted: false, sub: { endpoint: EP }, server: { [EP]: 'disabled' } });
    assert.equal(await reconcile(env, input()), 'on');
    assert.equal(w.subscribeCalls, 1);
    assert.equal(w.opted, true);
  });

  it('repair that fails ends in an actionable error, once; the next look does not loop', async () => {
    const { w, env } = world({ permission: 'granted', opted: true, sub: null });
    w.failSubscribe = true;
    assert.equal(await reconcile(env, input()), 'error');
    assert.equal(w.subscribeCalls, 1);
    assert.equal(await reconcile(env, input({ allowRepair: false })), 'error');
    assert.equal(w.subscribeCalls, 1, 'no second attempt once the repair was spent');
  });

  it('server save fails on enable: an error (not "on"), and the next look repairs it', async () => {
    const { w, env } = world();
    w.failSave = true;
    assert.equal(await enable(env, KEY), 'error');
    assert.equal(w.opted, false);
    assert.ok(w.sub, 'the browser has a subscription the server does not');
    w.failSave = false;
    w.opted = true; // what the person tapping Try again would have done
    assert.equal(await enable(env, KEY), 'on');
    assert.equal(w.server[w.sub!.endpoint], 'active');
  });

  it('service worker would not start: an error, not a crash', async () => {
    const { w, env } = world({ permission: 'granted', opted: true });
    w.swBroken = true;
    assert.equal(await reconcile(env, input()), 'error');
    assert.equal(await enable(env, KEY), 'error');
  });

  it('server unreachable: stays on rather than scolding or churning subscriptions', async () => {
    const { w, env } = world({ permission: 'granted', opted: true, sub: { endpoint: EP } });
    w.serverDown = true;
    assert.equal(await reconcile(env, input()), 'on');
    assert.equal(w.subscribeCalls, 0);
  });

  it('unsupported and unavailable are reported before anything is touched', async () => {
    const a = world({ supported: false, permission: 'granted', opted: true });
    assert.equal(await reconcile(a.env, input()), 'unsupported');
    assert.equal(await enable(a.env, KEY), 'unsupported');
    const b = world({ permission: 'granted', opted: true });
    assert.equal(await reconcile(b.env, input({ serverEnabled: false })), 'unavailable');
    assert.equal(await reconcile(b.env, input({ publicKey: null })), 'unavailable');
    assert.equal(b.w.subscribeCalls, 0);
  });
});

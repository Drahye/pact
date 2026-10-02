/**
 * Notifications that matter and stay quiet: grouped repeats, a calm unread count, and optional browser push
 * that is selective, discreet and best-effort. Includes attempts to point the server at other hosts, to read
 * someone else's subscription, and runs with push unconfigured.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { sweepDeadlines } from '../src/modules/pacts.js';
import { isPushEndpoint, type PushSender, type PushTarget } from '../src/modules/push.js';
import { notificationLink } from '../../shared/notificationLink.js';
import { addDays, lagosToday } from '../src/lib/time.js';
import { setup, lagosDay } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type Session = { accessToken: string; user: { id: string } };
type Note = { id: string; type: string; title: string; body: string; pactId: string | null; pactTitle: string | null; refId: string | null; count: number; readAt: string | null };

const future = (days: number) => lagosDay(days);
const PIN = '1357';
const VAPID = { WEB_PUSH_VAPID_PUBLIC_KEY: 'BPublicKeyForTestsOnly000000000000000000000000000000000000000000000000000000000000000000000', WEB_PUSH_VAPID_PRIVATE_KEY: 'private-key-for-tests-only-0000000000000', WEB_PUSH_SUBJECT: 'mailto:ops@pact.test' };
const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}-aaaaaaaaaaaaaaaaaaaa`, keys: { p256dh: 'p'.repeat(40) + n, auth: 'a'.repeat(16) + n } });

/** Records what would be sent, and lets a test make an endpoint fail the way a real push service does. */
function fakeSender() {
  const sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
  const fail = new Map<string, number>();
  const sender: PushSender = {
    async send(t: PushTarget, payload: string) {
      const code = fail.get(t.endpoint);
      if (code) throw Object.assign(new Error(`push service said ${code}`), { statusCode: code });
      sent.push({ endpoint: t.endpoint, payload: JSON.parse(payload) });
    },
  };
  return { sender, sent, fail };
}

describe('Notifications and web push', () => {
  let t: T;
  let fake: ReturnType<typeof fakeSender>;
  let abraham: Session; // organiser
  let sarah: Session;
  let david: Session;
  let pact: { id: string; inviteCode: string };

  const notes = async (who: Session) => (await t.call('GET', '/notifications', who.accessToken)).body as { items: Note[]; unread: number };
  const ofType = async (who: Session, type: string, pactId?: string) => (await notes(who)).items.filter((n) => n.type === type && (!pactId || n.pactId === pactId));
  const newPact = async (title: string, target = 500_000_00, deadline = future(30), extra: Record<string, unknown> = {}) => {
    const r = await t.call('POST', '/pacts', abraham.accessToken, { title, category: 'gift', target, deadline, ...extra });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = r.body.data.pact;
    for (const s of [sarah, david]) assert.equal((await t.call('POST', `/invites/${p.inviteCode}/join`, s.accessToken, {})).status, 200);
    return { id: p.id as string, inviteCode: p.inviteCode as string };
  };
  const contribute = async (id: string, who: Session, naira: number) => {
    const r = await t.call('POST', `/pacts/${id}/contributions`, who.accessToken, { amount: naira * 100, pin: PIN });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  };
  const subscribe = (who: Session, n: number) => t.call('POST', '/push/subscribe', who.accessToken, sub(n));
  const pushedTo = (n: number) => fake.sent.filter((s) => s.endpoint === sub(n).endpoint);

  before(async () => {
    fake = fakeSender();
    t = await setup({ seed: true, env: VAPID, push: fake.sender });
    abraham = await t.signIn('08010000001');
    sarah = await t.signIn('08010000002');
    david = await t.signIn('08010000003');
    pact = await newPact('Sarah’s Birthday');
    await t.drain();
  });
  after(async () => {
    await t.close();
  });

  describe('in-app', () => {
    it('A: repeated joins and contributions become one growing line, not a pile', async () => {
      await contribute(pact.id, sarah, 5_000);
      await contribute(pact.id, david, 7_000);
      await contribute(pact.id, sarah, 1_000);
      const contributions = await ofType(abraham, 'contribution', pact.id);
      assert.equal(contributions.length, 1);
      assert.equal(contributions[0].count, 3);
      assert.equal(contributions[0].title, '3 new contributions');
      const joins = await ofType(abraham, 'join', pact.id);
      assert.equal(joins.length, 1);
      assert.equal(joins[0].title, '2 people joined');
      assert.equal(joins[0].pactTitle, 'Sarah’s Birthday', 'each line carries the Pact it is about');
    });

    it('A2: a notification carries safe details, can be opened on its own, and is private to its owner', async () => {
      const line = (await ofType(abraham, 'contribution', pact.id))[0] as Note & { meta: Record<string, unknown> };
      assert.equal(line.meta.actor, 'Sarah');
      assert.equal(line.meta.amount, 5_000_00, 'amounts are kobo');
      assert.ok(!JSON.stringify(line.meta).match(/account|bvn|pin/i), 'no private identifiers in the details');
      const one = await t.call('GET', `/notifications/${line.id}`, abraham.accessToken);
      assert.equal(one.status, 200);
      assert.equal(one.body.id, line.id);
      assert.equal(one.body.pactTitle, 'Sarah’s Birthday');
      assert.equal((await t.call('GET', `/notifications/${line.id}`, sarah.accessToken)).status, 404, 'someone else’s notification does not exist for you');
      assert.equal((await t.call('GET', '/notifications/not-an-id', abraham.accessToken)).status, 404);
      assert.equal((await t.call('GET', `/notifications/${line.id}`, undefined)).status, 401);
    });

    it('B: unread is a count, reading one line leaves the rest unread, and later events start a fresh line', async () => {
      const before = await notes(abraham);
      assert.ok(before.unread >= 2);
      const target = before.items.find((n) => n.type === 'contribution' && n.pactId === pact.id)!;
      await t.call('POST', '/notifications/read', abraham.accessToken, { ids: [target.id] });
      const after = await notes(abraham);
      assert.equal(after.unread, before.unread - 1, 'opening the app or one line does not read everything');
      assert.ok(after.items.find((n) => n.id === target.id)!.readAt);
      await contribute(pact.id, david, 1_000);
      const fresh = (await ofType(abraham, 'contribution', pact.id)).filter((n) => !n.readAt);
      assert.equal(fresh.length, 1);
      assert.equal(fresh[0].count, 1, 'a new contribution after reading is a new line');
    });

    it('C: you can only read your own notifications', async () => {
      const mine = (await notes(abraham)).items.find((n) => !n.readAt)!;
      await t.call('POST', '/notifications/read', sarah.accessToken, { ids: [mine.id] });
      assert.equal((await notes(abraham)).items.find((n) => n.id === mine.id)!.readAt, null);
    });

    it('D: reactions never notify, and each kind knows where it leads', async () => {
      const upd = await t.call('POST', `/pacts/${pact.id}/updates`, abraham.accessToken, { body: 'Venue confirmed for Saturday' });
      assert.equal(upd.status, 200, JSON.stringify(upd.body));
      const feedItem = (await t.call('GET', `/pacts/${pact.id}`, abraham.accessToken)).body.data.activities.find((a: { type: string }) => a.type === 'update');
      const beforeReact = (await notes(abraham)).items.length;
      await t.call('PUT', `/pacts/${pact.id}/activity/${feedItem.id}/reactions`, sarah.accessToken, { reaction: 'like', on: true });
      assert.equal((await notes(abraham)).items.length, beforeReact, 'a reaction does not notify');
      const update = (await ofType(sarah, 'update', pact.id))[0];
      assert.equal(update.refId, feedItem.id);
      assert.equal(notificationLink(update), `/app/pact/${pact.id}?thread=${feedItem.id}`);
      assert.equal(notificationLink({ type: 'funded', pactId: pact.id }), `/app/pact/${pact.id}`);
      assert.equal(notificationLink({ type: 'security', pactId: null }), null);
    });

    it('E: several comments on one thread become "N new comments" and push only once', async () => {
      await subscribe(abraham, 1);
      const feedItem = (await t.call('GET', `/pacts/${pact.id}`, abraham.accessToken)).body.data.activities.find((a: { type: string }) => a.type === 'update');
      fake.sent.length = 0;
      for (const body of ['Great!', 'See you there', 'Bringing snacks']) {
        assert.equal((await t.call('POST', `/pacts/${pact.id}/activity/${feedItem.id}/comments`, sarah.accessToken, { body })).status, 200);
      }
      await t.drain();
      const comments = await ofType(abraham, 'comment', pact.id);
      assert.equal(comments.length, 1);
      assert.equal(comments[0].title, '3 new comments');
      assert.equal(pushedTo(1).length, 1, 'one push for the first comment, none for the rest');
      assert.match(pushedTo(1)[0].payload.url, /^\/app\/pact\/[^/]+\?thread=/);
    });
  });

  describe('web push', () => {
    it('F: the public config says whether push is available and exposes only the public key', async () => {
      const c = (await t.call('GET', '/config')).body;
      assert.equal(c.push.enabled, true);
      assert.equal(c.push.publicKey, VAPID.WEB_PUSH_VAPID_PUBLIC_KEY);
      assert.ok(!JSON.stringify(c).includes(VAPID.WEB_PUSH_VAPID_PRIVATE_KEY));
    });

    it('G: subscribing needs a session, a real push service address and well-formed keys', async () => {
      assert.equal((await t.call('POST', '/push/subscribe', undefined, sub(2))).status, 401);
      for (const endpoint of ['http://fcm.googleapis.com/fcm/send/abc-aaaaaaaaaaaaaaaaaaaaaaa', 'https://evil.example.com/steal', 'https://169.254.169.254/latest/meta-data/', 'https://fcm.googleapis.com.evil.example.com/x-aaaaaaaaaaaaaaaaaaaaa', 'https://user:pw@fcm.googleapis.com/fcm/send/abc-aaaaaaaaaaaaaaaaaaaa', 'https://fcm.googleapis.com:8443/fcm/send/abc-aaaaaaaaaaaaaaaaaaaa', 'not a url']) {
        const r = await t.call('POST', '/push/subscribe', sarah.accessToken, { ...sub(2), endpoint });
        assert.equal(r.status, 400, endpoint);
      }
      assert.equal((await t.call('POST', '/push/subscribe', sarah.accessToken, { ...sub(2), keys: { p256dh: 'x', auth: 'y' } })).status, 400);
      assert.ok(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abcdef'));
      assert.ok(isPushEndpoint('https://web.push.apple.com/QabCdEf'));
      assert.ok(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc'));
      assert.equal((await subscribe(sarah, 2)).status, 200);
    });

    it('H: subscriptions are private: no endpoint returns them, and one person cannot remove another’s', async () => {
      assert.equal((await t.call('GET', '/push/subscriptions', sarah.accessToken)).status, 404);
      assert.equal((await t.call('POST', '/push/unsubscribe', david.accessToken, { endpoint: sub(2).endpoint })).status, 200);
      const still = await t.db.query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [sub(2).endpoint]);
      assert.equal(still.rowCount, 1, 'david’s unsubscribe did not touch sarah’s browser');
      assert.equal((await t.call('POST', '/push/unsubscribe', sarah.accessToken, { endpoint: sub(2).endpoint })).status, 200);
      assert.equal((await t.db.query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [sub(2).endpoint])).rowCount, 0);
    });

    it('H2: the app role has no access to subscriptions at all, even straight at the database', async () => {
      const role = await t.db.query(`SELECT 1 FROM pg_roles WHERE rolname = 'pact_app'`);
      if (!role.rowCount) return;
      const r = await t.db.query<{ s: boolean; i: boolean }>(`SELECT has_table_privilege('pact_app', 'push_subscriptions', 'SELECT') AS s, has_table_privilege('pact_app', 'push_subscriptions', 'INSERT') AS i`);
      assert.deepEqual(r.rows[0], { s: false, i: false });
    });

    it('I: the same browser signing in as someone else takes the subscription over', async () => {
      await subscribe(sarah, 3);
      await subscribe(david, 3);
      const row = (await t.db.query<{ user_id: string }>('SELECT user_id FROM push_subscriptions WHERE endpoint = $1', [sub(3).endpoint])).rows[0];
      assert.equal(row.user_id, david.user.id);
    });

    it('J: a person keeps at most their eight newest browsers', async () => {
      for (let n = 10; n < 20; n++) assert.equal((await subscribe(sarah, n)).status, 200);
      const count = (await t.db.query<{ n: number }>('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [sarah.user.id])).rows[0].n;
      assert.equal(count, 8);
    });

    it('K: push is for things that need you: funded, updates, approvals; not contributions or joins', async () => {
      await subscribe(david, 4);
      const p = await newPact('Lagos trip', 20_000_00);
      await t.drain();
      fake.sent.length = 0;
      await contribute(p.id, sarah, 5_000); // organiser (abraham) hears in-app only
      await t.drain();
      assert.equal(pushedTo(1).length, 0, 'a contribution is not worth a lock-screen alert');
      await contribute(p.id, david, 15_000); // reaches the goal
      await t.drain();
      const funded = pushedTo(4);
      assert.equal(funded.length, 1);
      assert.equal(funded[0].payload.title, 'PACT');
      assert.equal(funded[0].payload.body, 'Lagos trip reached its goal.');
      assert.equal(funded[0].payload.url, `/app/pact/${p.id}`);
      await t.call('POST', `/pacts/${p.id}/updates`, abraham.accessToken, { body: 'Flights booked, details to follow' });
      await t.drain();
      assert.ok(pushedTo(4).some((s) => s.payload.body === 'Abraham posted an update in Lagos trip.'));
    });

    it('L: nothing on the lock screen carries money, account details or private numbers', async () => {
      for (const s of fake.sent) {
        assert.ok(!/[₦\d]{4,}|NGN|BVN|PIN|OTP|account/i.test(s.payload.body), s.payload.body);
        assert.ok(s.payload.url.startsWith('/app'), 'a push can only open PACT');
      }
    });

    it('M: a task due soon reaches the person holding it once, and the sweep does not repeat it', async () => {
      const p = await newPact('Dinner for Tolu', 100_000_00, addDays(lagosToday(new Date()), 2));
      const task = (await t.call('POST', `/pacts/${p.id}/tasks`, abraham.accessToken, { title: 'Book the table', assigneeId: sarah.user.id })).body;
      assert.ok(task, JSON.stringify(task));
      await subscribe(sarah, 5);
      await t.drain();
      fake.sent.length = 0;
      await sweepDeadlines(t.ctx);
      await t.drain();
      const due = await ofType(sarah, 'task_due', p.id);
      assert.equal(due.length, 1);
      assert.match(due[0].body, /Book the table/);
      assert.equal(pushedTo(5).filter((s) => /task due soon/.test(s.payload.body)).length, 1);
      await sweepDeadlines(t.ctx);
      await t.drain();
      assert.equal((await ofType(sarah, 'task_due')).length, 1, 'a second sweep says nothing more');
    });

    it('N: an expired subscription is switched off, and the action that caused it still succeeded', async () => {
      await subscribe(david, 6);
      fake.fail.set(sub(6).endpoint, 410);
      const upd = await t.call('POST', `/pacts/${pact.id}/updates`, abraham.accessToken, { body: 'One more thing to know' });
      assert.equal(upd.status, 200, 'the update is posted whatever push does');
      await t.drain();
      const row = (await t.db.query<{ disabled_at: Date | null }>('SELECT disabled_at FROM push_subscriptions WHERE endpoint = $1', [sub(6).endpoint])).rows[0];
      assert.ok(row.disabled_at, 'a 410 from the push service disables the subscription');
      const job = await t.db.query(`SELECT 1 FROM jobs WHERE type = 'push.send' AND done_at IS NULL`);
      assert.equal(job.rowCount, 0, 'the push job completed instead of retrying forever');
      fake.fail.delete(sub(6).endpoint);
    });

    it('O: a push service outage is logged and forgotten: the subscription stays, nothing throws', async () => {
      await subscribe(david, 7);
      fake.fail.set(sub(7).endpoint, 503);
      await t.call('POST', `/pacts/${pact.id}/updates`, abraham.accessToken, { body: 'Bringing the cake' });
      await t.drain();
      const row = (await t.db.query<{ disabled_at: Date | null }>('SELECT disabled_at FROM push_subscriptions WHERE endpoint = $1', [sub(7).endpoint])).rows[0];
      assert.equal(row.disabled_at, null);
      assert.equal((await t.db.query(`SELECT 1 FROM jobs WHERE type = 'push.send' AND done_at IS NULL`)).rowCount, 0);
      fake.fail.delete(sub(7).endpoint);
    });

    it('P: disabled subscriptions are cleaned up after a month', async () => {
      await t.db.query(`UPDATE push_subscriptions SET disabled_at = now() - interval '40 days' WHERE endpoint = $1`, [sub(6).endpoint]);
      await t.db.query(`INSERT INTO jobs (type, payload) VALUES ('pacts.sweep', '{}')`);
      await t.drain();
      assert.equal((await t.db.query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [sub(6).endpoint])).rowCount, 0);
    });
  });

  describe('without VAPID keys', () => {
    let bare: T;
    before(async () => {
      bare = await setup({ seed: true, push: null });
    });
    after(async () => {
      await bare.close();
    });

    it('Q: the app works exactly as before, and push is simply unavailable', async () => {
      const c = (await bare.call('GET', '/config')).body;
      assert.deepEqual(c.push, { enabled: false, publicKey: null });
      const a = await bare.signIn('08010000001');
      const s = await bare.call('POST', '/push/subscribe', a.accessToken, sub(1));
      assert.equal(s.status, 400);
      assert.equal(s.body.error.code, 'push_unavailable');
      const p = await bare.call('POST', '/pacts', a.accessToken, { title: 'Quiet beta', category: 'trip', target: 100_000_00, deadline: future(20) });
      assert.equal(p.status, 200);
      await bare.drain();
      assert.equal((await bare.call('GET', '/notifications', a.accessToken)).status, 200);
    });
  });

  describe('configuration', () => {
    it('R: VAPID settings are all or nothing, and the contact must be a mailto: or https address', () => {
      assert.equal(loadConfig({ NODE_ENV: 'test' }).push, null);
      assert.throws(() => loadConfig({ NODE_ENV: 'test', WEB_PUSH_VAPID_PUBLIC_KEY: 'x'.repeat(30) }), /all be set, or none/);
      assert.throws(() => loadConfig({ NODE_ENV: 'test', ...VAPID, WEB_PUSH_SUBJECT: 'ops@pact.test' }), /mailto:/);
      assert.deepEqual(loadConfig({ NODE_ENV: 'test', ...VAPID }).push?.subject, 'mailto:ops@pact.test');
    });
  });
});

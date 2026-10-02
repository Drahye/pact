/**
 * Adversarial tests: each one tries to break a rule by calling the API (or the database)
 * directly, the way an attacker who skips the app would.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { PaymentProvider } from '../src/payments/provider.js';
import { setup, lagosDay } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type Session = { accessToken: string; refreshToken: string; user: { id: string } };

const future = (days: number) => lagosDay(days);

describe('security: authorization, RLS, payments, uploads, abuse', () => {
  let t: T;
  let abraham: Session; // organiser of Sarah's Birthday and New Apartment
  let sarah: Session; // member of Sarah's Birthday, not of New Apartment
  let outsider: Session; // in no Pacts
  let sarahsBirthday: string;
  let newApartment: string;

  before(async () => {
    t = await setup({ seed: true });
    abraham = await t.signIn('08010000001');
    sarah = await t.signIn('08010000002');
    outsider = await t.signIn('08030000999', { firstName: 'Olu', lastName: 'Outsider', pin: '2468' });
    const list = await t.call('GET', '/pacts', abraham.accessToken);
    sarahsBirthday = list.body.data.find((p: { title: string }) => p.title === "Sarah's Birthday").id;
    newApartment = list.body.data.find((p: { title: string }) => p.title === 'New Apartment').id;
  });
  after(async () => {
    await t.close();
  });

  /* ---------------- authentication ---------------- */

  it('rejects every protected route without a session', async () => {
    const routes: [string, string][] = [
      ['GET', '/me'], ['GET', '/wallet'], ['GET', '/wallet/transactions'], ['GET', '/pacts'], ['GET', `/pacts/${sarahsBirthday}`],
      ['POST', '/pacts'], ['POST', `/pacts/${sarahsBirthday}/contributions`], ['POST', `/pacts/${sarahsBirthday}/tasks`],
      ['POST', `/pacts/${sarahsBirthday}/budget`], ['PUT', `/pacts/${sarahsBirthday}/memory`], ['POST', `/pacts/${sarahsBirthday}/split-rest`],
      ['POST', '/wallet/topups'], ['POST', '/wallet/withdrawals'], ['GET', '/bank-accounts'], ['GET', '/me/export'], ['POST', '/me/close'],
      ['GET', '/notifications'], ['GET', '/activity'], ['POST', '/me/pin/reset/request'],
    ];
    for (const [method, url] of routes) {
      const r = await t.call(method, url, undefined, method === 'GET' ? undefined : {});
      assert.equal(r.status, 401, `${method} ${url} returned ${r.status}`);
    }
    const forged = await t.call('GET', '/me', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.');
    assert.equal(forged.status, 401);
  });

  /* ---------------- IDOR: changing ids in requests ---------------- */

  it('never lets an outsider reach a Pact, even by id', async () => {
    const attempts: [string, string, unknown?][] = [
      ['GET', `/pacts/${sarahsBirthday}`],
      ['POST', `/pacts/${sarahsBirthday}/contributions`, { amount: 100000, pin: '2468' }],
      ['POST', `/pacts/${sarahsBirthday}/tasks`, { title: 'Sneaky' }],
      ['PATCH', `/pacts/${sarahsBirthday}/participation`, { participation: 'money' }],
      ['POST', `/pacts/${sarahsBirthday}/budget`, { name: 'Sneaky', amount: 100000 }],
      ['PUT', `/pacts/${sarahsBirthday}/memory`, { note: 'x' }],
      ['POST', `/pacts/${sarahsBirthday}/split-rest`, {}],
      ['POST', `/pacts/${sarahsBirthday}/release`, { pin: '2468' }],
      ['POST', `/pacts/${sarahsBirthday}/cancel`, { pin: '2468' }],
      ['POST', `/pacts/${sarahsBirthday}/nudge`, {}],
      ['POST', `/pacts/${sarahsBirthday}/invites`, { phones: ['08031112222'] }],
      ['POST', `/pacts/${sarahsBirthday}/accept`, {}],
    ];
    for (const [method, url, body] of attempts) {
      const r = await t.call(method, url, outsider.accessToken, body);
      assert.equal(r.status, 404, `${method} ${url} returned ${r.status} ${JSON.stringify(r.body)}`);
    }
    // A member of one Pact can't see another Pact of the same organiser.
    assert.equal((await t.call('GET', `/pacts/${newApartment}`, sarah.accessToken)).status, 404);
    // Garbage ids are a plain 404, not a 500.
    assert.equal((await t.call('GET', `/pacts/not-a-uuid`, sarah.accessToken)).status, 404);
  });

  it('keeps wallet records, bank accounts, sessions and notifications private', async () => {
    const top = await t.call('POST', '/wallet/topups', abraham.accessToken, { amount: 500000, channel: 'bank_transfer' });
    assert.equal((await t.call('GET', `/wallet/topups/${top.body.reference}`, outsider.accessToken)).status, 404);
    const bank = await t.call('POST', '/bank-accounts', abraham.accessToken, { bankCode: '058', accountNumber: '0123456789', pin: '1357' });
    assert.equal((await t.call('DELETE', `/bank-accounts/${bank.body.id}`, outsider.accessToken)).status, 404);
    assert.equal((await t.call('GET', '/bank-accounts', abraham.accessToken)).body.length, 1);
    // Revoking someone else's session id silently does nothing.
    const sessions = await t.call('GET', '/me/sessions', abraham.accessToken);
    await t.call('DELETE', `/me/sessions/${sessions.body[0].id}`, outsider.accessToken);
    assert.equal((await t.call('GET', '/me', abraham.accessToken)).status, 200);
    // Marking someone else's notification as read has no effect.
    const notes = await t.call('GET', '/notifications', abraham.accessToken);
    const unread = notes.body.items.find((n: { readAt: string | null }) => !n.readAt);
    await t.call('POST', '/notifications/read', outsider.accessToken, { ids: [unread.id] });
    const again = await t.call('GET', '/notifications', abraham.accessToken);
    assert.equal(again.body.items.find((n: { id: string }) => n.id === unread.id).readAt, null);
  });

  it('never returns phone numbers, PIN hashes or balances of other people', async () => {
    const r = await t.call('GET', `/pacts/${sarahsBirthday}`, sarah.accessToken);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes('+234'), 'phone number leaked');
    assert.ok(!/pin_hash|pinHash|scrypt\$/.test(text), 'PIN hash leaked');
    assert.ok(!/balance/i.test(text.replace(/poolBalance/g, '')), 'wallet balance leaked');
    const preview = await t.call('GET', `/invites/${r.body.data.pact.inviteCode}`);
    // Public by design: the Pact's account number (so anyone can pay by transfer), and nothing personal.
    assert.deepEqual(Object.keys(preview.body).sort(), ['bankAccount', 'category', 'deadline', 'memberCount', 'mode', 'organizer', 'raised', 'status', 'target', 'title']);
    assert.equal(preview.body.bankAccount, null, 'no account number until an organiser sets one up');
  });

  /* ---------------- the database refuses on its own (RLS) ---------------- */

  it('row-level security hides other people’s data even from raw SQL', async () => {
    const seen = await t.db.asUser(outsider.user.id, (q) => q.query('SELECT id FROM pacts'));
    assert.equal(seen.rows.length, 0);
    const sarahSees = await t.db.asUser(sarah.user.id, (q) => q.query<{ id: string }>('SELECT id FROM pacts'));
    assert.ok(sarahSees.rows.some((p) => p.id === sarahsBirthday));
    assert.ok(!sarahSees.rows.some((p) => p.id === newApartment));
    const tasks = await t.db.asUser(outsider.user.id, (q) => q.query('SELECT id FROM tasks'));
    assert.equal(tasks.rows.length, 0);
  });

  it('row-level security blocks money tables, credentials and forged writes', async () => {
    const denied = async (sql: string, params: unknown[] = []) => {
      await assert.rejects(t.db.asUser(sarah.user.id, (q) => q.query(sql, params)), (e: { code?: string }) => e.code === '42501', sql);
    };
    await denied('SELECT * FROM accounts');
    await denied('SELECT * FROM ledger_entries');
    await denied('SELECT * FROM sessions');
    await denied('SELECT * FROM bank_accounts');
    await denied('SELECT phone FROM users');
    await denied('SELECT pin_hash FROM users');
    await denied('SELECT * FROM audit_log');
    // Changing a contribution amount directly: the column isn't writable at all.
    await denied('UPDATE pact_members SET contributed = 999999999 WHERE user_id = $1', [sarah.user.id]);
    await denied('UPDATE pacts SET raised_amount = 1');
    // Inserting a task into a Pact you're not in violates the policy.
    await assert.rejects(
      t.db.asUser(outsider.user.id, (q) => q.query('INSERT INTO tasks (pact_id, title, created_by) VALUES ($1, $2, $3)', [sarahsBirthday, 'x', outsider.user.id])),
      (e: { code?: string }) => e.code === '42501',
    );
    // Members can't add budget lines (organiser only), even with raw SQL.
    await assert.rejects(
      t.db.asUser(sarah.user.id, (q) => q.query('INSERT INTO budget_items (pact_id, name, amount, created_by) VALUES ($1, $2, $3, $4)', [sarahsBirthday, 'x', 100000, sarah.user.id])),
      (e: { code?: string }) => e.code === '42501',
    );
  });

  /* ---------------- input: validation can't be bypassed ---------------- */

  it('rejects oversized, malformed and spoofing input server-side', async () => {
    const huge = await t.app.inject({
      method: 'POST',
      url: '/api/pacts',
      headers: { authorization: `Bearer ${abraham.accessToken}`, 'content-type': 'application/json', 'idempotency-key': 'huge-body-1234' },
      payload: JSON.stringify({ title: 'x'.repeat(70_000) }),
    });
    assert.equal(huge.statusCode, 413);
    const base = { category: 'other', deadline: future(10), target: 500000 };
    const bad = [
      { ...base, title: 'x'.repeat(61) },
      { ...base, title: 'Sarah‮gnp.exe' },
      { ...base, title: 'Tab\u0007bell' },
      { ...base, title: '<script>alert(1)</script>' },
      { ...base, title: 'Ok', target: -5000 },
      { ...base, title: 'Ok', target: 1000.5 },
      { ...base, title: 'Ok', target: '500000' },
      { ...base, title: 'Ok', category: 'crypto' },
      { ...base, title: 'Ok', deadline: 'tomorrow' },
    ];
    for (const body of bad) {
      const r = await t.call('POST', '/pacts', abraham.accessToken, body);
      assert.equal(r.status, 400, `accepted ${JSON.stringify(body).slice(0, 80)}`);
    }
    const contrib = await t.call('POST', `/pacts/${sarahsBirthday}/contributions`, sarah.accessToken, { amount: 150, pin: '1357' });
    assert.equal(contrib.status, 400);
  });

  it('works out the target from the budget, ignoring the client’s number', async () => {
    const r = await t.call('POST', '/pacts', abraham.accessToken, {
      title: 'Server does the maths', category: 'trip', deadline: future(20), target: 100000,
      budget: [{ name: 'Flights', amount: 30000000 }, { name: 'Hotel', amount: 20000000 }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.pact.target, 50000000);
    assert.equal(r.body.data.pact.budget.length, 2);
  });

  it('only invites people you know by id; strangers by phone', async () => {
    const r = await t.call('POST', '/pacts', outsider.accessToken, {
      title: 'Stranger danger', category: 'other', deadline: future(20), target: 500000, inviteUserIds: [abraham.user.id],
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'unknown_people');
  });

  /* ---------------- payments ---------------- */

  it('has no sandbox checkout or payment bypass when a real processor is configured', async () => {
    const provider: PaymentProvider = {
      name: 'paystack',
      initializeCheckout: async () => ({ checkoutUrl: 'https://checkout.example/x' }),
      verifyCheckout: async () => ({ status: 'pending', amountPaid: null, reason: null }),
      verifyWebhookSignature: () => false,
      parseWebhook: () => null,
      listBanks: async () => [],
      resolveAccount: async () => ({ accountName: 'X' }),
      createRecipient: async () => ({ recipientCode: 'R' }),
      initiateTransfer: async () => ({ providerRef: 'T', status: 'pending' }),
      createPactAccount: async () => ({ providerRef: 'D', accountNumber: '9900000000', bankName: 'X', accountName: 'X' }),
      closePactAccount: async () => {},
    };
    const { app } = await buildApp({ config: t.ctx.config, db: t.db, provider });
    await app.ready();
    const complete = await app.inject({
      method: 'POST', url: '/api/sandbox/checkout/TOP_X/complete',
      headers: { authorization: `Bearer ${abraham.accessToken}`, 'content-type': 'application/json' }, payload: '{"outcome":"success"}',
    });
    assert.equal(complete.statusCode, 404);
    const hook = await app.inject({ method: 'POST', url: '/api/webhooks/paystack', headers: { 'content-type': 'application/json' }, payload: '{"event":"charge.success","data":{"reference":"x","amount":1}}' });
    assert.equal(hook.statusCode, 401);
    const wrongProvider = await app.inject({ method: 'POST', url: '/api/webhooks/sandbox', headers: { 'content-type': 'application/json' }, payload: '{}' });
    assert.equal(wrongProvider.statusCode, 404);
    await app.close();
  });

  it('shares per-IP rate limits across API instances', async () => {
    const config = loadConfig({ NODE_ENV: 'test', SEED_DEMO: 'false', RATE_LIMIT_ENABLED: 'true' });
    const one = (await buildApp({ config, db: t.db })).app;
    const two = (await buildApp({ config, db: t.db })).app;
    await Promise.all([one.ready(), two.ready()]);
    const ask = (app: typeof one, i: number, ip = '203.0.113.7') =>
      app.inject({ method: 'POST', url: '/api/auth/otp/request', remoteAddress: ip, headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ phone: `0807000${String(i).padStart(4, '0')}` }) });
    // Five a minute per IP, alternating instances: the sixth is refused whichever instance it hits.
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await ask(i % 2 ? two : one, i)).statusCode);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
    assert.equal((await ask(one, 99)).statusCode, 429);
    assert.equal((await ask(two, 98, '203.0.113.8')).statusCode, 200, 'other addresses are unaffected');
    await Promise.all([one.close(), two.close()]);
  });

  it('never credits a payment in another currency', async () => {
    const u = await t.signIn('08036661234', { firstName: 'Fx', lastName: 'Tester', pin: '2468' });
    const top = await t.call('POST', '/wallet/topups', u.accessToken, { amount: 500000, channel: 'bank_transfer' });
    const body = JSON.stringify({ event: 'charge.success', data: { id: 9, reference: top.body.reference, amount: 500000, currency: 'USD' } });
    const sign = (t.ctx.provider as unknown as { sign(b: string): string }).sign;
    await t.app.inject({ method: 'POST', url: '/api/webhooks/sandbox', headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(body) }, payload: body });
    assert.equal((await t.call('GET', `/wallet/topups/${top.body.reference}`, u.accessToken)).body.status, 'failed');
    assert.equal((await t.call('GET', '/wallet', u.accessToken)).body.balance, 0);
  });

  /* ---------------- plan rules ---------------- */

  it('enforces who can do what with tasks and budget', async () => {
    const pact = await t.call('GET', `/pacts/${sarahsBirthday}`, sarah.accessToken);
    const open = pact.body.data.pact.tasks.find((x: { assigneeId: string | null }) => !x.assigneeId);
    const others = pact.body.data.pact.tasks.find((x: { assigneeId: string | null }) => x.assigneeId && x.assigneeId !== sarah.user.id);

    // Members can claim an open task, but not finish someone else's or hand tasks to others.
    assert.equal((await t.call('PATCH', `/pacts/${sarahsBirthday}/tasks/${open.id}`, sarah.accessToken, { assigneeId: 'me' })).status, 200);
    assert.equal((await t.call('PATCH', `/pacts/${sarahsBirthday}/tasks/${others.id}`, sarah.accessToken, { status: 'done' })).status, 403);
    assert.equal((await t.call('PATCH', `/pacts/${sarahsBirthday}/tasks/${open.id}`, sarah.accessToken, { assigneeId: abraham.user.id })).status, 403);
    // A task already taken can't be claimed by someone else.
    const taken = await t.call('PATCH', `/pacts/${sarahsBirthday}/tasks/${open.id}`, abraham.accessToken, { assigneeId: 'me' });
    assert.equal(taken.status, 409);
    // The organiser can't assign a task to someone outside the Pact.
    assert.equal((await t.call('PATCH', `/pacts/${sarahsBirthday}/tasks/${open.id}`, abraham.accessToken, { assigneeId: outsider.user.id })).status, 400);
    // A budget line from another Pact can't be attached.
    const apt = await t.call('GET', `/pacts/${newApartment}`, abraham.accessToken);
    const foreignLine = apt.body.data.pact.budget[0].id;
    assert.equal((await t.call('POST', `/pacts/${sarahsBirthday}/tasks`, abraham.accessToken, { title: 'x', budgetItemId: foreignLine })).status, 400);
    // Budget is organiser-only, and can't drop below what's been raised.
    assert.equal((await t.call('POST', `/pacts/${sarahsBirthday}/budget`, sarah.accessToken, { name: 'Extra', amount: 100000 })).status, 403);
    const small = await t.call('POST', '/pacts', abraham.accessToken, {
      title: 'Budget floor', category: 'dinner', deadline: future(9), budget: [{ name: 'Food', amount: 500000 }, { name: 'Drinks', amount: 500000 }],
    });
    const smallId = small.body.data.pact.id;
    await t.call('POST', `/pacts/${smallId}/contributions`, abraham.accessToken, { amount: 800000, pin: '1357' });
    const shrink = await t.call('PATCH', `/pacts/${smallId}/budget/${small.body.data.pact.budget[0].id}`, abraham.accessToken, { amount: 100 });
    assert.equal(shrink.status, 400);
    assert.equal(shrink.body.error.code, 'budget_below_raised');
    // Growing the budget raises the target to match.
    const grow = await t.call('POST', `/pacts/${smallId}/budget`, abraham.accessToken, { name: 'Cake', amount: 300000 });
    assert.equal(grow.body.data.pact.target, 1300000);
    // Finishing your own task records it in the activity.
    const done = await t.call('PATCH', `/pacts/${sarahsBirthday}/tasks/${open.id}`, sarah.accessToken, { status: 'done' });
    assert.equal(done.body.data.pact.tasks.find((x: { id: string }) => x.id === open.id).status, 'done');
    assert.ok(done.body.data.activities.some((a: { type: string }) => a.type === 'task_done'));
  });

  it('splits the rest as an ask, never a charge', async () => {
    assert.equal((await t.call('POST', `/pacts/${sarahsBirthday}/split-rest`, sarah.accessToken, {})).status, 403);
    const before = (await t.call('GET', '/wallet', sarah.accessToken)).body.balance;
    const r = await t.call('POST', `/pacts/${sarahsBirthday}/split-rest`, abraham.accessToken, {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const me = r.body.data.pact.members.find((m: { userId: string }) => m.userId === sarah.user.id);
    assert.ok(me.requestedAmount > 0);
    assert.equal((await t.call('GET', '/wallet', sarah.accessToken)).body.balance, before, 'split the rest must not move money');
    assert.equal((await t.call('POST', `/pacts/${sarahsBirthday}/split-rest`, abraham.accessToken, {})).status, 409);
  });

  /* ---------------- uploads ---------------- */

  it('accepts only real images from the organiser, strips metadata, and keeps them private', async () => {
    const created = await t.call('POST', '/pacts', abraham.accessToken, { title: 'Photo test', category: 'event', deadline: future(5), target: 100000 });
    const id = created.body.data.pact.id;
    const code = created.body.data.pact.inviteCode;
    await t.call('POST', `/invites/${code}/join`, sarah.accessToken, {});
    const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#3dd68c' } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'secret location' } } })
      .toBuffer();
    const upload = (token: string, body: Buffer, type = 'image/jpeg') =>
      t.app.inject({ method: 'POST', url: `/api/pacts/${id}/memory/photos`, headers: { authorization: `Bearer ${token}`, 'content-type': type }, payload: body });

    // Too early: the goal isn't reached and the day hasn't passed.
    assert.equal((await upload(abraham.accessToken, jpeg)).statusCode, 400);
    await t.call('POST', `/pacts/${id}/contributions`, abraham.accessToken, { amount: 100000, pin: '1357' });

    // An executable dressed up as a PNG, and an unsupported type.
    assert.equal((await upload(abraham.accessToken, Buffer.from('MZ\x90\x00 this is not an image'), 'image/png')).statusCode, 415);
    assert.equal((await upload(abraham.accessToken, Buffer.from('#!/bin/sh\nrm -rf /'), 'application/x-sh')).statusCode, 415);
    // Members can view but not upload.
    assert.equal((await upload(sarah.accessToken, jpeg)).statusCode, 403);

    const ok = await upload(abraham.accessToken, jpeg);
    assert.equal(ok.statusCode, 200, ok.body);
    const photoId = JSON.parse(ok.body).data.pact.memory.photoIds[0];
    const got = await t.app.inject({ method: 'GET', url: `/api/pacts/${id}/memory/photos/${photoId}`, headers: { authorization: `Bearer ${sarah.accessToken}` } });
    assert.equal(got.statusCode, 200);
    assert.equal(got.headers['content-type'], 'image/webp');
    const meta = await sharp(got.rawPayload).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.exif, undefined, 'EXIF metadata survived');
    // Outsiders and signed-out visitors can't fetch it.
    assert.equal((await t.app.inject({ method: 'GET', url: `/api/pacts/${id}/memory/photos/${photoId}`, headers: { authorization: `Bearer ${outsider.accessToken}` } })).statusCode, 404);
    assert.equal((await t.app.inject({ method: 'GET', url: `/api/pacts/${id}/memory/photos/${photoId}` })).statusCode, 401);
    // At most six.
    for (let i = 0; i < 5; i++) await upload(abraham.accessToken, jpeg);
    assert.equal((await upload(abraham.accessToken, jpeg)).statusCode, 400);
  });

  /* ---------------- abuse, enumeration, admin ---------------- */

  it('answers the same for new and existing numbers (no account enumeration)', async () => {
    const existing = await t.call('POST', '/auth/otp/request', undefined, { phone: '08010000004' });
    const fresh = await t.call('POST', '/auth/otp/request', undefined, { phone: '08034567812' });
    assert.equal(existing.status, 200);
    assert.deepEqual(Object.keys(existing.body).sort(), Object.keys(fresh.body).sort());
    assert.ok(!('isNewUser' in existing.body));
  });

  it('rate limits PIN reset codes and holds withdrawals after a reset', async () => {
    const u = await t.signIn('08037773333', { firstName: 'Reset', lastName: 'Tester', pin: '2468' });
    const other = await t.signIn('08037773333', undefined, true); // a second device
    const first = await t.call('POST', '/me/pin/reset/request', u.accessToken, {});
    assert.equal(first.status, 200);
    assert.equal((await t.call('POST', '/me/pin/reset', u.accessToken, { code: '000000', newPin: '8642' })).status, 400);
    const ok = await t.call('POST', '/me/pin/reset', u.accessToken, { code: first.body.devCode, newPin: '8642' });
    assert.equal(ok.status, 200);
    // The other device was signed out.
    assert.equal((await t.call('GET', '/me', other.accessToken)).status, 401);
    // Withdrawals and bank changes are held.
    const bank = await t.call('POST', '/bank-accounts', u.accessToken, { bankCode: '058', accountNumber: '0123456781', pin: '8642' });
    assert.equal(bank.status, 423);
    // Spamming reset codes hits the per-number limit (sign-in codes count too).
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await t.call('POST', '/me/pin/reset/request', u.accessToken, {})).status);
    assert.ok(codes.includes(429), `no limit hit: ${codes}`);
  });

  it('hides operations routes and has no admin or debug endpoints', async () => {
    for (const url of ['/api/ops/reconcile', '/api/admin', '/api/debug', '/api/test', '/.env', '/api/../.env', '/package.json']) {
      const r = await t.app.inject({ method: 'GET', url });
      assert.equal(r.statusCode, 404, `${url} -> ${r.statusCode}`);
    }
  });

  it('sets no-store on API responses and refuses foreign origins', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${sarah.accessToken}`, origin: 'https://evil.example' } });
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['access-control-allow-origin'], undefined);
    const refresh = await t.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { 'content-type': 'application/json', 'x-pact-client': 'web', origin: 'https://evil.example', cookie: 'pact_rt=anything' }, payload: '{}' });
    assert.equal(refresh.statusCode, 401);
  });

  /* ---------------- data rights ---------------- */

  it('exports your data without secrets, and closes an account safely', async () => {
    const u = await t.signIn('08038884444', { firstName: 'Close', lastName: 'Tester', pin: '2468' });
    const exp = await t.call('GET', '/me/export', u.accessToken);
    assert.equal(exp.status, 200);
    assert.ok(!/pin_hash|scrypt\$|bvn_hash/.test(JSON.stringify(exp.body)));
    // Money is never stranded: a funded wallet can't be closed.
    await t.topUp(u.accessToken, 1000);
    const blocked = await t.call('POST', '/me/close', u.accessToken, { pin: '2468' });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'wallet_not_empty');
    const empty = await t.signIn('08038885555', { firstName: 'Empty', lastName: 'Wallet', pin: '2468' });
    assert.equal((await t.call('POST', '/me/close', empty.accessToken, { pin: '2468' })).status, 200);
    assert.equal((await t.call('GET', '/me', empty.accessToken)).status, 401);
    // The number can sign up again as a new account.
    const again = await t.signIn('08038885555', { firstName: 'New', lastName: 'Person', pin: '2468' }, true);
    assert.notEqual(again.user.id, empty.user.id);
  });
});

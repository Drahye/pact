import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { seedDemo } from '../src/db/seed.js';
import { resetLedgerCache } from '../src/modules/ledger.js';
import { runDueJobs } from '../src/jobs/worker.js';

export async function setup(opts: { seed?: boolean; now?: () => Date } = {}) {
  resetLedgerCache();
  const config = loadConfig({ NODE_ENV: 'test', SEED_DEMO: 'false', RATE_LIMIT_ENABLED: 'false' });
  const db = await createDb(config);
  await migrate(db);
  let clock = opts.now ?? (() => new Date());
  const { app, ctx } = await buildApp({ config, db, now: () => clock() });
  if (opts.seed) await seedDemo(ctx);
  await app.ready();

  let keyN = 0;
  const call = async (method: string, url: string, token?: string, body?: unknown, extra: Record<string, string> = {}) => {
    const res = await app.inject({
      method: method as 'GET',
      url: `/api${url}`,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'idempotency-key': `test-key-${Date.now()}-${keyN++}` } : {}),
        ...extra,
      },
      payload: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null, headers: res.headers };
  };

  /** Full phone sign in; signs up with a profile when the number is new. */
  const sessions = new Map<string, { accessToken: string; refreshToken: string; user: { id: string } }>();
  const signIn = async (phone: string, profile = { firstName: 'Test', lastName: 'User', pin: '2468' }, fresh = false) => {
    if (!fresh && sessions.has(phone)) return sessions.get(phone)!;
    const out = await signInRaw(phone, profile);
    sessions.set(phone, out);
    return out;
  };
  const signInRaw = async (phone: string, profile: { firstName: string; lastName: string; pin: string }) => {
    const otp = await call('POST', '/auth/otp/request', undefined, { phone });
    if (otp.status !== 200) throw new Error(`otp request ${otp.status} ${JSON.stringify(otp.body)}`);
    const v = await call('POST', '/auth/otp/verify', undefined, { phone, code: otp.body.devCode });
    if (v.body.status === 'signed_in') return v.body as { accessToken: string; refreshToken: string; user: { id: string } };
    const s = await call('POST', '/auth/signup', undefined, { signupToken: v.body.signupToken, ...profile });
    if (s.status !== 200) throw new Error(`signup ${s.status} ${JSON.stringify(s.body)}`);
    return s.body as { accessToken: string; refreshToken: string; user: { id: string } };
  };

  /** Tops up through the sandbox checkout, which delivers a signed webhook. */
  const topUp = async (token: string, naira: number, channel = 'bank_transfer') => {
    const t = await call('POST', '/wallet/topups', token, { amount: naira * 100, channel });
    if (t.status !== 200) throw new Error(`topup ${t.status} ${JSON.stringify(t.body)}`);
    const done = await call('POST', `/sandbox/checkout/${t.body.reference}/complete`, token, { outcome: 'success' });
    return done.body;
  };

  const drain = async () => {
    while ((await runDueJobs(ctx, 50)) > 0);
  };

  return {
    app, ctx, db, call, signIn, topUp, drain,
    setClock: (fn: () => Date) => (clock = fn),
    close: async () => { await app.close(); await db.close(); },
  };
}

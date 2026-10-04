/**
 * Nothing that opens an account may reach the log: codes, the OAuth state and code, the signup continuation.
 * (The development `log` senders print codes on purpose; real senders do not, so they are stood in for here.)
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sanitizeUrl } from '../src/lib/logSafe.js';
import type { GoogleClaims, GoogleClient } from '../src/payments/google.js';
import { setup } from './helpers.js';

describe('sign-in secrets stay out of the log', () => {
  const lines: string[] = [];
  let t: Awaited<ReturnType<typeof setup>>;
  const fake: GoogleClient = {
    enabled: true,
    authorizeUrl: ({ state }) => `https://accounts.example/auth?state=${state}`,
    exchange: async (): Promise<GoogleClaims> => ({ sub: 'log-sub', email: 'log@example.com', emailVerified: true, firstName: 'Lo', lastName: 'Gg' }),
  };
  before(async () => {
    t = await setup({ logStream: { write: (l) => void lines.push(l) }, google: fake, env: { LOG_LEVEL: 'info', ENABLE_GOOGLE_AUTH: 'true', GOOGLE_PROVIDER: 'fake' }, email: { send: async () => undefined }, sms: { send: async () => undefined } });
  });
  after(async () => t.close());

  it('drops the Google callback query from request URLs', () => {
    assert.equal(sanitizeUrl('/api/auth/google/callback?state=abc&code=4%2F0AXYZ'), '/api/auth/google/callback?[REDACTED]');
    assert.equal(sanitizeUrl('/api/auth/google/start'), '/api/auth/google/start');
  });

  it('never writes an email code, a SMS code, the OAuth state or code, or a signup credential', async () => {
    const email = await t.call('POST', '/auth/email/request', undefined, { email: 'logs@example.com' });
    await t.call('POST', '/auth/email/verify', undefined, { email: 'logs@example.com', code: email.body.devCode });
    const sms = await t.call('POST', '/auth/otp/request', undefined, { phone: '08039990001' });
    await t.call('POST', '/auth/otp/verify', undefined, { phone: '08039990001', code: sms.body.devCode });
    const start = await t.app.inject({ method: 'POST', url: '/api/auth/google/start', headers: { 'content-type': 'application/json' }, payload: '{}' });
    const state = new URL(JSON.parse(start.body).url).searchParams.get('state')!;
    const cb = await t.app.inject({ method: 'GET', url: `/api/auth/google/callback?state=${state}&code=SECRETAUTHCODE`, headers: { cookie: `pact_oa=${state}` } });
    const signupCookie = ([] as string[]).concat((cb.headers['set-cookie'] as string[] | string | undefined) ?? []).find((c) => c.startsWith('pact_su='))!.split(';')[0].slice(8);
    const all = lines.join('\n');
    for (const secret of [email.body.devCode, sms.body.devCode, state, 'SECRETAUTHCODE', signupCookie]) assert.ok(!all.includes(secret), `a secret reached the log: ${String(secret).slice(0, 6)}…`);
    assert.ok(all.includes('/api/auth/google/callback'), 'the route itself is still logged');
  });
});

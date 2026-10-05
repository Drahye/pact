/** The beta default: Google is built and tested but switched off. Nothing offers it and its routes refuse to start. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { GoogleClient } from '../src/payments/google.js';
import { setup } from './helpers.js';

describe('Google sign-in is off by default', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  // A client that would happily work: only the flag stands between it and the user.
  const eager: GoogleClient = { enabled: true, authorizeUrl: ({ state }) => `https://accounts.example/auth?state=${state}`, exchange: async () => ({ sub: 's', email: 'a@example.com', emailVerified: true, firstName: 'A', lastName: 'B' }) };
  before(async () => {
    t = await setup({ google: eager });
  });
  after(async () => t.close());

  it('does not advertise Google to the app, and keeps email on', async () => {
    const cfg = (await t.call('GET', '/config')).body;
    assert.deepEqual(cfg.auth, { google: false, stytchGoogle: false, email: true, phone: true });
  });

  it('refuses to start, to link, and to finish a Google sign-in', async () => {
    assert.equal((await t.call('POST', '/auth/google/start', undefined, {})).status, 503);
    const u = await t.signIn('08037770099', { firstName: 'Off', lastName: 'Flag', pin: '2468' });
    assert.equal((await t.call('POST', '/me/identities/google/start', u.accessToken, {})).status, 503);
    const cb = await t.app.inject({ method: 'GET', url: '/api/auth/google/callback?state=abc&code=xyz', headers: { cookie: 'pact_oa=abc' } });
    assert.match(String(cb.headers.location), /\/app\/auth\/welcome\?error=google$/);
  });

  it('leaves email and phone sign-in untouched', async () => {
    const req = await t.call('POST', '/auth/email/request', undefined, { email: 'beta@example.com' });
    const v = await t.call('POST', '/auth/email/verify', undefined, { email: 'beta@example.com', code: req.body.devCode });
    assert.equal(v.body.status, 'needs_profile');
    const again = await t.signIn('08037770099', undefined, true);
    assert.ok(again.user.id);
  });
});

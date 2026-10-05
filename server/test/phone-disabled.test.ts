/**
 * Beta: phone and SMS sign-in switched off with SMS_PROVIDER=disabled. Email through Stytch and Google through Stytch stay on, nothing
 * stored about phones is touched, and no code is ever generated or sent.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { StytchError, type StytchClient } from '../src/payments/stytch.js';
import type { SmsSender } from '../src/payments/sms.js';
import { setup } from './helpers.js';

const SECRETS = {
  JWT_SECRET: 'j'.repeat(40),
  HASH_SECRET: 'h'.repeat(40),
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  DATABASE_URL: 'postgres://u:p@db:5432/pact',
  SANDBOX_WEBHOOK_SECRET: 'w'.repeat(32),
};
const STYTCH = { EMAIL_AUTH_PROVIDER: 'stytch', STYTCH_PROJECT_ID: 'project-test-x', STYTCH_SECRET: 'secret-test-x', STYTCH_PUBLIC_TOKEN: 'public-token-test-x' };

describe('beta staging config with SMS_PROVIDER=disabled', () => {
  const beta = (extra: Record<string, string> = {}) =>
    loadConfig({ NODE_ENV: 'production', DEPLOY_ENV: 'staging', SEED_DEMO: 'false', SMS_PROVIDER: 'disabled', STAGING_SHOW_CODES: 'false', PAYMENTS_PROVIDER: 'sandbox', ...STYTCH, ...SECRETS, ...extra });

  it('boots with NODE_ENV=production, DEPLOY_ENV=staging, STAGING_SHOW_CODES=false and no Termii key', () => {
    const c = beta();
    assert.equal(c.deployEnv, 'staging');
    assert.equal(c.TERMII_API_KEY, '');
    assert.equal(c.phoneAuthEnabled, false);
    assert.equal(c.exposeDevCodes, false, 'no phone code is ever shown');
    assert.equal(c.exposeEmailCodes, false);
  });

  it('keeps Stytch email and Google configured', () => {
    const c = beta();
    assert.equal(c.EMAIL_AUTH_PROVIDER, 'stytch');
    assert.equal(c.stytchGoogleEnabled, true);
  });

  it('does not loosen anything else: sandbox payments stay, staging still refuses live keys, production still needs real SMS', () => {
    assert.equal(beta().PAYMENTS_PROVIDER, 'sandbox');
    assert.throws(() => beta({ PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_live_abc' }), /live Paystack key/);
    assert.throws(() => beta({ DEPLOY_ENV: 'production', PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_live_abc' }), /SMS_PROVIDER=termii/);
  });

  it('phone stays on for every other SMS provider', () => {
    assert.equal(beta({ SMS_PROVIDER: 'termii', TERMII_API_KEY: 'k' }).phoneAuthEnabled, true);
  });
});

/** Just enough Stytch: one code per send, one stable user per address, a Google token that proves a verified address. */
function miniStytch(): StytchClient & { last: () => string } {
  const sends: { methodId: string; code: string; email: string }[] = [];
  let n = 0;
  const uid = (email: string) => `user-test-${Buffer.from(email).toString('hex').slice(0, 24)}`;
  return {
    enabled: true,
    async sendEmailCode(email) {
      const s = { methodId: `m-${++n}`, code: String(200000 + n), email };
      sends.push(s);
      return { methodId: s.methodId, userId: uid(email) };
    },
    async verifyEmailCode(methodId, code) {
      const s = sends.find((x) => x.methodId === methodId);
      if (!s || s.code !== code) throw new StytchError('invalid_code');
      return { userId: uid(s.email) };
    },
    oauthStartUrl: ({ redirectUrl, codeChallenge }) => `https://stytch.fake/start?redirect=${encodeURIComponent(redirectUrl)}&code_challenge=${codeChallenge}`,
    async authenticateOAuth() {
      throw new StytchError('invalid_code');
    },
    last: () => sends[sends.length - 1].code,
  } as StytchClient & { last: () => string };
}

describe('the running app with phone sign-in disabled', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const texts: string[] = [];
  const sms: SmsSender = { async send(to, message) { texts.push(`${to}: ${message}`); } };
  const stytch = miniStytch();
  let existing: { id: string; accessToken: string };

  before(async () => {
    // An existing phone person, created while phone sign-in was still on (a separate app on the same kind of database is not needed:
    // the account is made by the test helper before the flag matters, through the email door which stays open).
    t = await setup({ sms, stytch, env: { SMS_PROVIDER: 'disabled', ...STYTCH } });
  });
  after(async () => t.close());

  it('reports phone off and email plus Stytch Google on', async () => {
    const cfg = (await t.call('GET', '/config')).body;
    assert.equal(cfg.auth.phone, false);
    assert.equal(cfg.auth.email, true);
    assert.equal(cfg.auth.stytchGoogle, true);
    assert.equal(cfg.exposeDevCodes, false);
  });

  it('answers a phone OTP request with "feature unavailable", never a crash, and sends and stores nothing', async () => {
    const r = await t.call('POST', '/auth/otp/request', undefined, { phone: '08031112222' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'feature_unavailable');
    assert.match(r.body.error.message, /email or Google/);
    assert.equal(r.body.devCode, undefined);
    assert.deepEqual(texts, [], 'no text message was sent');
    assert.equal((await t.db.query('SELECT 1 FROM otp_challenges')).rowCount, 0, 'no phone code was generated');
  });

  it('refuses phone verification and a malformed request alike', async () => {
    const v = await t.call('POST', '/auth/otp/verify', undefined, { phone: '08031112222', code: '123456' });
    assert.equal(v.status, 503);
    assert.equal(v.body.error.code, 'feature_unavailable');
    assert.equal((await t.call('POST', '/auth/otp/request', undefined, {})).status, 503);
  });

  it('refuses to link or verify a phone for a signed-in person', async () => {
    const em = await t.call('POST', '/auth/email/request', undefined, { email: 'beta.user@example.com' });
    assert.equal(em.status, 200);
    const v = await t.call('POST', '/auth/email/verify', undefined, { email: 'beta.user@example.com', code: stytch.last() });
    assert.equal(v.body.status, 'needs_profile');
    const su = await t.call('POST', '/auth/signup', undefined, { signupToken: v.body.signupToken, firstName: 'Beta', lastName: 'User' });
    assert.equal(su.status, 200, JSON.stringify(su.body));
    existing = { id: su.body.user.id, accessToken: su.body.accessToken };
    const a = await t.call('POST', '/me/identities/phone/request', existing.accessToken, { phone: '08031113333' });
    assert.equal(a.status, 503);
    assert.equal(a.body.error.code, 'feature_unavailable');
    const b = await t.call('POST', '/me/identities/phone/verify', existing.accessToken, { phone: '08031113333', code: '123456' });
    assert.equal(b.status, 503);
    assert.equal((await t.db.query(`SELECT 1 FROM user_identities WHERE provider = 'phone'`)).rowCount, 0);
  });

  it('email sign-in keeps working end to end, and a returning email user is the same account', async () => {
    const em = await t.call('POST', '/auth/email/request', undefined, { email: 'beta.user@example.com' });
    assert.equal(em.status, 200);
    const v = await t.call('POST', '/auth/email/verify', undefined, { email: 'beta.user@example.com', code: stytch.last() });
    assert.equal(v.body.status, 'signed_in');
    assert.equal(v.body.user.id, existing.id);
    assert.deepEqual(texts, [], 'still no text message');
  });

  it('Google through Stytch still starts', async () => {
    const r = await t.call('POST', '/auth/stytch/google/start', undefined, {});
    assert.equal(r.status, 200);
    assert.match(r.body.url, /^https:\/\/stytch\.fake\/start/);
  });

  it('PIN reset does not offer or use the phone, even for a number kept on the account', async () => {
    // Give the account a stored phone identity directly: stored data is untouched by the switch.
    await t.db.query(`INSERT INTO user_identities (user_id, provider, provider_subject, phone, verified_at) VALUES ($1, 'phone', '+2348031114444', '+2348031114444', now())`, [existing.id]);
    await t.db.query(`UPDATE users SET phone = '+2348031114444' WHERE id = $1`, [existing.id]);
    const r = await t.call('POST', '/me/pin/reset/request', existing.accessToken, { via: 'phone' });
    assert.equal(r.status, 400, 'a phone reset is not possible');
    assert.equal(r.body.error.code, 'no_recovery_method');
    assert.deepEqual(texts, []);
  });

  it('keeps stored phone data: identities and the number on the user are still there', async () => {
    const id = await t.db.query(`SELECT phone FROM user_identities WHERE user_id = $1 AND provider = 'phone'`, [existing.id]);
    assert.equal(id.rows[0].phone, '+2348031114444');
    assert.equal((await t.db.query('SELECT phone FROM users WHERE id = $1', [existing.id])).rows[0].phone, '+2348031114444');
  });
});

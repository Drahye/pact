/**
 * Deployment guards: nothing can accidentally run real money with sandbox settings, or sandbox with live ones.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';

const SECRETS = {
  JWT_SECRET: 'j'.repeat(40),
  HASH_SECRET: 'h'.repeat(40),
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  DATABASE_URL: 'postgres://u:p@db:5432/pact',
  SANDBOX_WEBHOOK_SECRET: 'w'.repeat(32),
};
const prod = (extra: Record<string, string> = {}) => loadConfig({ NODE_ENV: 'production', SEED_DEMO: 'false', ...SECRETS, ...extra });
const refuses = (extra: Record<string, string>, pattern: RegExp) => assert.throws(() => prod(extra), pattern);

describe('deployment guards', () => {
  it('accepts a correct production config', () => {
    const c = prod({ DEPLOY_ENV: 'production', PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_live_abc', SMS_PROVIDER: 'termii', TERMII_API_KEY: 'k' });
    assert.equal(c.deployEnv, 'production');
    assert.equal(c.exposeDevCodes, false);
  });

  it('defaults to production when NODE_ENV=production, and refuses sandbox there', () => {
    refuses({ PAYMENTS_PROVIDER: 'sandbox', SMS_PROVIDER: 'termii' }, /production needs PAYMENTS_PROVIDER=paystack/);
    refuses({ PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_test_abc', SMS_PROVIDER: 'termii' }, /live Paystack key/);
    refuses({ PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_live_abc', SMS_PROVIDER: 'log' }, /SMS_PROVIDER=termii/);
    refuses({ PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_live_abc', SMS_PROVIDER: 'termii', PAYSTACK_BASE_URL: 'https://evil.example' }, /PAYSTACK_BASE_URL/);
    refuses({ PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_live_abc', SMS_PROVIDER: 'termii', STAGING_SHOW_CODES: 'true' }, /only for DEPLOY_ENV=staging/);
  });

  it('never lets a live key run outside production', () => {
    refuses({ DEPLOY_ENV: 'staging', PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_live_abc', SMS_PROVIDER: 'termii' }, /sk_live_\) is not allowed when DEPLOY_ENV=staging/);
    assert.throws(() => loadConfig({ NODE_ENV: 'development', PAYSTACK_SECRET_KEY: 'sk_live_abc' }), /live Paystack key/);
    refuses({ DEPLOY_ENV: 'staging', PAYMENTS_PROVIDER: 'sandbox', PAYSTACK_SECRET_KEY: 'sk_live_abc', SMS_PROVIDER: 'termii' }, /live Paystack key/);
    assert.throws(() => loadConfig({ NODE_ENV: 'development', DEPLOY_ENV: 'production' }), /DEPLOY_ENV=production needs NODE_ENV=production/);
    assert.throws(() => prod({ DEPLOY_ENV: 'development' }), /needs DEPLOY_ENV=staging or production/);
    assert.throws(() => prod({ PAYSTACK_SECRET_KEY: 'whatever' }), /sk_live_ or sk_test_/);
  });

  it('runs staging on sandbox payments or Paystack test mode only', () => {
    const sandbox = prod({ DEPLOY_ENV: 'staging', PAYMENTS_PROVIDER: 'sandbox', SMS_PROVIDER: 'termii', TERMII_API_KEY: 'k' });
    assert.equal(sandbox.deployEnv, 'staging');
    assert.equal(sandbox.exposeDevCodes, false);
    prod({ DEPLOY_ENV: 'staging', PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_test_abc', SMS_PROVIDER: 'termii', TERMII_API_KEY: 'k' });
    refuses({ DEPLOY_ENV: 'staging', PAYMENTS_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: '', SMS_PROVIDER: 'termii' }, /test key \(sk_test_\)/);
    refuses({ DEPLOY_ENV: 'staging', PAYMENTS_PROVIDER: 'sandbox', SANDBOX_WEBHOOK_SECRET: 'sandbox-webhook-secret', SMS_PROVIDER: 'termii' }, /SANDBOX_WEBHOOK_SECRET/);
  });

  it('shows SMS codes in staging only when asked, for closed tests with test data', () => {
    refuses({ DEPLOY_ENV: 'staging', PAYMENTS_PROVIDER: 'sandbox', SMS_PROVIDER: 'log' }, /STAGING_SHOW_CODES=true/);
    const c = prod({ DEPLOY_ENV: 'staging', PAYMENTS_PROVIDER: 'sandbox', SMS_PROVIDER: 'log', STAGING_SHOW_CODES: 'true' });
    assert.equal(c.exposeDevCodes, true);
  });

  it('still refuses default secrets in any production-mode deployment', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production', DEPLOY_ENV: 'staging', PAYMENTS_PROVIDER: 'sandbox', SMS_PROVIDER: 'termii', DATABASE_URL: 'postgres://x' }), /JWT_SECRET must be set/);
  });
});

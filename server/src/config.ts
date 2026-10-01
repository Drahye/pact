import { z } from 'zod';

/**
 * Every setting comes from the environment and is validated once at boot.
 * Production refuses to start with development secrets or the sandbox provider
 * unless that is explicitly allowed.
 */
/** `z.coerce.boolean()` treats the string "false" as true, so booleans are parsed explicitly. */
const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0', ''])
    .default(fallback ? 'true' : 'false')
    .transform((v) => (v === '' ? fallback : v === 'true' || v === '1'));

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().default('0.0.0.0'),
  /** Public origin of the web app, used for CORS, checkout callbacks and invite links. */
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Extra comma-separated origins allowed by CORS (for example a staging web app). */
  CORS_ORIGINS: z.string().default(''),

  /** Postgres connection string. When empty, an embedded Postgres (PGlite) is used for local development. */
  DATABASE_URL: z.string().default(''),
  PGLITE_DIR: z.string().default('.data/pglite'),
  /**
   * Optional separate credential for migrations (the table owner). When set, the API runs
   * migrations with it at boot and serves traffic with DATABASE_URL, a role that can't
   * change the schema. See server/src/db/roles.sql.
   */
  MIGRATION_DATABASE_URL: z.string().default(''),
  DB_POOL_MAX: z.coerce.number().int().default(10),

  /** HMAC key for access tokens. 32+ bytes of randomness in production. */
  JWT_SECRET: z.string().min(32).default('dev-only-jwt-secret-change-me-0000000000'),
  /** Keyed hashing for OTP codes, refresh tokens and lookups of sensitive values. */
  HASH_SECRET: z.string().min(32).default('dev-only-hash-secret-change-me-000000000'),
  /** 32-byte key, base64, for AES-256-GCM encryption of bank account numbers and BVNs. */
  DATA_ENCRYPTION_KEY: z.string().default('ZGV2LW9ubHktZW5jcnlwdGlvbi1rZXktMzJieXRlcyE='),

  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),

  PAYMENTS_PROVIDER: z.enum(['sandbox', 'paystack']).default('sandbox'),
  PAYSTACK_SECRET_KEY: z.string().default(''),
  /** Partner bank for Pact account numbers (Paystack dedicated accounts). */
  PAYSTACK_DVA_BANK: z.string().default('wema-bank'),
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
  /** Secret the sandbox provider signs its webhooks with. */
  SANDBOX_WEBHOOK_SECRET: z.string().default('sandbox-webhook-secret'),
  /**
   * Which deployment this is. `production` handles real money and real data; `staging` is a hardened
   * copy for a closed beta that runs sandbox payments only. Defaults to production when NODE_ENV=production.
   */
  DEPLOY_ENV: z.enum(['development', 'staging', 'production']).optional(),
  /** Staging only: return SMS codes in API responses so a closed beta can run without an SMS sender. Test data only. */
  STAGING_SHOW_CODES: bool(false),

  /** SMS delivery for OTPs. `log` prints codes to the server log (development only). */
  SMS_PROVIDER: z.enum(['log', 'termii']).default('log'),
  TERMII_API_KEY: z.string().default(''),
  TERMII_SENDER_ID: z.string().default('PACT'),

  /** Run the background job worker inside the API process. Set false and run `npm run worker` to scale separately. */
  RUN_WORKER: bool(true),
  /** Serve the built web app from ./dist (single-container deploys). */
  SERVE_STATIC: bool(false),
  /** Seed demo people and Pacts on an empty database. */
  SEED_DEMO: bool(true),
  TRUST_PROXY: bool(false),
  /** Per-IP HTTP rate limits. Business limits (OTP per number, PIN attempts) always apply. */
  RATE_LIMIT_ENABLED: bool(true),
  /** Where per-IP counters live: postgres is shared by every instance; memory is per process. */
  RATE_LIMIT_STORE: z.enum(['postgres', 'memory']).default('postgres'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof Env> & { isProd: boolean; isTest: boolean; exposeDevCodes: boolean; deployEnv: 'development' | 'staging' | 'production' };

export function loadConfig(overrides: Partial<Record<keyof z.infer<typeof Env>, string>> = {}): Config {
  const parsed = Env.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';

  const deployEnv = env.DEPLOY_ENV ?? (isProd ? 'production' : 'development');
  const problems: string[] = [];
  const key = env.PAYSTACK_SECRET_KEY;

  // Whatever the environment: credentials and provider must agree, and live keys only ever run in production.
  if (key.startsWith('sk_live_') && deployEnv !== 'production') problems.push(`a live Paystack key (sk_live_) is not allowed when DEPLOY_ENV=${deployEnv}`);
  if (key && !/^sk_(live|test)_/.test(key)) problems.push('PAYSTACK_SECRET_KEY must start with sk_live_ or sk_test_');
  if (env.PAYMENTS_PROVIDER === 'sandbox' && key.startsWith('sk_live_')) problems.push('PAYMENTS_PROVIDER=sandbox with a live Paystack key: pick one');
  if (deployEnv === 'production' && !isProd) problems.push('DEPLOY_ENV=production needs NODE_ENV=production');
  if (isProd && deployEnv === 'development') problems.push('NODE_ENV=production needs DEPLOY_ENV=staging or production');
  if (env.STAGING_SHOW_CODES && deployEnv !== 'staging') problems.push('STAGING_SHOW_CODES is only for DEPLOY_ENV=staging');

  if (isProd) {
    if (env.JWT_SECRET.startsWith('dev-only')) problems.push('JWT_SECRET must be set');
    if (env.HASH_SECRET.startsWith('dev-only')) problems.push('HASH_SECRET must be set');
    if (env.DATA_ENCRYPTION_KEY === 'ZGV2LW9ubHktZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=') problems.push('DATA_ENCRYPTION_KEY must be set');
    if (!env.DATABASE_URL) problems.push('DATABASE_URL must point at Postgres');
    if (env.SANDBOX_WEBHOOK_SECRET === 'sandbox-webhook-secret' && env.PAYMENTS_PROVIDER === 'sandbox') problems.push('SANDBOX_WEBHOOK_SECRET must be set');
    if (deployEnv === 'production') {
      if (env.PAYMENTS_PROVIDER !== 'paystack') problems.push('production needs PAYMENTS_PROVIDER=paystack (sandbox payments are staging only)');
      if (!key.startsWith('sk_live_')) problems.push('production needs a live Paystack key (sk_live_)');
      if (env.PAYSTACK_BASE_URL !== 'https://api.paystack.co') problems.push('PAYSTACK_BASE_URL must be https://api.paystack.co in production');
      if (env.SMS_PROVIDER !== 'termii') problems.push('production needs SMS_PROVIDER=termii');
    }
    if (deployEnv === 'staging') {
      // Staging never moves real money: sandbox, or Paystack in test mode.
      if (env.PAYMENTS_PROVIDER === 'paystack' && !key.startsWith('sk_test_')) problems.push('staging with Paystack needs a test key (sk_test_)');
      if (env.SMS_PROVIDER === 'log' && !env.STAGING_SHOW_CODES) problems.push('staging needs SMS_PROVIDER=termii, or STAGING_SHOW_CODES=true for a closed test with test data only');
    }
    if (problems.length) throw new Error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
  } else if (problems.length) {
    throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  }
  if (Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64').length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
  }

  return {
    ...env,
    isProd,
    isTest: env.NODE_ENV === 'test',
    deployEnv,
    // OTP codes are returned in API responses only when SMS is not really sent: local development, or a staging beta that asked for it.
    exposeDevCodes: (!isProd && env.SMS_PROVIDER === 'log') || (deployEnv === 'staging' && env.STAGING_SHOW_CODES),
  };
}

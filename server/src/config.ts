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
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
  /** Secret the sandbox provider signs its webhooks with. */
  SANDBOX_WEBHOOK_SECRET: z.string().default('sandbox-webhook-secret'),
  ALLOW_SANDBOX_IN_PRODUCTION: bool(false),

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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof Env> & { isProd: boolean; isTest: boolean; exposeDevCodes: boolean };

export function loadConfig(overrides: Partial<Record<keyof z.infer<typeof Env>, string>> = {}): Config {
  const parsed = Env.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';

  if (isProd) {
    const problems: string[] = [];
    if (env.JWT_SECRET.startsWith('dev-only')) problems.push('JWT_SECRET must be set');
    if (env.HASH_SECRET.startsWith('dev-only')) problems.push('HASH_SECRET must be set');
    if (env.DATA_ENCRYPTION_KEY === 'ZGV2LW9ubHktZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=') problems.push('DATA_ENCRYPTION_KEY must be set');
    if (!env.DATABASE_URL) problems.push('DATABASE_URL must point at Postgres');
    if (env.PAYMENTS_PROVIDER === 'sandbox' && !env.ALLOW_SANDBOX_IN_PRODUCTION) problems.push('PAYMENTS_PROVIDER=sandbox is not allowed in production');
    if (env.PAYMENTS_PROVIDER === 'paystack' && !env.PAYSTACK_SECRET_KEY) problems.push('PAYSTACK_SECRET_KEY must be set');
    if (env.SMS_PROVIDER === 'log') problems.push('SMS_PROVIDER=log would print OTPs to logs');
    if (problems.length) throw new Error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
  }
  if (Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64').length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
  }

  return {
    ...env,
    isProd,
    isTest: env.NODE_ENV === 'test',
    // OTP codes are returned in API responses only when SMS is not really sent.
    exposeDevCodes: !isProd && env.SMS_PROVIDER === 'log',
  };
}

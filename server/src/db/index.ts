import type { PGlite } from '@electric-sql/pglite';
import type { Pool, PoolClient } from 'pg';
import type { Config } from '../config.js';

/**
 * A minimal query interface both drivers satisfy. Services only ever see `Queryable`,
 * so the same SQL runs on embedded PGlite in development and tests and on a pooled
 * Postgres connection in production.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  /** Runs a multi-statement script with no parameters (migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  /** Runs `fn` in a transaction. Serialization failures and deadlocks are retried. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /**
   * Runs `fn` in a transaction as the restricted `pact_app` role with row-level security
   * scoped to `userId`. Anything the policies don't allow is invisible or rejected, even
   * if the calling code forgets a check.
   */
  asUser<T>(userId: string, fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  driver: 'pglite' | 'pg';
}

const DATE_OID = 1082;
const INT8_OID = 20;
const NUMERIC_OID = 1700;

const toSafeNumber = (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`Integer outside the safe range: ${v}`);
  return n;
};

const RETRYABLE = new Set(['40001', '40P01']); // serialization_failure, deadlock_detected

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (i >= attempts || !code || !RETRYABLE.has(code)) throw err;
      await new Promise((r) => setTimeout(r, 20 * i + Math.random() * 30));
    }
  }
}

async function createPglite(dir: string | undefined): Promise<Omit<Db, 'asUser'>> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir) (await import('node:fs')).mkdirSync(dir, { recursive: true });
  const pg: PGlite = new PGlite(dir, {
    parsers: { [DATE_OID]: (v: string) => v, [INT8_OID]: toSafeNumber, [NUMERIC_OID]: (v: string) => Number(v) },
  });
  await pg.waitReady;
  const wrap = (q: Pick<PGlite, 'query' | 'exec'>): Queryable => ({
    async query(sql, params) {
      const r = await q.query(sql, params as unknown[]);
      // affectedRows is 0 for SELECTs, so count returned rows first.
      return { rows: r.rows as never[], rowCount: r.rows.length || r.affectedRows || 0 };
    },
    async exec(sql) {
      await q.exec(sql);
    },
  });
  // PGlite is a single connection: transactions are serialized through a queue so
  // concurrent requests behave like they would under row locks on a real server.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    driver: 'pglite',
    ...wrap(pg),
    tx(fn) {
      const run = chain.then(() => withRetry(() => pg.transaction((t) => fn(wrap(t)))));
      chain = run.catch(() => undefined);
      return run;
    },
    close: () => pg.close(),
  };
}

async function createPg(url: string, max: number): Promise<Omit<Db, 'asUser'>> {
  const pgMod = await import('pg');
  const { Pool, types } = pgMod.default ?? pgMod;
  types.setTypeParser(DATE_OID, (v: string) => v);
  types.setTypeParser(INT8_OID, toSafeNumber);
  types.setTypeParser(NUMERIC_OID, (v: string) => Number(v));
  const pool: Pool = new Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    ssl: /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: !/sslmode=require/.test(url) } : undefined,
  });
  const wrap = (c: Pool | PoolClient): Queryable => ({
    async query(sql, params) {
      const r = await c.query(sql, params as unknown[]);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    async exec(sql) {
      await c.query(sql);
    },
  });
  return {
    driver: 'pg',
    ...wrap(pool),
    tx: (fn) =>
      withRetry(async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn(wrap(client));
          await client.query('COMMIT');
          return out;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        } finally {
          client.release();
        }
      }),
    close: () => pool.end(),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function withUserScope(db: Omit<Db, 'asUser'>): Db {
  return {
    ...db,
    asUser(userId, fn) {
      if (!UUID_RE.test(userId)) throw new Error('asUser needs a user id');
      return db.tx(async (q) => {
        await q.query('SET LOCAL ROLE pact_app');
        await q.query(`SELECT set_config('pact.user_id', $1, true)`, [userId]);
        return fn(q);
      });
    },
  };
}

export async function createDb(config: Pick<Config, 'DATABASE_URL' | 'PGLITE_DIR' | 'DB_POOL_MAX' | 'isTest'>): Promise<Db> {
  if (config.DATABASE_URL) return withUserScope(await createPg(config.DATABASE_URL, config.DB_POOL_MAX));
  // Tests run on a fresh in-memory database each time.
  return withUserScope(await createPglite(config.isTest ? undefined : config.PGLITE_DIR));
}

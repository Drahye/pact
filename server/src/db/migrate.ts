import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Db } from './index.js';

const DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

/**
 * What the runtime role may do, re-applied after every migration run so new tables are
 * covered. Does nothing until an administrator has run roles.sql (no pact_service role).
 */
export const RUNTIME_GRANTS = `
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pact_service') THEN RETURN; END IF;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pact_service;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pact_service;
  -- Money and audit records are append-only, even for the runtime role.
  REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries, ledger_transactions, audit_log FROM pact_service;
  REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM pact_service;
  -- pact_service isn't the table owner, so RLS applies to it: give it a service policy
  -- on every table with RLS enabled.
  FOR t IN
    SELECT c.tablename FROM pg_tables c
    WHERE c.schemaname = 'public' AND c.rowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.tablename AND p.policyname = 'service_all')
  LOOP
    EXECUTE format('CREATE POLICY service_all ON public.%I FOR ALL TO pact_service USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;`;

/** Applies pending SQL migrations in filename order, each in its own transaction. */
export async function migrate(db: Db, log: (msg: string) => void = () => {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(DIR + file, 'utf8');
    await db.tx(async (q) => {
      // Advisory lock so two instances booting at once don't race on the same migration.
      if (db.driver === 'pg') await q.query('SELECT pg_advisory_xact_lock(727274)');
      const again = await q.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (again.rowCount) return;
      await q.exec(sql);
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    log(`applied migration ${file}`);
  }
  await db.exec(RUNTIME_GRANTS);
}

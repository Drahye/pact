import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Db } from './index.js';

const DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

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
}

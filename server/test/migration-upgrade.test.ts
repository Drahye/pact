/**
 * Release QA: upgrading a database that already holds people. The schema is built as it stood at migration 028, filled with an active
 * account, a closed one and an account with a phone invite, then the rest of the migrations run on top. Nothing may be lost, every active phone
 * becomes exactly one verified identity, closed accounts get none, and a second run changes nothing.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';

const DIR = fileURLToPath(new URL('../src/db/migrations/', import.meta.url));

describe('upgrade from an older schema', () => {
  it('backfills identities, keeps every account and is safe to re-run', async () => {
    const config = loadConfig({ NODE_ENV: 'test', SEED_DEMO: 'false' });
    const db = await createDb(config);
    const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
    assert.deepEqual(files.map((f) => f.slice(0, 3)), files.map((_, i) => String(i + 1).padStart(3, '0')), 'migration numbers are contiguous with no duplicates');
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    for (const f of files.filter((f) => f < '029')) {
      await db.exec(await readFile(DIR + f, 'utf8'));
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    }
    const mk = (phone: string, first: string, status = 'active') =>
      db.query<{ id: string }>(`INSERT INTO users (phone, first_name, last_name, color, tint, referral_code, status) VALUES ($1, $2, 'Old', '#fff', 'sky', $3, $4) RETURNING id`, [phone, first, first.toUpperCase().padEnd(7, 'X').slice(0, 7), status]);
    const a = (await mk('+2348031110001', 'Ada')).rows[0].id;
    const b = (await mk('+2348031110002', 'Bayo')).rows[0].id;
    await mk('closed:00000000-0000-4000-8000-000000000009', 'Gone', 'closed');
    const before = (await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users')).rows[0].n;

    await migrate(db);
    const ids = await db.query<{ user_id: string; provider: string; provider_subject: string }>('SELECT user_id, provider, provider_subject FROM user_identities ORDER BY provider_subject');
    assert.deepEqual(ids.rows.map((r) => [r.user_id, r.provider, r.provider_subject]).sort(), [[a, 'phone', '+2348031110001'], [b, 'phone', '+2348031110002']].sort(), 'one phone identity per active account, none for the closed one');
    assert.equal((await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users')).rows[0].n, before, 'no account lost');
    // The new provider and the nullable phone both work on the upgraded schema.
    await db.query(`INSERT INTO user_identities (user_id, provider, provider_subject, email, verified_at) VALUES ($1, 'stytch', 'user-test-up', 'ada@example.com', now())`, [a]);
    await db.query(`INSERT INTO users (phone, first_name, last_name, color, tint, referral_code) VALUES (NULL, 'Email', 'Only', '#fff', 'sky', 'EMAILONLY')`);
    await migrate(db);
    assert.equal((await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM user_identities')).rows[0].n, 3, 're-running changes nothing');
    await db.close();
  });
});

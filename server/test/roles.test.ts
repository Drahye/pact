/**
 * The production role model, applied the way an administrator would (roles.sql, then
 * migrations as pact_owner), and attacked as the runtime role. `npm run test:roles`
 * additionally runs every other test as pact_service.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createDb, type Db } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { useServiceRole } from './helpers.js';

const denied = (e: { code?: string }) => e.code === '42501';

describe('database roles: least privilege at runtime', () => {
  let db: Db;

  before(async () => {
    db = await createDb(loadConfig({ NODE_ENV: 'test', SEED_DEMO: 'false' }));
    await migrate(db);
    await useServiceRole(db);
  });
  after(async () => {
    await db.close();
  });

  it('runs as pact_service: not a superuser, no RLS bypass, not an owner', async () => {
    const me = await db.query<{ u: string; su: boolean; bypass: boolean; app: boolean }>(
      `SELECT current_user AS u, r.rolsuper AS su, r.rolbypassrls AS bypass, pg_has_role('pact_service', 'pact_app', 'MEMBER') AS app
       FROM pg_roles r WHERE r.rolname = current_user`,
    );
    assert.deepEqual(me.rows[0], { u: 'pact_service', su: false, bypass: false, app: true });
    const others = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner <> 'pact_owner'`);
    assert.equal(others.rowCount, 0, 'every table belongs to pact_owner');
  });

  it('cannot change the schema', async () => {
    for (const sql of [
      'CREATE TABLE sneaky (id int)',
      'ALTER TABLE users ADD COLUMN sneaky text',
      'DROP TABLE notifications',
      'ALTER TABLE accounts DISABLE ROW LEVEL SECURITY',
      'CREATE POLICY sneaky ON accounts FOR ALL TO pact_app USING (true)',
    ]) {
      await assert.rejects(db.query(sql), denied, sql);
    }
  });

  it('cannot rewrite or erase money and audit records', async () => {
    for (const sql of [
      'UPDATE ledger_entries SET amount = amount + 1',
      'DELETE FROM ledger_entries',
      'UPDATE ledger_transactions SET description = $$x$$',
      'DELETE FROM ledger_transactions',
      'UPDATE audit_log SET action = $$x$$',
      'DELETE FROM audit_log',
      'TRUNCATE audit_log',
      'TRUNCATE ledger_entries CASCADE',
      `INSERT INTO schema_migrations (name) VALUES ('999_fake.sql')`,
      'DELETE FROM schema_migrations',
    ]) {
      await assert.rejects(db.query(sql), denied, sql);
    }
  });

  it('still reads and writes ordinary data, including serial ids', async () => {
    const job = await db.query<{ id: number }>(`INSERT INTO jobs (type) VALUES ('roles-test') RETURNING id`);
    assert.equal(job.rowCount, 1);
    await db.query('UPDATE jobs SET attempts = 1 WHERE id = $1', [job.rows[0].id]);
    await db.query('DELETE FROM jobs WHERE id = $1', [job.rows[0].id]);
  });

  it('covers tables added by later migrations', async () => {
    await db.exec('SET ROLE pact_owner');
    await db.exec('CREATE TABLE later_feature (id int PRIMARY KEY); ALTER TABLE later_feature ENABLE ROW LEVEL SECURITY;');
    await migrate(db);
    await db.exec('SET ROLE pact_service');
    await db.query('INSERT INTO later_feature (id) VALUES (1)');
    assert.equal((await db.query('SELECT id FROM later_feature')).rowCount, 1);
  });
});

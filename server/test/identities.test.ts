/** The identity model: phone backfill, uniqueness, many identities per user, and closure. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addIdentity, findIdentity, maskEmail, normalizeEmail } from '../src/modules/identities.js';
import { setup } from './helpers.js';

describe('identities', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  before(async () => {
    t = await setup();
  });
  after(async () => t.close());

  it('creates a phone identity when an account is created, and signs in through it', async () => {
    const a = await t.signIn('08031110001', { firstName: 'Ana', lastName: 'One', pin: '2468' });
    const id = await findIdentity(t.db, 'phone', '+2348031110001');
    assert.equal(id?.user_id, a.user.id);
    assert.ok(id?.verified_at);
    const again = await t.signIn('08031110001', undefined, true);
    assert.equal(again.user.id, a.user.id, 'same account');
  });

  it('backfills existing phone users as verified identities (the migration statement)', async () => {
    const b = await t.signIn('08031110002', { firstName: 'Ben', lastName: 'Two', pin: '2468' });
    await t.db.query(`DELETE FROM user_identities WHERE user_id = $1`, [b.user.id]);
    await t.db.query(
      `INSERT INTO user_identities (user_id, provider, provider_subject, phone, verified_at, created_at)
       SELECT id, 'phone', phone, phone, created_at, created_at FROM users WHERE id = $1 AND phone NOT LIKE 'closed:%' AND status <> 'closed'`,
      [b.user.id],
    );
    const id = await findIdentity(t.db, 'phone', '+2348031110002');
    assert.equal(id?.user_id, b.user.id);
  });

  it('allows several identities for one user but never one identity for two users', async () => {
    const a = await t.signIn('08031110001');
    const c = await t.signIn('08031110003', { firstName: 'Cy', lastName: 'Three', pin: '2468' });
    await addIdentity(t.db, a.user.id, 'email', 'ana@example.com', { email: 'ana@example.com' });
    await addIdentity(t.db, a.user.id, 'google', 'sub-123', { email: 'ana@example.com' });
    const n = (await t.db.query('SELECT COUNT(*)::int AS n FROM user_identities WHERE user_id = $1', [a.user.id])).rows[0].n;
    assert.equal(n, 3);
    await addIdentity(t.db, a.user.id, 'email', 'ana@example.com'); // idempotent for the owner
    await assert.rejects(() => addIdentity(t.db, c.user.id, 'email', 'ana@example.com'), /already connected/);
    await assert.rejects(() => t.db.query(`INSERT INTO user_identities (user_id, provider, provider_subject, verified_at) VALUES ($1, 'email', 'ana@example.com', now())`, [c.user.id]));
  });

  it('closing an account erases its identities, so nothing can sign in to it', async () => {
    const d = await t.signIn('08031110004', { firstName: 'Di', lastName: 'Four', pin: '2468' });
    assert.equal((await t.call('POST', '/me/close', d.accessToken, { pin: '2468' })).status, 200);
    assert.equal(await findIdentity(t.db, 'phone', '+2348031110004'), null);
    const n = (await t.db.query('SELECT COUNT(*)::int AS n FROM user_identities WHERE user_id = $1', [d.user.id])).rows[0].n;
    assert.equal(n, 0);
  });

  it('normalises email conservatively', () => {
    assert.equal(normalizeEmail('  Ana.B+tag@GMAIL.com '), 'Ana.B+tag@gmail.com');
    assert.equal(normalizeEmail('a@b'), null);
    assert.equal(normalizeEmail('no-at'), null);
    assert.equal(normalizeEmail('two words@x.com'), null);
    assert.equal(maskEmail('anthony@example.com'), 'a•••@example.com');
  });
});

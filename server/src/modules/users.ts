import type { MeDTO, NotificationDTO, Page, SessionDTO } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import { encrypt, keyedHash } from '../lib/crypto.js';
import { AppError, badRequest } from '../lib/errors.js';
import { getUser, toMe } from './auth.js';
import { audit, notify } from './platform.js';

export async function me(ctx: Ctx, userId: string): Promise<MeDTO> {
  return toMe(await getUser(ctx.db, userId));
}

export async function updateProfile(ctx: Ctx, userId: string, input: { firstName?: string; lastName?: string }) {
  // Names are locked once a BVN is verified: they must keep matching the identity on file.
  const u = await getUser(ctx.db, userId);
  if (u.kyc_tier >= 2 && (input.firstName || input.lastName)) {
    throw badRequest('name_locked', 'Your name is verified with your BVN. Contact support to change it.');
  }
  await ctx.db.query('UPDATE users SET first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name), updated_at = now() WHERE id = $1', [
    userId,
    input.firstName ?? null,
    input.lastName ?? null,
  ]);
  return me(ctx, userId);
}

/**
 * Tier 2 via BVN. In production this calls an identity provider (for example
 * Paystack Identity, Smile ID or Dojah) to match name and date of birth.
 * The sandbox accepts any BVN except all-zeros. Only a keyed hash and the last
 * four digits are kept; the encrypted value supports regulatory lookups.
 */
export async function verifyBvn(ctx: Ctx, userId: string, bvn: string, dateOfBirth: string, meta: ReqMeta) {
  const u = await getUser(ctx.db, userId);
  if (u.kyc_tier >= 2) return me(ctx, userId);
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  const age = (ctx.now().getTime() - dob.getTime()) / (365.25 * 86_400_000);
  if (!(age >= 18 && age < 120)) throw badRequest('underage', 'You need to be 18 or older to verify.');
  if (/^0+$/.test(bvn)) throw new AppError(422, 'bvn_not_found', 'We couldn’t verify that BVN. Check the number and date of birth.');
  // The sandbox check accepts any BVN, so it never runs in production, even on a demo deploy.
  if (ctx.provider.name !== 'sandbox' || ctx.config.isProd) {
    throw new AppError(503, 'kyc_unavailable', 'Identity verification is being set up. Try again soon.');
  }
  const hash = keyedHash(ctx.config.HASH_SECRET, `bvn:${bvn}`);
  const taken = await ctx.db.query('SELECT 1 FROM users WHERE bvn_hash = $1 AND id <> $2', [hash, userId]);
  if (taken.rowCount) throw new AppError(409, 'bvn_in_use', 'This BVN is linked to another PACT account.');
  await ctx.db.tx(async (q) => {
    await q.query(`UPDATE users SET kyc_tier = 2, bvn_hash = $2, bvn_last4 = $3, updated_at = now() WHERE id = $1`, [userId, hash, bvn.slice(-4)]);
    await audit(q, { actorId: userId, action: 'kyc.bvn_verified', targetType: 'user', targetId: userId, ip: meta.ip, metadata: { enc: encrypt(ctx.config.DATA_ENCRYPTION_KEY, bvn) } });
    await notify(q, [userId], { type: 'security', title: 'You’re verified', body: 'Higher limits are on, and you can now release Pact funds.' });
  });
  return me(ctx, userId);
}

export async function listSessions(ctx: Ctx, userId: string, currentSessionId: string): Promise<SessionDTO[]> {
  const r = await ctx.db.query<{ id: string; device: string; ip: string | null; created_at: Date; last_used_at: Date }>(
    `SELECT id, device, ip, created_at, last_used_at FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_used_at DESC`,
    [userId],
  );
  return r.rows.map((s) => ({
    id: s.id,
    device: s.device,
    ip: s.ip,
    createdAt: s.created_at.toISOString(),
    lastUsedAt: s.last_used_at.toISOString(),
    current: s.id === currentSessionId,
  }));
}

export async function listNotifications(ctx: Ctx, userId: string, cursor?: string): Promise<Page<NotificationDTO> & { unread: number }> {
  const before = cursor ? new Date(cursor) : null;
  const r = await ctx.db.query<{ id: string; type: string; title: string; body: string; pact_id: string | null; read_at: Date | null; created_at: Date }>(
    `SELECT id, type, title, body, pact_id, read_at, created_at FROM notifications
      WHERE user_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2) ORDER BY created_at DESC LIMIT 41`,
    [userId, before],
  );
  const unread = await ctx.db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
  const rows = r.rows.slice(0, 40);
  return {
    items: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, pactId: n.pact_id, readAt: n.read_at?.toISOString() ?? null, createdAt: n.created_at.toISOString() })),
    nextCursor: r.rows.length > 40 ? rows[rows.length - 1].created_at.toISOString() : null,
    unread: unread.rows[0].n,
  };
}

export async function markNotificationsRead(ctx: Ctx, userId: string, ids?: string[]) {
  if (ids?.length) await ctx.db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL', [userId, ids]);
  else await ctx.db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
}


/* --------------------------------------------------------------------------
   Data rights: a copy of your data, and closing your account
   -------------------------------------------------------------------------- */

/** Everything PACT holds about you that you can see in the app, as one JSON document. */
export async function exportData(ctx: Ctx, userId: string) {
  const u = await getUser(ctx.db, userId);
  const [memberships, txns, banks, sessions, notes] = await Promise.all([
    ctx.db.query(
      `SELECT p.title, p.status, p.target_amount, p.deadline, m.role, m.status AS member_status, m.contributed, m.joined_at
         FROM pact_members m JOIN pacts p ON p.id = m.pact_id WHERE m.user_id = $1 ORDER BY m.created_at`,
      [userId],
    ),
    ctx.db.query(
      `SELECT t.kind, e.amount, e.balance_after, t.description, t.reference, t.created_at
         FROM ledger_entries e JOIN ledger_transactions t ON t.id = e.transaction_id
         JOIN accounts a ON a.id = e.account_id WHERE a.kind = 'user_wallet' AND a.owner_id = $1 ORDER BY e.id`,
      [userId],
    ),
    ctx.db.query(`SELECT bank_name, last4, account_name, created_at, deleted_at FROM bank_accounts WHERE user_id = $1`, [userId]),
    ctx.db.query(`SELECT device, ip, created_at, last_used_at, revoked_at FROM sessions WHERE user_id = $1 ORDER BY created_at`, [userId]),
    ctx.db.query(`SELECT type, title, body, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at`, [userId]),
  ]);
  await audit(ctx.db, { actorId: userId, action: 'privacy.data_exported' });
  return {
    generatedAt: ctx.now().toISOString(),
    note: 'Amounts are in kobo (100 kobo = 1 naira).',
    profile: { ...toMe(u), bvnLast4: u.bvn_last4 },
    pacts: memberships.rows,
    walletTransactions: txns.rows,
    bankAccounts: banks.rows,
    sessions: sessions.rows,
    notifications: notes.rows,
  };
}

/**
 * Closing an account. Money is never stranded: the wallet must be empty and no open
 * Pact may still hold your money or depend on you as organiser. Personal details are
 * erased; transaction records are kept because financial regulations require it.
 */
export async function closeAccount(ctx: Ctx, userId: string, meta: ReqMeta) {
  const blockers = await ctx.db.query<{ balance: number; organizing: number; invested: number; payouts: number }>(
    `SELECT
       (SELECT balance FROM accounts WHERE kind = 'user_wallet' AND owner_id = $1) AS balance,
       (SELECT COUNT(*)::int FROM pacts WHERE organizer_id = $1 AND status IN ('open', 'funded')) AS organizing,
       (SELECT COUNT(*)::int FROM pact_members m JOIN pacts p ON p.id = m.pact_id
         WHERE m.user_id = $1 AND m.contributed > 0 AND p.status IN ('open', 'funded')) AS invested,
       (SELECT COUNT(*)::int FROM withdrawals WHERE user_id = $1 AND status IN ('pending', 'processing')) AS payouts`,
    [userId],
  );
  const b = blockers.rows[0];
  if ((b.balance ?? 0) > 0) throw new AppError(409, 'wallet_not_empty', 'Withdraw your balance first, then close your account.');
  if (b.payouts > 0) throw new AppError(409, 'payout_pending', 'Wait for your withdrawal to finish, then try again.');
  if (b.organizing > 0) throw new AppError(409, 'organizing_pacts', 'Close or release the Pacts you organise first.');
  if (b.invested > 0) throw new AppError(409, 'money_in_pacts', 'You have money in a Pact that’s still open. Close your account once it finishes.');

  const u = await getUser(ctx.db, userId);
  await ctx.db.tx(async (q) => {
    await q.query(
      `UPDATE users SET status = 'closed', closed_at = now(), phone = 'closed:' || id::text,
         first_name = 'Former', last_name = 'member', photo_url = NULL, pin_hash = NULL,
         bvn_hash = NULL, updated_at = now() WHERE id = $1`,
      [userId],
    );
    await q.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    await q.query(`UPDATE bank_accounts SET deleted_at = COALESCE(deleted_at, now()), account_number_enc = 'erased', account_name = 'erased', recipient_code = NULL WHERE user_id = $1`, [userId]);
    await q.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
    await q.query(`UPDATE pact_members SET status = 'left' WHERE user_id = $1 AND status = 'invited'`, [userId]);
    // Kept for fraud and anti-money-laundering lookups: a keyed hash, never the number itself.
    await audit(q, { actorId: userId, action: 'account.closed', ip: meta.ip, metadata: { phoneHash: keyedHash(ctx.config.HASH_SECRET, `phone:${u.phone}`) } });
  });
}

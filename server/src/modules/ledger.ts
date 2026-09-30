import type { Queryable } from '../db/index.js';
import { AppError, conflict } from '../lib/errors.js';

export type SystemAccount = 'provider_clearing' | 'payout_clearing' | 'fee_revenue' | 'suspense';

export interface Posting {
  accountId: string;
  /** + increases the account balance, - decreases it. */
  amount: number;
}

export interface PostInput {
  kind:
    | 'topup' | 'contribution' | 'pact_release' | 'withdrawal' | 'withdrawal_reversal' | 'refund' | 'fee' | 'adjustment'
    | 'bank_transfer_in' | 'transfer_return' | 'vendor_payment' | 'vendor_payment_reversal' | 'guest_refund' | 'payout_settled';
  /** Unique per movement of money. Posting the same reference twice is rejected. */
  reference: string;
  description: string;
  userId?: string | null;
  pactId?: string | null;
  metadata?: Record<string, unknown>;
  postings: Posting[];
}

export class InsufficientFunds extends AppError {
  constructor(public accountId: string) {
    super(402, 'insufficient_funds', 'There isn’t enough money in the wallet for that.');
  }
}

const systemIds = new Map<string, string>();

export async function systemAccountId(q: Queryable, code: SystemAccount): Promise<string> {
  const cached = systemIds.get(code);
  if (cached) return cached;
  const r = await q.query<{ id: string }>('SELECT id FROM accounts WHERE code = $1', [code]);
  if (!r.rows[0]) throw new Error(`Missing system account ${code}`);
  systemIds.set(code, r.rows[0].id);
  return r.rows[0].id;
}

/** Clears the process cache; used by tests that create a fresh database. */
export const resetLedgerCache = () => systemIds.clear();

export async function createAccount(q: Queryable, kind: 'user_wallet' | 'pact_pool', ownerId: string): Promise<string> {
  const r = await q.query<{ id: string }>(
    `INSERT INTO accounts (kind, owner_id) VALUES ($1, $2)
     ON CONFLICT (kind, owner_id) DO UPDATE SET kind = EXCLUDED.kind RETURNING id`,
    [kind, ownerId],
  );
  return r.rows[0].id;
}

export async function walletAccountId(q: Queryable, userId: string): Promise<string> {
  const r = await q.query<{ id: string }>(`SELECT id FROM accounts WHERE kind = 'user_wallet' AND owner_id = $1`, [userId]);
  if (r.rows[0]) return r.rows[0].id;
  return createAccount(q, 'user_wallet', userId);
}

/**
 * Posts one balanced ledger transaction. Must run inside a DB transaction.
 *
 * - Postings must sum to zero (also enforced by a deferred trigger at commit).
 * - Accounts are locked in a stable order (by id) to avoid deadlocks between
 *   concurrent postings that touch the same accounts.
 * - Non-negative accounts are checked under the lock, so two concurrent
 *   contributions can never overdraw a wallet.
 */
export async function post(q: Queryable, input: PostInput): Promise<{ transactionId: string; balances: Map<string, number> }> {
  const merged = new Map<string, number>();
  for (const p of input.postings) {
    if (!Number.isSafeInteger(p.amount)) throw new Error('Ledger amounts must be integer kobo');
    merged.set(p.accountId, (merged.get(p.accountId) ?? 0) + p.amount);
  }
  for (const [id, amt] of merged) if (amt === 0) merged.delete(id);
  const sum = [...merged.values()].reduce((a, b) => a + b, 0);
  if (sum !== 0 || merged.size < 2) throw new Error(`Unbalanced posting for ${input.reference}`);

  const ids = [...merged.keys()].sort();
  const locked = await q.query<{ id: string; balance: number; allow_negative: boolean }>(
    'SELECT id, balance, allow_negative FROM accounts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [ids],
  );
  if (locked.rows.length !== ids.length) throw new Error('Unknown account in posting');

  for (const acct of locked.rows) {
    const next = acct.balance + (merged.get(acct.id) ?? 0);
    if (next < 0 && !acct.allow_negative) throw new InsufficientFunds(acct.id);
  }

  const tx = await q.query<{ id: string }>(
    `INSERT INTO ledger_transactions (kind, reference, description, user_id, pact_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (reference) DO NOTHING RETURNING id`,
    [input.kind, input.reference, input.description, input.userId ?? null, input.pactId ?? null, JSON.stringify(input.metadata ?? {})],
  );
  if (!tx.rows[0]) throw conflict('duplicate_reference', 'This payment was already processed.');
  const transactionId = tx.rows[0].id;

  const balances = new Map<string, number>();
  for (const id of ids) {
    const amount = merged.get(id)!;
    const upd = await q.query<{ balance: number }>('UPDATE accounts SET balance = balance + $2 WHERE id = $1 RETURNING balance', [id, amount]);
    const balanceAfter = upd.rows[0].balance;
    balances.set(id, balanceAfter);
    await q.query('INSERT INTO ledger_entries (transaction_id, account_id, amount, balance_after) VALUES ($1, $2, $3, $4)', [
      transactionId,
      id,
      amount,
      balanceAfter,
    ]);
  }
  return { transactionId, balances };
}

export async function balanceOf(q: Queryable, accountId: string): Promise<number> {
  const r = await q.query<{ balance: number }>('SELECT balance FROM accounts WHERE id = $1', [accountId]);
  return r.rows[0]?.balance ?? 0;
}

/**
 * Reconciliation: every account's cached balance must equal the sum of its entries,
 * and the whole ledger must sum to zero. Run by the worker and exposed to ops.
 */
export async function reconcile(q: Queryable) {
  const drift = await q.query<{ id: string; balance: number; computed: number }>(
    `SELECT a.id, a.balance, COALESCE(SUM(e.amount), 0)::bigint AS computed
       FROM accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id
      GROUP BY a.id HAVING a.balance <> COALESCE(SUM(e.amount), 0)`,
  );
  const total = await q.query<{ total: number }>('SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM ledger_entries');
  return { ok: drift.rows.length === 0 && total.rows[0].total === 0, drift: drift.rows, total: total.rows[0].total };
}

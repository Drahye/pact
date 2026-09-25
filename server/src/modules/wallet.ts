import type { BankAccountDTO, Page, TopupDTO, WalletDTO, WalletTxnDTO, WithdrawalDTO } from '../../../shared/contracts.js';
import { TIER_LIMITS, WITHDRAWAL_FEE, topupFee, type KycTier } from '../../../shared/policy.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { decrypt, encrypt, keyedHash, randomCode } from '../lib/crypto.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { formatNgn } from '../lib/money.js';
import { lagosDayStart } from '../lib/time.js';
import { assertNoResetHold, getUser, verifyPin } from './auth.js';
import { post, systemAccountId, walletAccountId } from './ledger.js';
import { audit, enqueue, notify } from './platform.js';

const ref = (prefix: string) => `${prefix}_${randomCode(18)}`;

/* --------------------------------------------------------------------------
   Balance, limits and history
   -------------------------------------------------------------------------- */

async function usageToday(q: Queryable, userId: string, now: Date) {
  const since = lagosDayStart(now);
  const r = await q.query<{ topup: number; withdrawn: number; pending_topup: number }>(
    `SELECT
       COALESCE((SELECT SUM(amount) FROM topups WHERE user_id = $1 AND status = 'succeeded' AND completed_at >= $2), 0)::bigint AS topup,
       COALESCE((SELECT SUM(amount) FROM topups WHERE user_id = $1 AND status = 'pending' AND created_at >= $2), 0)::bigint AS pending_topup,
       COALESCE((SELECT SUM(amount) FROM withdrawals WHERE user_id = $1 AND status <> 'failed' AND created_at >= $2), 0)::bigint AS withdrawn`,
    [userId, since],
  );
  return r.rows[0];
}

export async function getWallet(ctx: Ctx, userId: string): Promise<WalletDTO> {
  const user = await getUser(ctx.db, userId);
  const acct = await walletAccountId(ctx.db, userId);
  const bal = await ctx.db.query<{ balance: number }>('SELECT balance FROM accounts WHERE id = $1', [acct]);
  const usage = await usageToday(ctx.db, userId, ctx.now());
  return { balance: bal.rows[0].balance, currency: 'NGN', tier: user.kyc_tier, usage: { topupToday: usage.topup, withdrawnToday: usage.withdrawn } };
}

export async function listTransactions(ctx: Ctx, userId: string, cursor: string | undefined, limit = 30): Promise<Page<WalletTxnDTO>> {
  const acct = await walletAccountId(ctx.db, userId);
  const before = cursor ? Number(cursor) : null;
  if (cursor && !Number.isSafeInteger(before)) throw badRequest('bad_cursor', 'Invalid cursor.');
  const r = await ctx.db.query<{
    entry_id: number;
    tx_id: string;
    kind: WalletTxnDTO['kind'];
    amount: number;
    balance_after: number;
    description: string;
    reference: string;
    pact_id: string | null;
    pact_title: string | null;
    created_at: Date;
  }>(
    `SELECT e.id AS entry_id, t.id AS tx_id, t.kind, e.amount, e.balance_after, t.description, t.reference, t.pact_id, p.title AS pact_title, t.created_at
       FROM ledger_entries e
       JOIN ledger_transactions t ON t.id = e.transaction_id
       LEFT JOIN pacts p ON p.id = t.pact_id
      WHERE e.account_id = $1 AND ($2::bigint IS NULL OR e.id < $2)
      ORDER BY e.id DESC LIMIT $3`,
    [acct, before, limit + 1],
  );
  const rows = r.rows.slice(0, limit);
  return {
    items: rows.map((x) => ({
      id: x.tx_id,
      kind: x.kind,
      amount: x.amount,
      balanceAfter: x.balance_after,
      description: x.description,
      reference: x.reference,
      pactId: x.pact_id,
      pactTitle: x.pact_title,
      createdAt: x.created_at.toISOString(),
    })),
    nextCursor: r.rows.length > limit ? String(rows[rows.length - 1].entry_id) : null,
  };
}

/* --------------------------------------------------------------------------
   Top-ups: checkout at the processor, credited only on a verified webhook
   (or a server-side verification call), never on the client's word.
   -------------------------------------------------------------------------- */

interface TopupRow {
  id: string;
  user_id: string;
  reference: string;
  channel: 'card' | 'bank_transfer';
  amount: number;
  fee: number;
  status: TopupDTO['status'];
  checkout_url: string | null;
  failure_reason: string | null;
  created_at: Date;
}

const toTopup = (t: TopupRow): TopupDTO => ({
  reference: t.reference,
  status: t.status,
  channel: t.channel,
  amount: t.amount,
  fee: t.fee,
  checkoutUrl: t.status === 'pending' ? t.checkout_url : null,
  failureReason: t.failure_reason,
  createdAt: t.created_at.toISOString(),
});

export async function initTopup(ctx: Ctx, userId: string, amount: number, channel: 'card' | 'bank_transfer', meta: ReqMeta): Promise<TopupDTO> {
  const user = await getUser(ctx.db, userId);
  const limits = TIER_LIMITS[user.kyc_tier as KycTier];
  const wallet = await getWallet(ctx, userId);
  const usage = await usageToday(ctx.db, userId, ctx.now());
  if (usage.topup + usage.pending_topup + amount > limits.dailyTopup) {
    throw new AppError(422, 'limit_daily_topup', `That’s over your daily top-up limit of ${formatNgn(limits.dailyTopup)}.`, {
      remaining: Math.max(0, limits.dailyTopup - usage.topup),
      tier: user.kyc_tier,
    });
  }
  if (wallet.balance + amount > limits.maxBalance) {
    throw new AppError(422, 'limit_max_balance', `Your wallet can hold up to ${formatNgn(limits.maxBalance)} at your level.`, {
      remaining: Math.max(0, limits.maxBalance - wallet.balance),
      tier: user.kyc_tier,
    });
  }

  const reference = ref('TOP');
  const fee = topupFee(amount, channel);
  const { checkoutUrl } = await ctx.provider.initializeCheckout({
    reference,
    amount: amount + fee,
    channel,
    customer: { id: userId, phone: user.phone, name: `${user.first_name} ${user.last_name}` },
    callbackUrl: `${ctx.config.APP_ORIGIN}/app/wallet/topup/${reference}`,
  });
  const r = await ctx.db.query<TopupRow>(
    `INSERT INTO topups (user_id, reference, provider, channel, amount, fee, checkout_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, reference, ctx.provider.name, channel, amount, fee, checkoutUrl],
  );
  await audit(ctx.db, { actorId: userId, action: 'topup.initiated', targetType: 'topup', targetId: reference, ip: meta.ip, metadata: { amount, fee, channel } });
  // If neither the webhook nor the app ever report back, the worker asks the processor directly.
  await enqueue(ctx.db, 'topup.reconcile', { reference }, { runAt: new Date(ctx.now().getTime() + 10 * 60_000), dedupeKey: `topup:${reference}` });
  return toTopup(r.rows[0]);
}

/** Idempotent: safe to call from the webhook, the status poll and the reconcile job at once. */
export async function settleTopup(ctx: Ctx, reference: string, amountPaid: number | null, source: string) {
  return ctx.db.tx(async (q) => {
    const r = await q.query<TopupRow>('SELECT * FROM topups WHERE reference = $1 FOR UPDATE', [reference]);
    const t = r.rows[0];
    if (!t) throw notFound('Top-up');
    if (t.status !== 'pending') return toTopup(t);
    if (amountPaid !== null && amountPaid !== t.amount + t.fee) {
      await q.query(`UPDATE topups SET status = 'failed', failure_reason = 'amount_mismatch', completed_at = now() WHERE id = $1`, [t.id]);
      await audit(q, { action: 'topup.amount_mismatch', targetType: 'topup', targetId: reference, metadata: { expected: t.amount + t.fee, paid: amountPaid, source } });
      await enqueue(q, 'ops.alert', { kind: 'topup_amount_mismatch', reference, expected: t.amount + t.fee, paid: amountPaid });
      return toTopup({ ...t, status: 'failed', failure_reason: 'amount_mismatch' });
    }
    const wallet = await walletAccountId(q, t.user_id);
    const clearing = await systemAccountId(q, 'provider_clearing');
    const fees = await systemAccountId(q, 'fee_revenue');
    const postings = [
      { accountId: clearing, amount: -(t.amount + t.fee) },
      { accountId: wallet, amount: t.amount },
    ];
    if (t.fee) postings.push({ accountId: fees, amount: t.fee });
    const { transactionId } = await post(q, {
      kind: 'topup',
      reference: `topup:${reference}`,
      description: t.channel === 'card' ? 'Top up by card' : 'Top up by bank transfer',
      userId: t.user_id,
      metadata: { source, fee: t.fee },
      postings,
    });
    await q.query(`UPDATE topups SET status = 'succeeded', completed_at = now(), ledger_tx_id = $2 WHERE id = $1`, [t.id, transactionId]);
    await notify(q, [t.user_id], { type: 'topup', title: 'Wallet topped up', body: `${formatNgn(t.amount)} is in your wallet.` });
    return toTopup({ ...t, status: 'succeeded' });
  });
}

export async function failTopup(ctx: Ctx, reference: string, reason: string | null) {
  await ctx.db.query(`UPDATE topups SET status = 'failed', failure_reason = $2, completed_at = now() WHERE reference = $1 AND status = 'pending'`, [
    reference,
    (reason ?? 'Payment was not completed').slice(0, 200),
  ]);
}

export async function getTopup(ctx: Ctx, userId: string, reference: string): Promise<TopupDTO> {
  const r = await ctx.db.query<TopupRow>('SELECT * FROM topups WHERE reference = $1 AND user_id = $2', [reference, userId]);
  const t = r.rows[0];
  if (!t) throw notFound('Top-up');
  if (t.status === 'pending') return reconcileTopup(ctx, t);
  return toTopup(t);
}

/** Asks the processor for the truth. Used when a webhook is late. */
export async function reconcileTopup(ctx: Ctx, t: TopupRow): Promise<TopupDTO> {
  const status = await ctx.provider.verifyCheckout(t.reference);
  if (status.status === 'succeeded' && status.currency && status.currency !== 'NGN') {
    await failTopup(ctx, t.reference, 'currency_mismatch');
    return toTopup({ ...t, status: 'failed', failure_reason: 'currency_mismatch' });
  }
  if (status.status === 'succeeded') return settleTopup(ctx, t.reference, status.amountPaid, 'verify');
  if (status.status === 'failed') {
    await failTopup(ctx, t.reference, status.reason);
    return toTopup({ ...t, status: 'failed', failure_reason: status.reason });
  }
  // Abandoned checkouts expire after an hour.
  if (ctx.now().getTime() - t.created_at.getTime() > 60 * 60_000) {
    await ctx.db.query(`UPDATE topups SET status = 'abandoned', completed_at = now() WHERE id = $1 AND status = 'pending'`, [t.id]);
    return toTopup({ ...t, status: 'abandoned' });
  }
  return toTopup(t);
}

export async function reconcileTopupByRef(ctx: Ctx, reference: string) {
  const r = await ctx.db.query<TopupRow>('SELECT * FROM topups WHERE reference = $1', [reference]);
  if (r.rows[0]?.status === 'pending') {
    const out = await reconcileTopup(ctx, r.rows[0]);
    // Still pending: check again later.
    if (out.status === 'pending') await enqueue(ctx.db, 'topup.reconcile', { reference }, { runAt: new Date(ctx.now().getTime() + 15 * 60_000) });
  }
}

/* --------------------------------------------------------------------------
   Bank accounts: withdrawals only go to accounts in the customer's own name
   -------------------------------------------------------------------------- */

interface BankRow {
  id: string;
  user_id: string;
  bank_code: string;
  bank_name: string;
  account_number_enc: string;
  last4: string;
  account_name: string;
  recipient_code: string | null;
  is_default: boolean;
}

const toBank = (b: BankRow): BankAccountDTO => ({
  id: b.id,
  bankCode: b.bank_code,
  bankName: b.bank_name,
  last4: b.last4,
  accountName: b.account_name,
  isDefault: b.is_default,
});

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1);

/** At least two of the customer's names, or their full first and last name, must appear on the account. */
export function namesMatch(first: string, last: string, accountName: string) {
  const acct = new Set(tokens(accountName));
  const mine = [...tokens(first), ...tokens(last)];
  const hits = mine.filter((t) => acct.has(t)).length;
  return hits >= Math.min(2, mine.length);
}

export async function listBanks(ctx: Ctx) {
  return ctx.provider.listBanks();
}

export async function resolveBankAccount(ctx: Ctx, userId: string, bankCode: string, accountNumber: string) {
  const user = await getUser(ctx.db, userId);
  const { accountName } = await ctx.provider.resolveAccount(bankCode, accountNumber, `${user.first_name} ${user.last_name}`);
  return { accountName, matchesProfile: namesMatch(user.first_name, user.last_name, accountName) };
}

export async function listBankAccounts(ctx: Ctx, userId: string): Promise<BankAccountDTO[]> {
  const r = await ctx.db.query<BankRow>('SELECT * FROM bank_accounts WHERE user_id = $1 AND deleted_at IS NULL ORDER BY is_default DESC, created_at', [userId]);
  return r.rows.map(toBank);
}

export async function addBankAccount(ctx: Ctx, userId: string, input: { bankCode: string; accountNumber: string; pin: string }, meta: ReqMeta) {
  await verifyPin(ctx, userId, input.pin, meta);
  const user = await getUser(ctx.db, userId);
  assertNoResetHold(ctx, user);
  const banks = await ctx.provider.listBanks();
  const bank = banks.find((b) => b.code === input.bankCode);
  if (!bank) throw badRequest('bank_not_found', 'Choose a bank from the list.');
  const { accountName } = await ctx.provider.resolveAccount(input.bankCode, input.accountNumber, `${user.first_name} ${user.last_name}`);
  if (!namesMatch(user.first_name, user.last_name, accountName)) {
    throw new AppError(422, 'name_mismatch', `This account is in the name ${accountName}. You can only withdraw to an account in your own name.`);
  }
  const count = await ctx.db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM bank_accounts WHERE user_id = $1 AND deleted_at IS NULL', [userId]);
  if (count.rows[0].n >= 5) throw badRequest('too_many_accounts', 'You can save up to 5 bank accounts.');
  const { recipientCode } = await ctx.provider.createRecipient({ bankCode: input.bankCode, accountNumber: input.accountNumber, accountName });
  const hash = keyedHash(ctx.config.HASH_SECRET, `acct:${input.bankCode}:${input.accountNumber}`);
  const r = await ctx.db.query<BankRow>(
    `INSERT INTO bank_accounts (user_id, bank_code, bank_name, account_number_enc, account_number_hash, last4, account_name, recipient_code, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, account_number_hash, bank_code) DO UPDATE SET deleted_at = NULL, account_name = EXCLUDED.account_name, recipient_code = EXCLUDED.recipient_code
     RETURNING *`,
    [userId, bank.code, bank.name, encrypt(ctx.config.DATA_ENCRYPTION_KEY, input.accountNumber), hash, input.accountNumber.slice(-4), accountName, recipientCode, count.rows[0].n === 0],
  );
  await audit(ctx.db, { actorId: userId, action: 'bank_account.added', targetType: 'bank_account', targetId: r.rows[0].id, ip: meta.ip, metadata: { bank: bank.code, last4: input.accountNumber.slice(-4) } });
  await notify(ctx.db, [userId], { type: 'security', title: 'Bank account added', body: `${bank.name} ••${input.accountNumber.slice(-4)} can now receive withdrawals.` });
  return toBank(r.rows[0]);
}

export async function removeBankAccount(ctx: Ctx, userId: string, id: string, meta: ReqMeta) {
  const r = await ctx.db.query('UPDATE bank_accounts SET deleted_at = now(), is_default = false WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, userId]);
  if (!r.rowCount) throw notFound('Bank account');
  await audit(ctx.db, { actorId: userId, action: 'bank_account.removed', targetType: 'bank_account', targetId: id, ip: meta.ip });
}

/* --------------------------------------------------------------------------
   Withdrawals: debit first (so the money can't be spent twice), pay out from
   the outbox, and reverse the debit if the transfer fails.
   -------------------------------------------------------------------------- */

interface WithdrawalRow {
  id: string;
  user_id: string;
  bank_account_id: string;
  reference: string;
  amount: number;
  fee: number;
  status: WithdrawalDTO['status'];
  failure_reason: string | null;
  created_at: Date;
}

async function toWithdrawal(q: Queryable, w: WithdrawalRow): Promise<WithdrawalDTO> {
  const b = await q.query<BankRow>('SELECT * FROM bank_accounts WHERE id = $1', [w.bank_account_id]);
  return {
    id: w.id,
    reference: w.reference,
    status: w.status,
    amount: w.amount,
    fee: w.fee,
    bankAccount: toBank(b.rows[0]),
    failureReason: w.failure_reason,
    createdAt: w.created_at.toISOString(),
  };
}

export async function withdraw(ctx: Ctx, userId: string, input: { amount: number; bankAccountId: string; pin: string }, meta: ReqMeta): Promise<WithdrawalDTO> {
  await verifyPin(ctx, userId, input.pin, meta);
  const user = await getUser(ctx.db, userId);
  assertNoResetHold(ctx, user);
  const limits = TIER_LIMITS[user.kyc_tier as KycTier];
  const bank = await ctx.db.query<BankRow>('SELECT * FROM bank_accounts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [input.bankAccountId, userId]);
  if (!bank.rows[0]) throw notFound('Bank account');

  const w = await ctx.db.tx(async (q) => {
    const usage = await usageToday(q, userId, ctx.now());
    if (usage.withdrawn + input.amount > limits.dailyWithdrawal) {
      throw new AppError(422, 'limit_daily_withdrawal', `That’s over your daily withdrawal limit of ${formatNgn(limits.dailyWithdrawal)}.`, {
        remaining: Math.max(0, limits.dailyWithdrawal - usage.withdrawn),
      });
    }
    const reference = ref('WDR');
    const wallet = await walletAccountId(q, userId);
    const { transactionId } = await post(q, {
      kind: 'withdrawal',
      reference: `withdrawal:${reference}`,
      description: `Withdrawal to ${bank.rows[0].bank_name} ••${bank.rows[0].last4}`,
      userId,
      metadata: { fee: WITHDRAWAL_FEE },
      postings: [
        { accountId: wallet, amount: -(input.amount + WITHDRAWAL_FEE) },
        { accountId: await systemAccountId(q, 'payout_clearing'), amount: input.amount },
        { accountId: await systemAccountId(q, 'fee_revenue'), amount: WITHDRAWAL_FEE },
      ],
    });
    const r = await q.query<WithdrawalRow>(
      `INSERT INTO withdrawals (user_id, bank_account_id, reference, amount, fee, ledger_tx_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, input.bankAccountId, reference, input.amount, WITHDRAWAL_FEE, transactionId],
    );
    await enqueue(q, 'payout.process', { reference }, { dedupeKey: `payout:${reference}` });
    await audit(q, { actorId: userId, action: 'withdrawal.requested', targetType: 'withdrawal', targetId: reference, ip: meta.ip, metadata: { amount: input.amount } });
    return r.rows[0];
  });
  return toWithdrawal(ctx.db, w);
}

export async function getWithdrawal(ctx: Ctx, userId: string, reference: string) {
  const r = await ctx.db.query<WithdrawalRow>('SELECT * FROM withdrawals WHERE reference = $1 AND user_id = $2', [reference, userId]);
  if (!r.rows[0]) throw notFound('Withdrawal');
  return toWithdrawal(ctx.db, r.rows[0]);
}

/** Worker: hand the transfer to the processor. */
export async function processPayout(ctx: Ctx, reference: string) {
  const claim = await ctx.db.query<WithdrawalRow & { recipient_code: string | null; bank_code: string; account_number_enc: string; account_name: string }>(
    `UPDATE withdrawals w SET status = 'processing' FROM bank_accounts b
      WHERE w.reference = $1 AND w.status = 'pending' AND b.id = w.bank_account_id
      RETURNING w.*, b.recipient_code, b.bank_code, b.account_number_enc, b.account_name`,
    [reference],
  );
  const w = claim.rows[0];
  if (!w) return; // already handled
  let recipient = w.recipient_code;
  if (!recipient) {
    const accountNumber = decrypt(ctx.config.DATA_ENCRYPTION_KEY, w.account_number_enc);
    recipient = (await ctx.provider.createRecipient({ bankCode: w.bank_code, accountNumber, accountName: w.account_name })).recipientCode;
    await ctx.db.query('UPDATE bank_accounts SET recipient_code = $2 WHERE id = $1', [w.bank_account_id, recipient]);
  }
  let result;
  try {
    result = await ctx.provider.initiateTransfer({ reference, amount: w.amount, recipientCode: recipient, reason: 'PACT withdrawal' });
  } catch (err) {
    // Unknown outcome: put it back so the job retries with the same reference (processors dedupe on it).
    await ctx.db.query(`UPDATE withdrawals SET status = 'pending' WHERE id = $1 AND status = 'processing'`, [w.id]);
    throw err;
  }
  await ctx.db.query('UPDATE withdrawals SET provider_ref = $2 WHERE id = $1', [w.id, result.providerRef]);
  if (result.status === 'succeeded') await completeWithdrawal(ctx, reference);
  else if (result.status === 'failed') await reverseWithdrawal(ctx, reference, result.reason ?? 'Transfer failed');
  else if (ctx.provider.name === 'sandbox') {
    await enqueue(ctx.db, 'sandbox.transfer_webhook', { reference, event: 'transfer.success', amount: w.amount }, { runAt: new Date(ctx.now().getTime() + 2500) });
  }
}

export async function completeWithdrawal(ctx: Ctx, reference: string) {
  await ctx.db.tx(async (q) => {
    const r = await q.query<WithdrawalRow>(`SELECT * FROM withdrawals WHERE reference = $1 FOR UPDATE`, [reference]);
    const w = r.rows[0];
    if (!w || w.status === 'succeeded' || w.status === 'failed') return;
    await post(q, {
      kind: 'withdrawal',
      reference: `withdrawal_settled:${reference}`,
      description: 'Withdrawal settled',
      userId: w.user_id,
      postings: [
        { accountId: await systemAccountId(q, 'payout_clearing'), amount: -w.amount },
        { accountId: await systemAccountId(q, 'provider_clearing'), amount: w.amount },
      ],
    });
    await q.query(`UPDATE withdrawals SET status = 'succeeded', completed_at = now() WHERE id = $1`, [w.id]);
    await notify(q, [w.user_id], { type: 'withdrawal', title: 'Withdrawal sent', body: `${formatNgn(w.amount)} is on its way to your bank.` });
  });
}

export async function reverseWithdrawal(ctx: Ctx, reference: string, reason: string) {
  await ctx.db.tx(async (q) => {
    const r = await q.query<WithdrawalRow>(`SELECT * FROM withdrawals WHERE reference = $1 FOR UPDATE`, [reference]);
    const w = r.rows[0];
    if (!w || w.status === 'failed') return;
    // A success we already settled can still be reversed by the bank.
    const settled = w.status === 'succeeded';
    const wallet = await walletAccountId(q, w.user_id);
    await post(q, {
      kind: 'withdrawal_reversal',
      reference: `withdrawal_reversal:${reference}`,
      description: 'Withdrawal returned',
      userId: w.user_id,
      metadata: { reason },
      postings: [
        { accountId: await systemAccountId(q, settled ? 'provider_clearing' : 'payout_clearing'), amount: -w.amount },
        { accountId: await systemAccountId(q, 'fee_revenue'), amount: -w.fee },
        { accountId: wallet, amount: w.amount + w.fee },
      ],
    });
    await q.query(`UPDATE withdrawals SET status = 'failed', failure_reason = $2, completed_at = now() WHERE id = $1`, [w.id, reason.slice(0, 200)]);
    await notify(q, [w.user_id], { type: 'withdrawal', title: 'Withdrawal returned', body: `${formatNgn(w.amount + w.fee)} is back in your wallet. ${reason}.` });
  });
}

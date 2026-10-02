import { MIN_AUTO_RETURN, PACT_PAYOUT_FEE, TIER_LIMITS, VENDOR_APPROVAL_THRESHOLD, type KycTier } from '../../../shared/policy.js';
import type { BankDTO } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { decrypt, encrypt, randomCode } from '../lib/crypto.js';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors.js';
import { formatNgn } from '../lib/money.js';
import { getUser, verifyPin } from './auth.js';
import { InsufficientFunds, post, systemAccountId, walletAccountId } from './ledger.js';
import { applyToPact, getPact, joinTx, loadVisible, type MemberRow, type PactRow } from './pacts.js';
import { audit, enqueue, notify, recordActivity } from './platform.js';
import { checkPledgeKept } from './pledges.js';
import { reencodePhoto } from './plan.js';
import { namesMatch } from './wallet.js';

/*
 * Money into and out of a Pact without anyone's personal account in between:
 *
 *   in:  a bank transfer to the Pact's own account number lands in the pool, counted
 *        for the member whose name matches the sender, or shown as a named guest.
 *   out: the organiser pays a verified vendor account from the pool; above a limit the
 *        co-organiser approves first. Money is held from the pool at request time, so
 *        it can't be spent twice, and is put back if the payment is rejected or fails.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ref = (prefix: string) => `${prefix}_${randomCode(18)}`;
const isOrganizer = (m: MemberRow | null) => !!m && m.status === 'joined' && (m.role === 'organizer' || m.role === 'co_organizer');
const takingMoney = (p: PactRow) => p.status === 'open' || p.status === 'funded';

/** Bank names arrive in capitals ("ADEBAYO KEMI"); shown as "Adebayo Kemi". */
export const displayName = (bankName: string) =>
  bankName
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase());

/* --------------------------------------------------------------------------
   Co-organiser
   -------------------------------------------------------------------------- */

export async function setCoOrganizer(ctx: Ctx, userId: string, pactId: string, targetId: string | null, meta: ReqMeta) {
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member!.role !== 'organizer') throw forbidden('Only the organiser can choose a co-organiser.');
    if (!takingMoney(pact)) throw badRequest('pact_closed', 'This Pact is closed.');
    if (targetId === userId) throw badRequest('already_organizer', 'You’re already the organiser.');
    await q.query(`UPDATE pact_members SET role = 'member' WHERE pact_id = $1 AND role = 'co_organizer'`, [pactId]);
    // A new co-organiser decides afresh: any release waiting on the old one is withdrawn.
    await q.query('UPDATE pacts SET release_requested_by = NULL, release_requested_at = NULL WHERE id = $1', [pactId]);
    if (targetId) {
      const who = await q.query<{ kyc_tier: number }>(
        `SELECT u.kyc_tier FROM pact_members m JOIN users u ON u.id = m.user_id WHERE m.pact_id = $1 AND m.user_id = $2 AND m.status = 'joined'`,
        [pactId, targetId],
      );
      if (!who.rows[0]) throw badRequest('not_a_member', 'Choose someone who has joined this Pact.');
      // A verified BVN belongs to one account only, so the approver is a real second person.
      if (!TIER_LIMITS[who.rows[0].kyc_tier as KycTier].canRelease) {
        throw new AppError(422, 'co_organizer_unverified', 'Your co-organiser needs to verify their BVN first, so large payments always need two real people.');
      }
      await q.query(`UPDATE pact_members SET role = 'co_organizer' WHERE pact_id = $1 AND user_id = $2`, [pactId, targetId]);
      await recordActivity(q, { pactId, actorId: targetId, type: 'co_organizer' });
      await notify(q, [targetId], { type: 'co_organizer', title: 'You’re a co-organiser', body: `You now approve large vendor payments for ${pact.title}.`, pactId });
    }
    await audit(q, { actorId: userId, action: 'pact.co_organizer_set', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { coOrganizer: targetId } });
  });
  return getPact(ctx, userId, pactId);
}

/* --------------------------------------------------------------------------
   The Pact's account number
   -------------------------------------------------------------------------- */

export async function openPactAccount(ctx: Ctx, userId: string, pactId: string, meta: ReqMeta) {
  const { pact, member } = await loadVisible(ctx.db, pactId, userId);
  if (!isOrganizer(member)) throw forbidden('Only organisers can set up the Pact’s account number.');
  if (!takingMoney(pact)) throw badRequest('pact_closed', 'This Pact is closed.');
  const existing = await ctx.db.query('SELECT 1 FROM pact_bank_accounts WHERE pact_id = $1', [pactId]);
  if (!existing.rowCount) {
    const acct = await ctx.provider.createPactAccount({ pactId, name: pact.title });
    await ctx.db.query(
      `INSERT INTO pact_bank_accounts (pact_id, provider, provider_ref, account_number, bank_name, account_name) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (pact_id) DO NOTHING`,
      [pactId, ctx.provider.name, acct.providerRef, acct.accountNumber, acct.bankName, acct.accountName],
    );
    await audit(ctx.db, { actorId: userId, action: 'pact.account_opened', targetType: 'pact', targetId: pactId, ip: meta.ip });
  }
  return getPact(ctx, userId, pactId);
}

/** When a Pact closes, its number stops taking money (late transfers are sent back). */
export async function closePactAccountTx(q: Queryable, pactId: string) {
  const r = await q.query<{ provider_ref: string }>(
    `UPDATE pact_bank_accounts SET status = 'closed', closed_at = now() WHERE pact_id = $1 AND status = 'active' RETURNING provider_ref`,
    [pactId],
  );
  if (r.rows[0]) await enqueue(q, 'pact_account.close', { providerRef: r.rows[0].provider_ref }, { dedupeKey: `pact_account_close:${pactId}` });
}

/* --------------------------------------------------------------------------
   Transfers in
   -------------------------------------------------------------------------- */

/** The one member whose name matches the sender's bank name, if exactly one does. */
async function matchSender(q: Queryable, pactId: string, senderName: string): Promise<string | null> {
  const r = await q.query<{ user_id: string; first_name: string; last_name: string }>(
    `SELECT m.user_id, u.first_name, u.last_name FROM pact_members m JOIN users u ON u.id = m.user_id
      WHERE m.pact_id = $1 AND m.status IN ('joined', 'invited')`,
    [pactId],
  );
  const hits = r.rows.filter((m) => namesMatch(m.first_name, m.last_name, senderName));
  return hits.length === 1 ? hits[0].user_id : null;
}

/** Money we can't place goes to suspense, and a person looks at it. */
async function holdInSuspense(q: Queryable, from: string, amount: number, reference: string, description: string, alert: Record<string, unknown>) {
  await post(q, {
    kind: 'adjustment',
    reference,
    description,
    postings: [
      { accountId: from, amount: -amount },
      { accountId: await systemAccountId(q, 'suspense'), amount },
    ],
  });
  await enqueue(q, 'ops.alert', alert);
}

/**
 * A verified `transfer.received` webhook. Idempotent on the processor's reference.
 * Money always lands somewhere in the ledger: the pool, back to the sender, or suspense.
 */
export async function receiveTransfer(
  ctx: Ctx,
  ev: { reference: string; amount: number | null; currency: string | null; inbound: { accountNumber: string; senderName: string; senderBank: string | null; senderAccount: string | null } },
) {
  const amount = ev.amount;
  if (!amount || amount <= 0 || !Number.isSafeInteger(amount)) throw new Error(`Inbound transfer ${ev.reference} has no usable amount`);
  const { inbound } = ev;
  await ctx.db.tx(async (q) => {
    const clearing = await systemAccountId(q, 'provider_clearing');
    const acct = (await q.query<{ pact_id: string; status: string }>('SELECT pact_id, status FROM pact_bank_accounts WHERE account_number = $1', [inbound.accountNumber])).rows[0];
    if (!acct || (ev.currency && ev.currency !== 'NGN')) {
      // Not ours to place: never credit a Pact with it.
      const dup = await q.query('SELECT 1 FROM ledger_transactions WHERE reference = $1', [`suspense:${ev.reference}`]);
      if (dup.rowCount) return;
      await holdInSuspense(q, clearing, amount, `suspense:${ev.reference}`, 'Transfer to an unknown account', {
        kind: acct ? 'transfer_wrong_currency' : 'transfer_unknown_account',
        reference: ev.reference,
        amount,
        currency: ev.currency,
      });
      return;
    }
    const pact = (await q.query<PactRow>('SELECT * FROM pacts WHERE id = $1 FOR UPDATE', [acct.pact_id])).rows[0];
    const ins = await q.query<{ id: string }>(
      `INSERT INTO pact_transfers (pact_id, provider_ref, amount, sender_name, sender_bank, sender_account_enc, sender_last4)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (provider_ref) DO NOTHING RETURNING id`,
      [
        pact.id,
        ev.reference,
        amount,
        inbound.senderName,
        inbound.senderBank,
        inbound.senderAccount ? encrypt(ctx.config.DATA_ENCRYPTION_KEY, inbound.senderAccount) : null,
        inbound.senderAccount?.slice(-4) ?? null,
      ],
    );
    if (!ins.rows[0]) return; // redelivery
    const transferId = ins.rows[0].id;

    if (acct.status !== 'active' || !takingMoney(pact)) {
      // The Pact has closed: send it back where it came from. Tiny amounts wait for a person,
      // so nobody can make PACT pay a transfer fee per ₦1 sent to a closed Pact.
      if (!inbound.senderAccount || amount < MIN_AUTO_RETURN) {
        await q.query(`UPDATE pact_transfers SET status = 'held' WHERE id = $1`, [transferId]);
        await holdInSuspense(q, clearing, amount, `suspense:${ev.reference}`, `Late transfer to ${pact.title}`, { kind: 'late_transfer_no_sender', reference: ev.reference, pactId: pact.id, amount });
        return;
      }
      await startReturn(q, pact, { id: transferId, amount, senderName: inbound.senderName, senderBank: inbound.senderBank, senderAccountEnc: encrypt(ctx.config.DATA_ENCRYPTION_KEY, inbound.senderAccount), senderLast4: inbound.senderAccount.slice(-4) }, 'transfer_return', clearing);
      return;
    }

    await post(q, {
      kind: 'bank_transfer_in',
      reference: `transfer_in:${ev.reference}`,
      description: `Bank transfer to ${pact.title}`,
      pactId: pact.id,
      metadata: { transferId },
      postings: [
        { accountId: clearing, amount: -amount },
        { accountId: pact.account_id, amount },
      ],
    });
    const userId = await matchSender(q, pact.id, inbound.senderName);
    if (userId) {
      const m = (await q.query<MemberRow>('SELECT * FROM pact_members WHERE pact_id = $1 AND user_id = $2', [pact.id, userId])).rows[0];
      // Paying is joining, for someone who was invited.
      if (m.status === 'invited' && pact.status === 'open') await joinTx(q, pact, userId);
      await q.query(`UPDATE pact_transfers SET user_id = $2, matched_by = 'name' WHERE id = $1`, [transferId, userId]);
    }
    await applyToPact(q, pact, userId ? { userId } : { guestName: displayName(inbound.senderName) }, amount);
    await audit(q, { actorId: userId, action: 'pact.transfer_in', targetType: 'pact', targetId: pact.id, metadata: { amount, matched: !!userId } });
  });
}

/** Organisers can say who a transfer was from, or turn a mismatch back into a guest. */
export async function assignTransfer(ctx: Ctx, userId: string, pactId: string, transferId: string, targetId: string | null, meta: ReqMeta) {
  if (!UUID.test(transferId)) throw notFound('Transfer');
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (!isOrganizer(member)) throw forbidden('Only organisers can match transfers.');
    if (!takingMoney(pact)) throw badRequest('pact_closed', 'This Pact is closed.');
    const t = (await q.query<{ id: string; amount: number; user_id: string | null; status: string }>(
      'SELECT id, amount, user_id, status FROM pact_transfers WHERE id = $1 AND pact_id = $2 FOR UPDATE',
      [transferId, pactId],
    )).rows[0];
    if (!t) throw notFound('Transfer');
    if (t.status !== 'credited') throw badRequest('transfer_closed', 'This transfer can’t be changed.');
    if (t.user_id === targetId) return;
    if (targetId) {
      const m = await q.query(`SELECT 1 FROM pact_members WHERE pact_id = $1 AND user_id = $2 AND status IN ('joined', 'invited')`, [pactId, targetId]);
      if (!m.rowCount) throw badRequest('not_a_member', 'Choose someone in this Pact.');
    }
    if (t.user_id) await q.query('UPDATE pact_members SET contributed = contributed - $3 WHERE pact_id = $1 AND user_id = $2', [pactId, t.user_id, t.amount]);
    if (targetId) {
      await q.query(
        `UPDATE pact_members SET contributed = contributed + $3,
           participation = CASE WHEN participation IS NULL OR participation = 'later' THEN 'money' WHEN participation = 'task' THEN 'both' ELSE participation END
         WHERE pact_id = $1 AND user_id = $2`,
        [pactId, targetId, t.amount],
      );
    }
    await q.query(`UPDATE pact_transfers SET user_id = $2, matched_by = $3 WHERE id = $1`, [transferId, targetId, targetId ? 'organizer' : null]);
    if (targetId) await checkPledgeKept(q, pactId, targetId);
    await audit(q, { actorId: userId, action: 'pact.transfer_assigned', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { transferId, from: t.user_id, to: targetId } });
  });
  return getPact(ctx, userId, pactId);
}

/* --------------------------------------------------------------------------
   Money out: vendor payments, refunds to guests, returns of late transfers
   -------------------------------------------------------------------------- */

interface PayoutRow {
  id: string;
  pact_id: string;
  reference: string;
  kind: 'vendor' | 'guest_refund' | 'transfer_return';
  amount: number;
  fee: number;
  bank_code: string | null;
  bank_name: string;
  account_number_enc: string;
  account_name: string;
  purpose: string | null;
  transfer_id: string | null;
  status: string;
  requested_by: string | null;
  recipient_code: string | null;
}

/** Sends a guest's money (or a late transfer) back to the account it came from. */
async function startReturn(
  q: Queryable,
  pact: PactRow,
  t: { id: string; amount: number; senderName: string; senderBank: string | null; senderAccountEnc: string; senderLast4: string | null },
  kind: 'guest_refund' | 'transfer_return',
  fromAccount: string,
) {
  const reference = ref(kind === 'guest_refund' ? 'GRF' : 'RTN');
  await post(q, {
    kind: kind === 'guest_refund' ? 'guest_refund' : 'transfer_return',
    reference: `${kind}:${reference}`,
    description: kind === 'guest_refund' ? `Refund to ${t.senderName}` : `Late transfer returned to ${t.senderName}`,
    pactId: pact.id,
    metadata: { transferId: t.id },
    postings: [
      { accountId: fromAccount, amount: -t.amount },
      { accountId: await systemAccountId(q, 'payout_clearing'), amount: t.amount },
    ],
  });
  await q.query(
    `INSERT INTO pact_payouts (pact_id, reference, kind, amount, fee, bank_name, account_number_enc, last4, account_name, transfer_id, status)
     VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9, 'pending')`,
    [pact.id, reference, kind, t.amount, t.senderBank ?? 'Unknown bank', t.senderAccountEnc, t.senderLast4 ?? '', t.senderName.slice(0, 100), t.id],
  );
  await enqueue(q, 'pact_payout.process', { reference }, { dedupeKey: `pact_payout:${reference}` });
}

/**
 * Part of a refund: send every bank transfer's share back to the account it came from.
 * `shares` maps transfer id to what goes back (less than was sent if vendors were paid).
 */
export async function refundGuestsTx(q: Queryable, pact: PactRow, shares: Map<string, number>) {
  if (!shares.size) return;
  const rows = await q.query<{ id: string; sender_name: string; sender_bank: string | null; sender_account_enc: string | null; sender_last4: string | null }>(
    'SELECT id, sender_name, sender_bank, sender_account_enc, sender_last4 FROM pact_transfers WHERE id = ANY($1::uuid[])',
    [[...shares.keys()]],
  );
  for (const t of rows.rows) {
    const amount = shares.get(t.id)!;
    if (amount <= 0) continue;
    if (!t.sender_account_enc) {
      await q.query(`UPDATE pact_transfers SET status = 'held' WHERE id = $1`, [t.id]);
      await holdInSuspense(q, pact.account_id, amount, `suspense:refund:${t.id}`, `Refund for ${t.sender_name} with no account on file`, { kind: 'guest_refund_no_account', pactId: pact.id, transferId: t.id, amount });
      continue;
    }
    await startReturn(q, pact, { id: t.id, amount, senderName: t.sender_name, senderBank: t.sender_bank, senderAccountEnc: t.sender_account_enc, senderLast4: t.sender_last4 }, 'guest_refund', pact.account_id);
  }
}

/** Only while the vendor account resolves; the name the bank returns is what members see. */
export async function resolveVendor(ctx: Ctx, userId: string, pactId: string, bankCode: string, accountNumber: string) {
  const { member } = await loadVisible(ctx.db, pactId, userId);
  if (!isOrganizer(member)) throw forbidden('Only organisers can pay vendors.');
  const { accountName } = await ctx.provider.resolveAccount(bankCode, accountNumber);
  return { accountName };
}

/** Who else can approve: the co-organiser for the organiser, the organiser for the co-organiser. */
async function approverFor(q: Queryable, pactId: string, requesterId: string) {
  const r = await q.query<{ user_id: string }>(
    `SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined' AND role IN ('organizer', 'co_organizer') AND user_id <> $2`,
    [pactId, requesterId],
  );
  return r.rows[0]?.user_id ?? null;
}

export async function requestVendorPayment(
  ctx: Ctx,
  userId: string,
  pactId: string,
  input: { amount: number; bankCode: string; accountNumber: string; purpose: string; budgetItemId?: string | null; pin: string },
  meta: ReqMeta,
) {
  if (input.amount % 100 !== 0) throw badRequest('invalid_amount', 'Pay whole naira amounts.');
  // Authorisation first: outsiders learn nothing, not even that KYC would be needed.
  const { member } = await loadVisible(ctx.db, pactId, userId);
  if (!isOrganizer(member)) throw forbidden('Only organisers can pay vendors.');
  await verifyPin(ctx, userId, input.pin, meta);
  const user = await getUser(ctx.db, userId);
  if (!TIER_LIMITS[user.kyc_tier as KycTier].canRelease) throw new AppError(403, 'kyc_required', 'Verify your BVN to pay vendors. It takes about a minute.');
  const bank = (await ctx.provider.listBanks()).find((b: BankDTO) => b.code === input.bankCode);
  if (!bank) throw badRequest('bank_not_found', 'Choose a bank from the list.');
  const { accountName } = await ctx.provider.resolveAccount(input.bankCode, input.accountNumber);

  await ctx.db.tx(async (q) => {
    const { pact, member: m } = await loadVisible(q, pactId, userId, true);
    if (!isOrganizer(m)) throw forbidden('Only organisers can pay vendors.');
    if (pact.status === 'open' && pact.missed_goal_policy === 'refund') {
      throw new AppError(422, 'refund_promised', 'Everyone was promised a refund if the goal is missed, so vendors can be paid once it’s fully funded.');
    }
    if (!takingMoney(pact)) throw badRequest('pact_closed', 'This Pact is closed.');
    if (pact.completed_at) throw badRequest('pact_completed', 'This Pact is completed. Release what is left instead.');
    if (input.budgetItemId) {
      const b = await q.query('SELECT 1 FROM budget_items WHERE id = $1 AND pact_id = $2', [input.budgetItemId, pactId]);
      if (!b.rowCount) throw badRequest('budget_item_not_found', 'Choose a line from this Pact’s budget.');
    }
    // Counted over 24 hours, so a large payment can't be split into small ones to skip approval.
    const recent = await q.query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM pact_payouts
        WHERE pact_id = $1 AND kind = 'vendor' AND decided_by IS NULL AND status IN ('pending', 'processing', 'succeeded')
          AND created_at > now() - interval '24 hours'`,
      [pactId],
    );
    const needsApproval = recent.rows[0].total + input.amount > VENDOR_APPROVAL_THRESHOLD;
    const approver = needsApproval ? await approverFor(q, pactId, userId) : null;
    if (needsApproval && !approver) {
      throw new AppError(422, 'needs_co_organizer', `More than ${formatNgn(VENDOR_APPROVAL_THRESHOLD)} in a day needs a co-organiser to approve. Add one first.`);
    }
    const reference = ref('PPO');
    try {
      await post(q, {
        kind: 'vendor_payment',
        reference: `vendor_payment:${reference}`,
        description: `${input.purpose}: ${accountName}`,
        userId,
        pactId,
        metadata: { fee: PACT_PAYOUT_FEE },
        postings: [
          { accountId: pact.account_id, amount: -(input.amount + PACT_PAYOUT_FEE) },
          { accountId: await systemAccountId(q, 'payout_clearing'), amount: input.amount },
          { accountId: await systemAccountId(q, 'fee_revenue'), amount: PACT_PAYOUT_FEE },
        ],
      });
    } catch (err) {
      if (!(err instanceof InsufficientFunds)) throw err;
      const bal = (await q.query<{ balance: number }>('SELECT balance FROM accounts WHERE id = $1', [pact.account_id])).rows[0].balance;
      const most = Math.max(0, bal - PACT_PAYOUT_FEE);
      throw new AppError(422, 'insufficient_pool', `The Pact has ${formatNgn(most)} available to pay out (after the ${formatNgn(PACT_PAYOUT_FEE)} transfer fee).`, { available: most });
    }
    await q.query(
      `INSERT INTO pact_payouts (pact_id, reference, kind, amount, fee, bank_code, bank_name, account_number_enc, last4, account_name, purpose, budget_item_id, status, requested_by)
       VALUES ($1, $2, 'vendor', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        pactId, reference, input.amount, PACT_PAYOUT_FEE, bank.code, bank.name,
        encrypt(ctx.config.DATA_ENCRYPTION_KEY, input.accountNumber), input.accountNumber.slice(-4), accountName,
        input.purpose, input.budgetItemId ?? null, needsApproval ? 'awaiting_approval' : 'pending', userId,
      ],
    );
    if (needsApproval) {
      await notify(q, [approver!], { type: 'approval', title: 'Approve a payment', body: `${user.first_name} wants to pay ${formatNgn(input.amount)} to ${accountName} for ${input.purpose}.`, pactId, meta: { actor: user.first_name, amount: input.amount, purpose: input.purpose, payee: accountName }, push: `Your approval is needed for ${pact.title}.` });
    } else {
      await enqueue(q, 'pact_payout.process', { reference }, { dedupeKey: `pact_payout:${reference}` });
    }
    await audit(q, { actorId: userId, action: 'pact.vendor_payment_requested', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { reference, amount: input.amount, bank: bank.code, last4: input.accountNumber.slice(-4), needsApproval } });
  });
  return getPact(ctx, userId, pactId);
}

/** Puts a held vendor payment back: into the pool while the Pact is open, else to the organiser (as a release would have). */
async function returnHold(q: Queryable, pact: PactRow, p: PayoutRow, fromClearing: 'payout_clearing' | 'provider_clearing', reason: string) {
  const back = takingMoney(pact) ? pact.account_id : await walletAccountId(q, pact.organizer_id);
  await post(q, {
    kind: 'vendor_payment_reversal',
    reference: `vendor_payment_reversal:${p.reference}`,
    description: `Payment to ${p.account_name} returned`,
    userId: takingMoney(pact) ? null : pact.organizer_id,
    pactId: pact.id,
    metadata: { reason },
    postings: [
      { accountId: await systemAccountId(q, fromClearing), amount: -p.amount },
      { accountId: await systemAccountId(q, 'fee_revenue'), amount: -p.fee },
      { accountId: back, amount: p.amount + p.fee },
    ],
  });
}

export async function decideVendorPayment(ctx: Ctx, userId: string, pactId: string, payoutId: string, decision: 'approve' | 'reject' | 'cancel', pin: string | null, meta: ReqMeta) {
  if (!UUID.test(payoutId)) throw notFound('Payment');
  const { member } = await loadVisible(ctx.db, pactId, userId);
  if (!isOrganizer(member)) throw forbidden('Only organisers can decide on payments.');
  if (decision === 'approve') {
    if (!pin) throw badRequest('pin_required', 'Enter your PIN to approve.');
    await verifyPin(ctx, userId, pin, meta);
  }
  await ctx.db.tx(async (q) => {
    const { pact, member: m } = await loadVisible(q, pactId, userId, true);
    if (!isOrganizer(m)) throw forbidden('Only organisers can decide on payments.');
    const p = (await q.query<PayoutRow>(`SELECT * FROM pact_payouts WHERE id = $1 AND pact_id = $2 AND kind = 'vendor' FOR UPDATE`, [payoutId, pactId])).rows[0];
    if (!p) throw notFound('Payment');
    if (p.status !== 'awaiting_approval') throw badRequest('already_decided', 'This payment has already been decided.');
    const mine = p.requested_by === userId;
    if (decision === 'cancel' && !mine) throw forbidden('Only the person who asked can cancel this payment.');
    if (decision !== 'cancel' && mine) throw forbidden('Someone else has to approve a payment you asked for.');
    if (decision === 'approve') {
      const me = await getUser(q, userId);
      if (!TIER_LIMITS[me.kyc_tier as KycTier].canRelease) throw new AppError(403, 'kyc_required', 'Verify your BVN to approve payments.');
      await q.query(`UPDATE pact_payouts SET status = 'pending', decided_by = $2, decided_at = now() WHERE id = $1`, [p.id, userId]);
      await enqueue(q, 'pact_payout.process', { reference: p.reference }, { dedupeKey: `pact_payout:${p.reference}` });
    } else {
      await returnHold(q, pact, p, 'payout_clearing', decision === 'reject' ? 'Not approved' : 'Cancelled');
      await q.query(`UPDATE pact_payouts SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1`, [p.id, decision === 'reject' ? 'rejected' : 'cancelled', userId]);
      if (decision === 'reject' && p.requested_by) {
        await notify(q, [p.requested_by], { type: 'approval', title: 'Payment not approved', body: `${formatNgn(p.amount)} to ${p.account_name} wasn’t approved. The money is back in ${pact.title}.`, pactId });
      }
    }
    await audit(q, { actorId: userId, action: `pact.vendor_payment_${decision}`, targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { reference: p.reference } });
  });
  return getPact(ctx, userId, pactId);
}

/**
 * Before a Pact closes: an organiser has to decide waiting payments first; the deadline
 * sweep (no person acting) turns them down so the money is back in the pool.
 */
export async function settleWaitingPayouts(q: Queryable, pact: PactRow, mode: 'block' | 'reject') {
  const waiting = await q.query<PayoutRow>(`SELECT * FROM pact_payouts WHERE pact_id = $1 AND status = 'awaiting_approval' FOR UPDATE`, [pact.id]);
  if (!waiting.rowCount) return;
  if (mode === 'block') throw badRequest('payment_waiting', 'Approve or turn down the waiting vendor payment first.');
  for (const p of waiting.rows) {
    await returnHold(q, pact, p, 'payout_clearing', 'Pact closed before approval');
    await q.query(`UPDATE pact_payouts SET status = 'rejected', decided_at = now() WHERE id = $1`, [p.id]);
  }
}

/** Worker: hand the transfer to the processor. Same reference on every retry, so it can't go twice. */
export async function processPactPayout(ctx: Ctx, reference: string) {
  const p = (await ctx.db.query<PayoutRow>(`UPDATE pact_payouts SET status = 'processing' WHERE reference = $1 AND status = 'pending' RETURNING *`, [reference])).rows[0];
  if (!p) return;
  try {
    let bankCode = p.bank_code;
    if (!bankCode) {
      // Senders' banks arrive by name; find the code for the transfer back.
      const want = p.bank_name.toLowerCase().replace(/[^a-z]/g, '');
      bankCode = (await ctx.provider.listBanks()).find((b) => b.name.toLowerCase().replace(/[^a-z]/g, '') === want)?.code ?? null;
      if (!bankCode) return await failPactPayout(ctx, reference, `Unknown bank: ${p.bank_name}`);
      await ctx.db.query('UPDATE pact_payouts SET bank_code = $2 WHERE id = $1', [p.id, bankCode]);
    }
    let recipient = p.recipient_code;
    if (!recipient) {
      const accountNumber = decrypt(ctx.config.DATA_ENCRYPTION_KEY, p.account_number_enc);
      recipient = (await ctx.provider.createRecipient({ bankCode, accountNumber, accountName: p.account_name })).recipientCode;
      await ctx.db.query('UPDATE pact_payouts SET recipient_code = $2 WHERE id = $1', [p.id, recipient]);
    }
    const reason = p.kind === 'vendor' ? `PACT: ${p.purpose ?? 'payment'}` : 'PACT refund';
    const result = await ctx.provider.initiateTransfer({ reference, amount: p.amount, recipientCode: recipient, reason });
    await ctx.db.query('UPDATE pact_payouts SET provider_ref = $2 WHERE id = $1', [p.id, result.providerRef]);
    if (result.status === 'succeeded') await completePactPayout(ctx, reference);
    else if (result.status === 'failed') await failPactPayout(ctx, reference, result.reason ?? 'Transfer failed');
    else if (ctx.provider.name === 'sandbox') {
      await enqueue(ctx.db, 'sandbox.transfer_webhook', { reference, event: 'transfer.success', amount: p.amount }, { runAt: new Date(ctx.now().getTime() + 2500) });
    }
  } catch (err) {
    // Unknown outcome: put it back so the job retries with the same reference.
    await ctx.db.query(`UPDATE pact_payouts SET status = 'pending' WHERE id = $1 AND status = 'processing'`, [p.id]);
    throw err;
  }
}

export async function completePactPayout(ctx: Ctx, reference: string) {
  await ctx.db.tx(async (q) => {
    const p = (await q.query<PayoutRow>('SELECT * FROM pact_payouts WHERE reference = $1 FOR UPDATE', [reference])).rows[0];
    if (!p || !['pending', 'processing'].includes(p.status)) return;
    await post(q, {
      kind: 'payout_settled',
      reference: `payout_settled:${reference}`,
      description: `Paid to ${p.account_name}`,
      pactId: p.pact_id,
      postings: [
        { accountId: await systemAccountId(q, 'payout_clearing'), amount: -p.amount },
        { accountId: await systemAccountId(q, 'provider_clearing'), amount: p.amount },
      ],
    });
    await q.query(`UPDATE pact_payouts SET status = 'succeeded', completed_at = now() WHERE id = $1`, [p.id]);
    if (p.kind === 'vendor') {
      const pact = (await q.query<PactRow>('SELECT * FROM pacts WHERE id = $1', [p.pact_id])).rows[0];
      await recordActivity(q, { pactId: p.pact_id, actorId: p.requested_by, type: 'vendor_paid', amount: p.amount, detail: `${p.purpose ?? 'Payment'} · ${p.account_name}` });
      const members = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined'`, [p.pact_id]);
      await notify(q, members.rows.map((m) => m.user_id), { type: 'vendor_paid', title: `Paid from ${pact.title}`, body: `${formatNgn(p.amount)} to ${p.account_name} for ${p.purpose ?? 'the plan'}.`, pactId: p.pact_id, meta: { amount: p.amount, purpose: p.purpose ?? undefined, payee: p.account_name } });
    } else if (p.transfer_id) {
      await q.query(`UPDATE pact_transfers SET status = $2 WHERE id = $1`, [p.transfer_id, p.kind === 'guest_refund' ? 'refunded' : 'returned']);
    }
  });
}

export async function failPactPayout(ctx: Ctx, reference: string, reason: string) {
  await ctx.db.tx(async (q) => {
    const p = (await q.query<PayoutRow>('SELECT * FROM pact_payouts WHERE reference = $1 FOR UPDATE', [reference])).rows[0];
    if (!p || ['failed', 'rejected', 'cancelled', 'awaiting_approval'].includes(p.status)) return;
    // A payment we already settled can still be reversed by the bank.
    const from = p.status === 'succeeded' ? 'provider_clearing' : 'payout_clearing';
    const pact = (await q.query<PactRow>('SELECT * FROM pacts WHERE id = $1 FOR UPDATE', [p.pact_id])).rows[0];
    if (p.kind === 'vendor') {
      await returnHold(q, pact, p, from, reason);
      const organizers = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined' AND role IN ('organizer', 'co_organizer')`, [p.pact_id]);
      await notify(q, organizers.rows.map((o) => o.user_id), {
        type: 'vendor_failed',
        title: 'Payment didn’t go through',
        body: `${formatNgn(p.amount)} to ${p.account_name} came back. ${takingMoney(pact) ? `It’s in ${pact.title} again.` : 'It’s in the organiser’s wallet.'}`,
        pactId: p.pact_id,
        meta: { amount: p.amount, purpose: p.purpose ?? undefined, payee: p.account_name, reason: reason },
        push: `A payment from ${pact.title} didn’t go through.`,
      });
    } else {
      // Couldn't send a guest their money back: hold it and get a person on it.
      await holdInSuspense(q, await systemAccountId(q, from), p.amount, `suspense:${reference}`, `Could not return money to ${p.account_name}`, { kind: 'guest_return_failed', reference, pactId: p.pact_id, amount: p.amount, reason });
      if (p.transfer_id) await q.query(`UPDATE pact_transfers SET status = 'held' WHERE id = $1`, [p.transfer_id]);
    }
    await q.query(`UPDATE pact_payouts SET status = 'failed', failure_reason = $2, completed_at = now() WHERE id = $1`, [p.id, reason.slice(0, 200)]);
  });
}

/* --------------------------------------------------------------------------
   Receipts
   -------------------------------------------------------------------------- */

export async function addReceipt(ctx: Ctx, userId: string, pactId: string, payoutId: string, body: Buffer) {
  if (!UUID.test(payoutId)) throw notFound('Payment');
  const { member } = await loadVisible(ctx.db, pactId, userId);
  if (!isOrganizer(member)) throw forbidden('Only organisers can add receipts.');
  const { data } = await reencodePhoto(body);
  // Write-once: a receipt members have seen can't be swapped for another later.
  const r = await ctx.db.query(
    `UPDATE pact_payouts SET receipt = $3, receipt_bytes = $4
      WHERE id = $1 AND pact_id = $2 AND kind = 'vendor' AND status NOT IN ('rejected', 'cancelled') AND receipt IS NULL`,
    [payoutId, pactId, data, data.length],
  );
  if (!r.rowCount) {
    const has = await ctx.db.query('SELECT 1 FROM pact_payouts WHERE id = $1 AND pact_id = $2 AND receipt IS NOT NULL', [payoutId, pactId]);
    if (has.rowCount) throw new AppError(409, 'receipt_exists', 'This payment already has a receipt.');
    throw notFound('Payment');
  }
  await audit(ctx.db, { actorId: userId, action: 'pact.receipt_added', targetType: 'pact', targetId: pactId, metadata: { payoutId, bytes: data.length } });
  return getPact(ctx, userId, pactId);
}

/** Served only to people in the Pact, through the API. */
export async function getReceipt(ctx: Ctx, userId: string, pactId: string, payoutId: string) {
  if (!UUID.test(payoutId)) throw notFound('Receipt');
  const { member } = await loadVisible(ctx.db, pactId, userId);
  if (member!.status !== 'joined') throw notFound('Receipt');
  const r = await ctx.db.query<{ receipt: Uint8Array | null }>('SELECT receipt FROM pact_payouts WHERE id = $1 AND pact_id = $2', [payoutId, pactId]);
  if (!r.rows[0]?.receipt) throw notFound('Receipt');
  return { data: Buffer.from(r.rows[0].receipt), mime: 'image/webp' };
}

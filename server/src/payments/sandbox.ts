import { createHmac } from 'node:crypto';
import type { Config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { safeEqual } from '../lib/crypto.js';
import { SANDBOX_BANKS } from './banks.js';
import { parsePaystackEvent, type PaymentProvider } from './provider.js';

/**
 * A processor stand-in for development, demos and tests. Checkout happens on a
 * sandbox page inside the app; the outcome is delivered as a signed webhook through
 * exactly the same code path a real processor's webhook takes.
 */
export function createSandboxProvider(config: Config): PaymentProvider & { sign(body: string): string } {
  const sign = (body: string) => createHmac('sha512', config.SANDBOX_WEBHOOK_SECRET).update(body).digest('hex');
  // In-memory view of checkout outcomes so verifyCheckout can answer like a processor would.
  const outcomes = new Map<string, { status: 'succeeded' | 'failed'; amount: number; reason: string | null }>();

  return {
    name: 'sandbox',
    sign,
    async initializeCheckout({ reference }) {
      return { checkoutUrl: `${config.APP_ORIGIN}/app/wallet/checkout/${encodeURIComponent(reference)}` };
    },
    async verifyCheckout(reference) {
      const o = outcomes.get(reference);
      return o ? { status: o.status, amountPaid: o.amount, reason: o.reason } : { status: 'pending', amountPaid: null, reason: null };
    },
    verifyWebhookSignature(rawBody, headers) {
      const given = headers['x-paystack-signature'];
      return typeof given === 'string' && safeEqual(given, sign(rawBody));
    },
    parseWebhook(body) {
      const parsed = parsePaystackEvent(body);
      if (parsed && parsed.type.startsWith('charge.') && parsed.amount !== null) {
        outcomes.set(parsed.reference, {
          status: parsed.type === 'charge.success' ? 'succeeded' : 'failed',
          amount: parsed.amount,
          reason: parsed.reason,
        });
      }
      return parsed;
    },
    async listBanks() {
      return SANDBOX_BANKS;
    },
    async resolveAccount(bankCode, accountNumber, hintName) {
      if (!SANDBOX_BANKS.some((b) => b.code === bankCode)) throw new AppError(422, 'bank_not_found', 'Choose a bank from the list.');
      // Numbers ending 0000 behave like accounts that don't exist, for testing the error path.
      if (accountNumber.endsWith('0000')) throw new AppError(422, 'account_not_found', 'We couldn’t find that account. Check the number and bank.');
      return { accountName: (hintName ?? `Account holder ${accountNumber.slice(-4)}`).toUpperCase() };
    },
    async createRecipient({ accountNumber, bankCode }) {
      return { recipientCode: `RCP_sandbox_${bankCode}_${accountNumber.slice(-4)}` };
    },
    async initiateTransfer({ reference, amount }) {
      // Amounts ending in 13 kobo fail, for testing reversals.
      if (amount % 100 === 13) return { providerRef: `TRF_${reference}`, status: 'failed', reason: 'Beneficiary bank unavailable' };
      return { providerRef: `TRF_${reference}`, status: 'pending' };
    },
  };
}

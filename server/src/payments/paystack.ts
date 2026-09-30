import { createHmac } from 'node:crypto';
import type { Config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { safeEqual } from '../lib/crypto.js';
import { parsePaystackEvent, type PaymentProvider } from './provider.js';

interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

/** Paystack adapter: collections via Checkout, disbursements via Transfers. */
export function createPaystackProvider(config: Config): PaymentProvider {
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${config.PAYSTACK_BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as PaystackResponse<T> | null;
    if (!res.ok || !body?.status) {
      // Resolution failures are the customer's input; everything else is ours to retry.
      if (res.status === 422 || res.status === 400) throw new AppError(422, 'provider_rejected', body?.message ?? 'The payment provider rejected that request.');
      throw new Error(`Paystack ${path} failed: ${res.status} ${body?.message ?? ''}`);
    }
    return body.data;
  };

  return {
    name: 'paystack',
    async initializeCheckout({ reference, amount, channel, customer, callbackUrl }) {
      const data = await call<{ authorization_url: string }>('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          reference,
          amount,
          currency: 'NGN',
          // Paystack requires an email; customers sign up with a phone number.
          email: `${customer.id}@customers.pact.invalid`,
          channels: channel === 'card' ? ['card'] : ['bank_transfer'],
          callback_url: callbackUrl,
          metadata: { user_id: customer.id, custom_fields: [{ display_name: 'Customer', variable_name: 'name', value: customer.name }] },
        }),
      });
      return { checkoutUrl: data.authorization_url };
    },
    async verifyCheckout(reference) {
      const data = await call<{ status: string; amount: number; currency: string; gateway_response: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
      const status = data.status === 'success' ? 'succeeded' : ['failed', 'reversed', 'abandoned'].includes(data.status) ? 'failed' : 'pending';
      return { status, amountPaid: data.amount, currency: data.currency ?? null, reason: data.gateway_response ?? null };
    },
    verifyWebhookSignature(rawBody, headers) {
      const given = headers['x-paystack-signature'];
      if (typeof given !== 'string') return false;
      const expected = createHmac('sha512', config.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
      return safeEqual(given, expected);
    },
    parseWebhook: parsePaystackEvent,
    async listBanks() {
      const data = await call<{ code: string; name: string; active: boolean }[]>('/bank?country=nigeria&currency=NGN&perPage=200');
      return data.filter((b) => b.active).map((b) => ({ code: b.code, name: b.name }));
    },
    async resolveAccount(bankCode, accountNumber) {
      const q = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode });
      const data = await call<{ account_name: string }>(`/bank/resolve?${q}`);
      return { accountName: data.account_name };
    },
    async createRecipient({ bankCode, accountNumber, accountName }) {
      const data = await call<{ recipient_code: string }>('/transferrecipient', {
        method: 'POST',
        body: JSON.stringify({ type: 'nuban', name: accountName, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' }),
      });
      return { recipientCode: data.recipient_code };
    },
    async initiateTransfer({ reference, amount, recipientCode, reason }) {
      const data = await call<{ transfer_code: string; status: string }>('/transfer', {
        method: 'POST',
        body: JSON.stringify({ source: 'balance', amount, recipient: recipientCode, reference, reason }),
      });
      const status = data.status === 'success' ? 'succeeded' : data.status === 'failed' ? 'failed' : 'pending';
      return { providerRef: data.transfer_code, status };
    },
    // Dedicated virtual accounts: one Paystack customer per Pact, so each Pact gets its own
    // number. Needs dedicated accounts enabled on the Paystack business; not yet exercised
    // against the live API.
    async createPactAccount({ pactId, name }) {
      const customer = await call<{ customer_code: string }>('/customer', {
        method: 'POST',
        body: JSON.stringify({ email: `${pactId}@pacts.pact.invalid`, first_name: 'PACT', last_name: name.slice(0, 40), metadata: { pact_id: pactId } }),
      });
      const dva = await call<{ id: number; account_number: string; account_name: string; bank: { name: string } }>('/dedicated_account', {
        method: 'POST',
        body: JSON.stringify({ customer: customer.customer_code, preferred_bank: config.PAYSTACK_DVA_BANK }),
      });
      return { providerRef: String(dva.id), accountNumber: dva.account_number, bankName: dva.bank.name, accountName: dva.account_name };
    },
    async closePactAccount(providerRef) {
      await call(`/dedicated_account/${encodeURIComponent(providerRef)}`, { method: 'DELETE' });
    },
  };
}

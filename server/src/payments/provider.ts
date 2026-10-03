import type { BankDTO } from '../../../shared/contracts.js';

export type WebhookEventType = 'charge.success' | 'charge.failed' | 'transfer.success' | 'transfer.failed' | 'transfer.reversed' | 'transfer.received' | 'other';

export interface ParsedWebhook {
  /** Stable key for deduplicating redeliveries. */
  eventKey: string;
  type: WebhookEventType;
  reference: string;
  amount: number | null;
  currency: string | null;
  reason: string | null;
  /** For `transfer.received`: a bank transfer into a Pact's account number. */
  inbound?: { accountNumber: string; senderName: string; senderBank: string | null; senderAccount: string | null };
}

export interface CheckoutStatus {
  status: 'succeeded' | 'failed' | 'pending';
  /** What the customer actually paid, in kobo. Always checked against what we expected. */
  amountPaid: number | null;
  currency?: string | null;
  reason: string | null;
}

/**
 * Everything PACT needs from a payment processor. Collections (top-ups) and
 * disbursements (withdrawals) are both behind this interface so the processor
 * can be swapped or run side by side without touching the ledger.
 */
export interface PaymentProvider {
  name: 'sandbox' | 'paystack';
  initializeCheckout(input: {
    reference: string;
    amount: number;
    channel: 'card' | 'bank_transfer';
    /** `email` is the person's verified email when they have one; the provider falls back to a placeholder otherwise. */
    customer: { id: string; phone: string | null; name: string; email?: string };
    callbackUrl: string;
  }): Promise<{ checkoutUrl: string }>;
  verifyCheckout(reference: string): Promise<CheckoutStatus>;
  verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(body: unknown): ParsedWebhook | null;
  listBanks(): Promise<BankDTO[]>;
  resolveAccount(bankCode: string, accountNumber: string, hintName?: string): Promise<{ accountName: string }>;
  createRecipient(input: { bankCode: string; accountNumber: string; accountName: string }): Promise<{ recipientCode: string }>;
  initiateTransfer(input: { reference: string; amount: number; recipientCode: string; reason: string }): Promise<{ providerRef: string; status: 'pending' | 'succeeded' | 'failed'; reason?: string }>;
  /** A dedicated account number for one Pact (a virtual account at the partner bank). */
  createPactAccount(input: { pactId: string; name: string }): Promise<{ providerRef: string; accountNumber: string; bankName: string; accountName: string }>;
  closePactAccount(providerRef: string): Promise<void>;
}

/** Paystack-shaped webhook bodies. The sandbox emits the same shape. */
export function parsePaystackEvent(body: unknown): ParsedWebhook | null {
  if (!body || typeof body !== 'object') return null;
  const { event, data } = body as { event?: string; data?: Record<string, unknown> };
  if (typeof event !== 'string' || !data || typeof data.reference !== 'string') return null;
  const known: WebhookEventType[] = ['charge.success', 'charge.failed', 'transfer.success', 'transfer.failed', 'transfer.reversed'];
  let type = (known as string[]).includes(event) ? (event as WebhookEventType) : 'other';
  // A transfer into a dedicated account arrives as a charge on the "dedicated_nuban" channel.
  const auth = (data.authorization ?? {}) as Record<string, unknown>;
  // Names come from the sender's bank, but still: no control or text-direction characters
  // (which can make one name display as another) and no angle brackets.
  // eslint-disable-next-line no-control-regex
  const clean = (v: string) => v.replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF<>]/g, '').replace(/\s+/g, ' ').trim();
  const str = (v: unknown) => (typeof v === 'string' && clean(v) ? clean(v) : null);
  let inbound: ParsedWebhook['inbound'];
  if (event === 'charge.success' && (data.channel === 'dedicated_nuban' || auth.channel === 'dedicated_nuban')) {
    const accountNumber = str(auth.receiver_bank_account_number);
    if (!accountNumber) return null;
    type = 'transfer.received';
    inbound = {
      accountNumber,
      senderName: (str(auth.sender_name) ?? 'Unknown sender').slice(0, 100),
      senderBank: str(auth.sender_bank),
      senderAccount: str(auth.sender_bank_account_number),
    };
  }
  return {
    inbound,
    eventKey: `${event}:${data.reference}:${data.id ?? ''}`,
    type,
    reference: data.reference,
    amount: typeof data.amount === 'number' ? data.amount : null,
    currency: typeof data.currency === 'string' ? data.currency : null,
    reason: typeof data.gateway_response === 'string' ? data.gateway_response : typeof data.reason === 'string' ? data.reason : null,
  };
}

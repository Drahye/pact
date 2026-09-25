import type { BankDTO } from '../../../shared/contracts.js';

export type WebhookEventType = 'charge.success' | 'charge.failed' | 'transfer.success' | 'transfer.failed' | 'transfer.reversed' | 'other';

export interface ParsedWebhook {
  /** Stable key for deduplicating redeliveries. */
  eventKey: string;
  type: WebhookEventType;
  reference: string;
  amount: number | null;
  reason: string | null;
}

export interface CheckoutStatus {
  status: 'succeeded' | 'failed' | 'pending';
  /** What the customer actually paid, in kobo. Always checked against what we expected. */
  amountPaid: number | null;
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
    customer: { id: string; phone: string; name: string };
    callbackUrl: string;
  }): Promise<{ checkoutUrl: string }>;
  verifyCheckout(reference: string): Promise<CheckoutStatus>;
  verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(body: unknown): ParsedWebhook | null;
  listBanks(): Promise<BankDTO[]>;
  resolveAccount(bankCode: string, accountNumber: string, hintName?: string): Promise<{ accountName: string }>;
  createRecipient(input: { bankCode: string; accountNumber: string; accountName: string }): Promise<{ recipientCode: string }>;
  initiateTransfer(input: { reference: string; amount: number; recipientCode: string; reason: string }): Promise<{ providerRef: string; status: 'pending' | 'succeeded' | 'failed'; reason?: string }>;
}

/** Paystack-shaped webhook bodies. The sandbox emits the same shape. */
export function parsePaystackEvent(body: unknown): ParsedWebhook | null {
  if (!body || typeof body !== 'object') return null;
  const { event, data } = body as { event?: string; data?: Record<string, unknown> };
  if (typeof event !== 'string' || !data || typeof data.reference !== 'string') return null;
  const known: WebhookEventType[] = ['charge.success', 'charge.failed', 'transfer.success', 'transfer.failed', 'transfer.reversed'];
  const type = (known as string[]).includes(event) ? (event as WebhookEventType) : 'other';
  return {
    eventKey: `${event}:${data.reference}:${data.id ?? ''}`,
    type,
    reference: data.reference,
    amount: typeof data.amount === 'number' ? data.amount : null,
    reason: typeof data.gateway_response === 'string' ? data.gateway_response : typeof data.reason === 'string' ? data.reason : null,
  };
}

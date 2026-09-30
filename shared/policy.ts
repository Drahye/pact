/**
 * Product rules shared by the API (which enforces them) and the app (which explains them).
 * All money values are kobo.
 */

export const NGN = 100; // kobo per naira

export type KycTier = 1 | 2 | 3;

export interface TierLimits {
  label: string;
  requirement: string;
  maxBalance: number;
  dailyTopup: number;
  dailyWithdrawal: number;
  canRelease: boolean;
}

export const TIER_LIMITS: Record<KycTier, TierLimits> = {
  1: {
    label: 'Starter',
    requirement: 'Verified phone number',
    maxBalance: 300_000 * NGN,
    dailyTopup: 200_000 * NGN,
    dailyWithdrawal: 100_000 * NGN,
    canRelease: false,
  },
  2: {
    label: 'Verified',
    requirement: 'BVN verified',
    maxBalance: 5_000_000 * NGN,
    dailyTopup: 1_000_000 * NGN,
    dailyWithdrawal: 1_000_000 * NGN,
    canRelease: true,
  },
  3: {
    label: 'Plus',
    requirement: 'ID document and address',
    maxBalance: 50_000_000 * NGN,
    dailyTopup: 10_000_000 * NGN,
    dailyWithdrawal: 5_000_000 * NGN,
    canRelease: true,
  },
};

export const MIN_TOPUP = 100 * NGN;
export const MIN_CONTRIBUTION = 100 * NGN;
export const MIN_WITHDRAWAL = 500 * NGN;
export const MIN_VENDOR_PAYMENT = 500 * NGN;
/**
 * Vendor payments need the co-organiser's approval once this much would have gone out
 * without approval in 24 hours, so a large payment can't be split into small ones.
 */
export const VENDOR_APPROVAL_THRESHOLD = 200_000 * NGN;
/** Late transfers below this aren't sent back automatically (each return costs a transfer fee). */
export const MIN_AUTO_RETURN = 100 * NGN;
export const MIN_PACT_TARGET = 1_000 * NGN;
export const MAX_PACT_TARGET = 50_000_000 * NGN;
export const MAX_PACT_MEMBERS = 100;
export const MAX_PACT_DAYS = 365;

/** Card top-ups carry the processor's fee; bank transfers are free. */
export const CARD_FEE_RATE = 0.015;
export const CARD_FEE_CAP = 2_000 * NGN;
export const WITHDRAWAL_FEE = 50 * NGN;
/** Bank transfer fee on money leaving a Pact (vendors, returns to guests), paid from the pool. */
export const PACT_PAYOUT_FEE = 50 * NGN;

export const topupFee = (amount: number, channel: 'card' | 'bank_transfer') =>
  channel === 'card' ? Math.min(CARD_FEE_CAP, Math.ceil(amount * CARD_FEE_RATE)) : 0;

/** Days after a missed deadline before the Pact's rule runs on its own. */
export const MISSED_GOAL_GRACE_DAYS = 3;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 30;
export const NUDGE_COOLDOWN_HOURS = 24;

/** Texts to numbers not on PACT yet, per inviter per 24 hours. */
export const SMS_INVITES_PER_DAY = 30;

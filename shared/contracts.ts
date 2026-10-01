import { z } from 'zod';
import { MAX_PACT_TARGET, MIN_CONTRIBUTION, MIN_PACT_TARGET, MIN_TOPUP, MIN_VENDOR_PAYMENT, MIN_WITHDRAWAL, type KycTier } from './policy';

/* ==========================================================================
   Request bodies: validated by the API with these exact schemas.
   Amounts are integer kobo.
   ========================================================================== */

const kobo = (min: number) => z.number().int().min(min).max(MAX_PACT_TARGET);
const pin = z.string().regex(/^\d{4}$/, 'PIN must be 4 digits');
const phone = z.string().trim().min(10).max(20);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
/**
 * Free text from people: trimmed, length-capped, and free of control characters and
 * bidirectional overrides (which can make one name display as another). React escapes
 * on render; this keeps stored data clean for SMS, exports and any future surface.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]/;
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !UNSAFE.test(v), 'Remove unusual or invisible characters.')
    .refine((v) => !/[<>]/.test(v), 'Angle brackets aren’t allowed.');
const name = text(1, 40).refine((v) => /^[\p{L}\p{M}' .-]+$/u.test(v), 'Use letters only.');

export const categories = ['birthday', 'trip', 'wedding', 'gift', 'event', 'dinner', 'household', 'fund', 'other'] as const;
export const participations = ['money', 'task', 'both', 'later'] as const;

export const OtpRequestBody = z.object({ phone });
export const OtpVerifyBody = z.object({ phone, code: z.string().regex(/^\d{6}$/), device: text(0, 80).optional() });
export const PinResetBody = z.object({ code: z.string().regex(/^\d{6}$/), newPin: pin });
export const SignupBody = z.object({
  signupToken: z.string().min(10),
  firstName: name,
  lastName: name,
  pin,
  referralCode: z.string().trim().regex(/^[A-Za-z0-9]{0,12}$/).optional(),
});
export const RefreshBody = z.object({ refreshToken: z.string().min(20).optional() });

const budgetLine = z.object({ name: text(1, 60), amount: kobo(100) });

const itemLine = z.object({
  name: text(1, 60),
  price: kobo(100_00),
  options: z.array(text(1, 30)).max(12).default([]),
  stock: z.number().int().min(1).max(10_000).nullable().optional(),
});

export const CreatePactBody = z
  .object({
    title: text(1, 60),
    note: text(0, 280).optional(),
    category: z.enum(categories),
    /** Ignored when a budget is given: the target is then the budget total, worked out on the server. */
    target: kobo(MIN_PACT_TARGET).optional(),
    deadline: isoDate,
    missedGoalPolicy: z.enum(['refund', 'release']).default('refund'),
    splitMode: z.enum(['flexible', 'equal']).default('flexible'),
    budget: z.array(budgetLine).max(12).default([]),
    tasks: z.array(z.object({ title: text(1, 80) })).max(12).default([]),
    inviteUserIds: z.array(z.string().uuid()).max(50).default([]),
    invitePhones: z.array(phone).max(50).default([]),
    /** `orders`: people order items and the total is what they order (aso-ebi, souvenirs, tickets). */
    mode: z.enum(['goal', 'orders']).default('goal'),
    items: z.array(itemLine).max(20).default([]),
  })
  .refine((b) => b.mode === 'orders' || b.budget.length > 0 || b.target !== undefined, { message: 'Set a target or add what the money covers.', path: ['target'] })
  .refine((b) => b.mode !== 'orders' || b.items.length > 0, { message: 'Add at least one item people can order.', path: ['items'] });
export const ItemBody = itemLine;
export const ItemPatchBody = itemLine.partial().extend({ active: z.boolean().optional() });
export const OrderBody = z.object({ itemId: z.string().uuid(), option: text(1, 30).nullable().optional(), quantity: z.number().int().min(1).max(50) });
export const InviteBody = z.object({
  userIds: z.array(z.string().uuid()).max(50).default([]),
  phones: z.array(phone).max(50).default([]),
});
export const ContributeBody = z.object({ amount: kobo(MIN_CONTRIBUTION), pin });
export const PinBody = z.object({ pin });
export const CommentBody = z.object({ body: text(1, 500) });
export const UpdateBody = z.object({ body: text(1, 500) });
export const ReactBody = z.object({ reaction: z.enum(['thumbs_up', 'heart', 'celebrate', 'raised_hands']), on: z.boolean() });
export const PinItemBody = z.object({ activityId: z.string().uuid().nullable() });
/** Completing a Pact: with money left in the pool the organiser must say what happens to it, with their PIN. */
export const CompleteBody = z.object({ releaseRemaining: z.boolean().optional(), pin: pin.optional() });
export const ParticipationBody = z.object({ participation: z.enum(participations) });
export const BudgetItemBody = budgetLine;
export const BudgetItemPatchBody = budgetLine.partial();
export const TaskCreateBody = z.object({ title: text(1, 80), budgetItemId: z.string().uuid().nullable().optional(), assigneeId: z.string().uuid().nullable().optional() });
export const TaskPatchBody = z.object({
  title: text(1, 80).optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional(),
  /** `me` claims it, `null` unassigns, an id assigns (organiser only). */
  assigneeId: z.union([z.literal('me'), z.string().uuid(), z.null()]).optional(),
});
export const MemoryBody = z.object({ note: text(0, 500).nullable().optional(), happenedOn: isoDate.nullable().optional() });

/** With `pactId`, the payment goes straight into that Pact once it settles (direct pay). */
export const TopupBody = z.object({ amount: kobo(MIN_TOPUP), channel: z.enum(['card', 'bank_transfer']), pactId: z.string().uuid().optional() });
export const WithdrawBody = z.object({ amount: kobo(MIN_WITHDRAWAL), bankAccountId: z.string().uuid(), pin });
export const ResolveBankBody = z.object({ bankCode: z.string().regex(/^\d{3,6}$/), accountNumber: z.string().regex(/^\d{10}$/, 'Account numbers are 10 digits') });
export const AddBankBody = ResolveBankBody.extend({ pin });

/** Paying a vendor from a Pact. The account is checked with the bank before anything moves. */
export const VendorPayBody = ResolveBankBody.extend({
  amount: kobo(MIN_VENDOR_PAYMENT),
  purpose: text(1, 80),
  budgetItemId: z.string().uuid().nullable().optional(),
  pin,
});
/** "I'll add this much by this date." */
export const PledgeBody = z.object({ amount: kobo(MIN_CONTRIBUTION), dueOn: isoDate });
/** A transfer that came in: count it for this member, or `null` to show it as a guest. */
export const AssignTransferBody = z.object({ userId: z.string().uuid().nullable() });
/** `null` removes the co-organiser. */
export const CoOrganizerBody = z.object({ userId: z.string().uuid().nullable() });

export const VerifyBvnBody = z.object({ bvn: z.string().regex(/^\d{11}$/, 'BVN is 11 digits'), dateOfBirth: isoDate });
export const ChangePinBody = z.object({ currentPin: pin, newPin: pin });
export const UpdateProfileBody = z.object({ firstName: name.optional(), lastName: name.optional() });

export type CreatePactInput = z.input<typeof CreatePactBody>;

/* ==========================================================================
   Responses
   ========================================================================== */

export interface PersonDTO {
  id: string;
  firstName: string;
  lastName: string;
  color: string;
  tint: 'mint' | 'peach' | 'lilac' | 'sky' | 'sand';
  photoUrl: string | null;
}

export interface MeDTO extends PersonDTO {
  phone: string;
  kycTier: KycTier;
  bvnLast4: string | null;
  hasPin: boolean;
  referralCode: string;
  createdAt: string;
}

export interface AuthTokensDTO {
  accessToken: string;
  accessTokenExpiresAt: string;
  /** Returned to native clients. Browsers get it as an httpOnly cookie instead. */
  refreshToken?: string;
  user: MeDTO;
}

export type OtpVerifyDTO =
  | ({ status: 'signed_in' } & AuthTokensDTO)
  | { status: 'needs_profile'; signupToken: string; phone: string };

export interface WalletDTO {
  balance: number;
  currency: 'NGN';
  tier: KycTier;
  usage: { topupToday: number; withdrawnToday: number };
}

export type WalletTxnKind = 'topup' | 'contribution' | 'pact_release' | 'withdrawal' | 'withdrawal_reversal' | 'refund' | 'vendor_payment_reversal';

export interface WalletTxnDTO {
  id: string;
  kind: WalletTxnKind;
  amount: number; // signed: + into the wallet, - out of it
  balanceAfter: number;
  description: string;
  reference: string;
  pactId: string | null;
  pactTitle: string | null;
  createdAt: string;
}

export type PactStatus = 'open' | 'funded' | 'released' | 'refunded' | 'cancelled';

export type Participation = (typeof participations)[number];

export type PactRole = 'organizer' | 'co_organizer' | 'member';

export interface PactMemberDTO {
  userId: string;
  role: PactRole;
  status: 'invited' | 'joined' | 'left';
  contributed: number;
  joinedAt: string | null;
  participation: Participation | null;
  /** This person's colour inside this Pact (unique within the Pact where possible). */
  color: string;
  /** Set by "split the rest": what the group asked this person to add. */
  requestedAmount: number | null;
}

export interface BudgetItemDTO {
  id: string;
  name: string;
  amount: number;
  /** Raised money fills items in order. */
  funded: number;
  /** Paid to vendors against this line: only payments the bank has confirmed. */
  paid: number;
  /** On its way but not confirmed yet: waiting for an approval, or with the bank. Never counted as paid. */
  pending: number;
  /** The part of `pending` that is waiting for a co-organiser to approve it. */
  waiting: number;
  position: number;
}

/** The Pact's own account number: anyone can pay it from any bank app. */
export interface PactBankAccountDTO {
  accountNumber: string;
  bankName: string;
  accountName: string;
  status: 'active' | 'closed';
}

/** A bank transfer into the Pact. `userId` null means a guest, shown by their bank name. */
export interface PactTransferDTO {
  id: string;
  amount: number;
  senderName: string;
  senderBank: string | null;
  userId: string | null;
  matchedBy: 'name' | 'organizer' | null;
  status: 'credited' | 'returned' | 'refunded' | 'held';
  createdAt: string;
}

/** Something people can order in an order Pact. `ordered` counts everyone's active orders. */
export interface PactItemDTO {
  id: string;
  name: string;
  price: number;
  options: string[];
  stock: number | null;
  ordered: number;
  active: boolean;
}

/** An order. Members see their own; organisers see everyone's (the order sheet). */
export interface PactOrderDTO {
  id: string;
  itemId: string;
  userId: string;
  option: string | null;
  quantity: number;
  amount: number;
  status: 'active' | 'lapsed';
  /** Covered by the person's payments, oldest order first. */
  paid: boolean;
  createdAt: string;
}

/** "I'll add ₦X by this date." `remaining` is what's still to add before it's kept. */
export interface PactPledgeDTO {
  id: string;
  userId: string;
  amount: number;
  dueOn: string;
  source: 'member' | 'orders';
  status: 'open' | 'kept' | 'cancelled' | 'closed';
  remaining: number;
  /** Reminders PACT has sent so far (at most two). */
  reminded: number;
}

export type PactPayoutStatus = 'awaiting_approval' | 'pending' | 'processing' | 'succeeded' | 'failed' | 'rejected' | 'cancelled';

/** Money that left the Pact to a bank account, visible to every member. */
export interface PactPayoutDTO {
  id: string;
  kind: 'vendor' | 'guest_refund' | 'transfer_return';
  amount: number;
  fee: number;
  accountName: string;
  bankName: string;
  last4: string;
  purpose: string | null;
  budgetItemId: string | null;
  status: PactPayoutStatus;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  hasReceipt: boolean;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskDTO {
  id: string;
  title: string;
  budgetItemId: string | null;
  assigneeId: string | null;
  status: 'open' | 'in_progress' | 'done';
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface MemoryDTO {
  note: string | null;
  happenedOn: string | null;
  photoIds: string[];
  updatedAt: string;
}

export interface PactDTO {
  id: string;
  slug: string;
  inviteCode: string;
  title: string;
  note: string | null;
  category: (typeof categories)[number];
  target: number;
  raised: number;
  poolBalance: number;
  deadline: string;
  createdAt: string;
  organizerId: string;
  status: PactStatus;
  missedGoalPolicy: 'refund' | 'release';
  splitMode: 'flexible' | 'equal';
  fundedAt: string | null;
  /** Set when the organiser says the plan actually happened. Funded is the money; this is the outcome. */
  completedAt: string | null;
  closedAt: string | null;
  members: PactMemberDTO[];
  pendingPhoneInvites: number;
  budget: BudgetItemDTO[];
  tasks: TaskDTO[];
  memory: MemoryDTO | null;
  mode: 'goal' | 'orders';
  items: PactItemDTO[];
  orders: PactOrderDTO[];
  pledges: PactPledgeDTO[];
  /** Waiting for the co-organiser to approve releasing the pool to the organiser. */
  releaseRequest: { requestedBy: string; requestedAt: string } | null;
  bankAccount: PactBankAccountDTO | null;
  transfers: PactTransferDTO[];
  payouts: PactPayoutDTO[];
  /** The one pinned item, if any. Filled in on the detail endpoint. */
  pinned: PinnedDTO | null;
  viewer: { role: PactRole | null; status: 'invited' | 'joined' | 'left' | null; suggestedShare: number };
}

export interface PactPreviewDTO {
  title: string;
  category: PactDTO['category'];
  target: number;
  raised: number;
  deadline: string;
  status: PactStatus;
  mode: 'goal' | 'orders';
  memberCount: number;
  organizer: { firstName: string; color: string; photoUrl: string | null };
  /** Set while the Pact is taking money and has an account number: pay by transfer without the app. */
  bankAccount: { accountNumber: string; bankName: string; accountName: string } | null;
}

/** The small, fixed set of reactions. No picker, no custom emoji. */
export const REACTIONS = ['thumbs_up', 'heart', 'celebrate', 'raised_hands'] as const;
export type ReactionKey = (typeof REACTIONS)[number];
export const COMMENT_MAX = 500;

export interface ActivityDTO {
  id: string;
  pactId: string;
  type:
    | 'created' | 'join' | 'contribution' | 'completed' | 'released' | 'refunded' | 'cancelled' | 'nudge' | 'left'
    | 'committed' | 'task_added' | 'task_claimed' | 'task_done' | 'milestone' | 'split_requested' | 'memory_added'
    | 'guest_contribution' | 'vendor_paid' | 'co_organizer' | 'release_requested' | 'pledged' | 'pledge_kept' | 'ordered' | 'orders_closed' | 'pact_completed';
  actorId: string | null;
  amount: number | null;
  /** Short context, e.g. a task title or a milestone percentage. */
  detail: string | null;
  at: string;
  /** The text of an organiser's update (type 'update'); null for automatic activity. */
  body: string | null;
  /** How many of each reaction. Only reactions with at least one appear. */
  reactions: Partial<Record<ReactionKey, number>>;
  /** What the viewer has reacted with. */
  myReactions: ReactionKey[];
  commentCount: number;
}

export interface PinnedDTO {
  activity: ActivityDTO;
  pinnedBy: string;
  pinnedAt: string;
}

export interface CommentDTO {
  id: string;
  activityId: string;
  userId: string;
  /** Empty once removed: the thread shows "Comment removed". */
  body: string;
  deleted: boolean;
  createdAt: string;
}

export interface ThreadDTO {
  activity: ActivityDTO;
  comments: CommentDTO[];
  /** Whether the viewer may add comments and reactions right now (false once a Pact is closed). */
  canReply: boolean;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  pactId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface TopupDTO {
  reference: string;
  status: 'pending' | 'succeeded' | 'failed' | 'abandoned';
  channel: 'card' | 'bank_transfer';
  amount: number;
  fee: number;
  checkoutUrl: string | null;
  failureReason: string | null;
  createdAt: string;
  /** Set for direct payments into a Pact. */
  pactId: string | null;
}

export interface BankDTO {
  code: string;
  name: string;
}

export interface BankAccountDTO {
  id: string;
  bankCode: string;
  bankName: string;
  last4: string;
  accountName: string;
  isDefault: boolean;
}

export interface WithdrawalDTO {
  id: string;
  reference: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  amount: number;
  fee: number;
  bankAccount: BankAccountDTO;
  failureReason: string | null;
  createdAt: string;
}

export interface SessionDTO {
  id: string;
  device: string;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface ApiErrorDTO {
  error: { code: string; message: string; details?: Record<string, unknown> };
  requestId?: string;
}

/** List endpoints return people alongside ids so clients can render names and colours. */
export interface WithPeople<T> {
  data: T;
  people: PersonDTO[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

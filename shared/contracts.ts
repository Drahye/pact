import { z } from 'zod';
import { MAX_PACT_TARGET, MIN_CONTRIBUTION, MIN_PACT_TARGET, MIN_TOPUP, MIN_WITHDRAWAL, type KycTier } from './policy';

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
  })
  .refine((b) => b.budget.length > 0 || b.target !== undefined, { message: 'Set a target or add what the money covers.', path: ['target'] });
export const InviteBody = z.object({
  userIds: z.array(z.string().uuid()).max(50).default([]),
  phones: z.array(phone).max(50).default([]),
});
export const ContributeBody = z.object({ amount: kobo(MIN_CONTRIBUTION), pin });
export const PinBody = z.object({ pin });
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

export type WalletTxnKind = 'topup' | 'contribution' | 'pact_release' | 'withdrawal' | 'withdrawal_reversal' | 'refund';

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

export interface PactMemberDTO {
  userId: string;
  role: 'organizer' | 'member';
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
  position: number;
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
  closedAt: string | null;
  members: PactMemberDTO[];
  pendingPhoneInvites: number;
  budget: BudgetItemDTO[];
  tasks: TaskDTO[];
  memory: MemoryDTO | null;
  viewer: { role: 'organizer' | 'member' | null; status: 'invited' | 'joined' | 'left' | null; suggestedShare: number };
}

export interface PactPreviewDTO {
  title: string;
  category: PactDTO['category'];
  target: number;
  raised: number;
  deadline: string;
  status: PactStatus;
  memberCount: number;
  organizer: { firstName: string; color: string; photoUrl: string | null };
}

export interface ActivityDTO {
  id: string;
  pactId: string;
  type:
    | 'created' | 'join' | 'contribution' | 'completed' | 'released' | 'refunded' | 'cancelled' | 'nudge' | 'left'
    | 'committed' | 'task_added' | 'task_claimed' | 'task_done' | 'milestone' | 'split_requested' | 'memory_added';
  actorId: string | null;
  amount: number | null;
  /** Short context, e.g. a task title or a milestone percentage. */
  detail: string | null;
  at: string;
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

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
    /** Optional: the Circle this Pact belongs to. The server checks the person is in it. */
    circleId: z.string().uuid().optional(),
    /** Optional: the Plan this Pact is made from. The server checks it is theirs and still free. */
    planId: z.string().uuid().optional(),
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

/* ---- Circles: the people I regularly make things happen with */
export const CIRCLE_TINTS = ['mint', 'sun', 'sky', 'lilac', 'pink', 'coral'] as const;
export type CircleTint = (typeof CIRCLE_TINTS)[number];
const emoji = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .refine((v) => /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(v) && !/[A-Za-z0-9<>]/.test(v), 'Pick an emoji.');
export const CreateCircleBody = z.object({ name: text(1, 40), emoji, tint: z.enum(CIRCLE_TINTS).default('mint') });
export const UpdateCircleBody = z.object({ name: text(1, 40).optional(), emoji: emoji.optional(), tint: z.enum(CIRCLE_TINTS).optional() }).refine((b) => Object.keys(b).length > 0, 'Nothing to change.');

/* ---- Ask the group */
export const ASK_TYPES = ['choice', 'attendance'] as const;
export type AskType = (typeof ASK_TYPES)[number];
export type Attendance = 'in' | 'maybe' | 'out';
export const CreateAskBody = z
  .object({
    type: z.enum(ASK_TYPES),
    title: text(1, 80),
    options: z.array(text(1, 40)).max(6).optional(),
    from: z.enum(['circle', 'home', 'nav']).default('circle'),
    /** Optional: the Plan this question belongs to. */
    planId: z.string().uuid().optional(),
  })
  .superRefine((b, ctx) => {
    if (b.type === 'choice') {
      const labels = (b.options ?? []).map((o) => o.toLowerCase());
      if (labels.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least two options.' });
      else if (new Set(labels).size !== labels.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Each option needs to be different.' });
    } else if (b.options?.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Who’s in? has fixed answers.' });
  });
export const AskResponseBody = z
  .object({ optionId: z.string().uuid().optional(), attendance: z.enum(['in', 'maybe', 'out']).optional(), afterAuth: z.boolean().optional() })
  .refine((b) => (b.optionId !== undefined) !== (b.attendance !== undefined), 'Choose one answer.');
export const AskSharedBody = z.object({ via: z.enum(['native', 'copy']) });

/* ---- Plans */
export const PLAN_STATUSES = ['planning', 'confirmed', 'done', 'cancelled'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
const optText = (max: number) => text(1, max).nullable().optional();
export const CreatePlanBody = z
  .object({
    title: text(1, 80),
    category: z.enum(categories).default('event'),
    description: text(1, 280).optional(),
    date: isoDate.optional(),
    endDate: isoDate.optional(),
    location: text(1, 80).optional(),
    roughBudget: kobo(0).optional(),
  })
  .refine((b) => !b.endDate || (b.date && b.endDate >= b.date), { message: 'The end date needs to be on or after the start.', path: ['endDate'] });
export const UpdatePlanBody = z
  .object({
    title: text(1, 80).optional(),
    category: z.enum(categories).optional(),
    description: optText(280),
    date: isoDate.nullable().optional(),
    endDate: isoDate.nullable().optional(),
    location: optText(80),
    roughBudget: kobo(0).nullable().optional(),
    /** Set once the organiser has agreed to a change that affects people who have already answered. */
    confirm: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).filter((k) => k !== 'confirm').length > 0, 'Nothing to change.');
export const PlanRsvpOpenBody = z.object({ open: z.boolean() });
export const PlanStatusBody = z.object({ status: z.enum(PLAN_STATUSES) });
export const PlanRsvpBody = z.object({ status: z.enum(['in', 'maybe', 'out']), afterAuth: z.boolean().optional() });
export const PlanTaskBody = z.object({ title: text(1, 80), assigneeId: z.string().uuid().nullable().optional() });
export const PlanTaskPatchBody = z
  .object({ title: text(1, 80).optional(), assigneeId: z.string().uuid().nullable().optional(), status: z.enum(['open', 'done']).optional() })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to change.');
export const LinkAskBody = z.object({ askId: z.string().uuid() });

/* ---- Home and Recaps */
export type NeedsYouType = 'ask' | 'attendance' | 'plan_rsvp' | 'plan_task' | 'split_debt' | 'split_collect' | 'pact_contribution' | 'pact_task' | 'pact_approval';
export type HomeObject = 'ask' | 'plan' | 'split' | 'pact';

/** One thing the viewer can act on now. Several actions on the same object are one card. */
export interface NeedsYouItem {
  id: string;
  /** The most important action on this object. */
  type: NeedsYouType;
  objectType: HomeObject;
  sourceId: string;
  circleId?: string;
  circle?: { name: string; emoji: string; tint: CircleTint } | null;
  title: string;
  /** One plain sentence: "You still owe ₦12,500". */
  context: string;
  /** Short labels for the actions on this object: ["RSVP", "Vote", "1 task"]. One entry when it is a single action. */
  parts: string[];
  actionLabel: string;
  actionUrl: string;
  /** Higher first. Deterministic: see server/src/modules/home.ts. */
  priority: number;
  dueAt?: string;
}

export interface HomeCircleDTO {
  id: string;
  name: string;
  emoji: string;
  tint: CircleTint;
  memberCount: number;
  memberIds: string[];
  /** One live line. */
  signal: { text: string; kind: 'needs_you' | 'soon' | 'plan' | 'split' | 'pact' | 'recent' | 'quiet' };
}

export interface ComingUpItem {
  kind: 'plan' | 'pact';
  id: string;
  title: string;
  emoji: string;
  date: string;
  endDate: string | null;
  text: string;
  url: string;
}

export interface RecentItem {
  id: string;
  objectType: HomeObject;
  actorId: string | null;
  text: string;
  at: string;
  url: string;
}

export interface RecapCardDTO {
  kind: 'plan' | 'pact' | 'split';
  id: string;
  title: string;
  emoji: string;
  circleName: string | null;
  completedAt: string;
  people: number;
  url: string;
}

export interface HomeDTO {
  state: 'new' | 'active' | 'finished_only';
  needsYou: NeedsYouItem[];
  needsYouTotal: number;
  circles: HomeCircleDTO[];
  comingUp: ComingUpItem[];
  recent: RecentItem[];
  recaps: RecapCardDTO[];
}

export interface RecapDTO {
  kind: 'plan' | 'pact' | 'split';
  title: string;
  emoji: string;
  circle: { name: string; emoji: string; tint: CircleTint } | null;
  /** "We made it happen." / "All settled ✓" */
  headline: string;
  completedAt: string;
  /** Short labelled numbers: people, decisions, tasks, days. Never someone's debt. */
  metrics: { label: string; value: string }[];
  when: string | null;
  /** Members only: who was part of it. */
  personIds: string[];
  /** Members only. */
  share: { token: string | null; canManage: boolean } | null;
}

/* ---- Splits */
export const SPLIT_STATUSES = ['open', 'settled', 'cancelled'] as const;
export type SplitStatus = (typeof SPLIT_STATUSES)[number];
const splitPerson = z.object({ userId: z.string().uuid(), amount: z.number().int().min(1).max(MAX_PACT_TARGET).optional() });
export const CreateSplitBody = z.object({
  title: text(1, 80),
  total: kobo(100),
  /** Defaults to the person creating it. */
  paidBy: z.string().uuid().optional(),
  mode: z.enum(['equal', 'custom']).default('equal'),
  /** Everyone included, the payer too if they share the cost. Custom splits carry each person's amount. */
  participants: z.array(splitPerson).min(1).max(30),
});
/** The title can change any time. Anything else changes who owes what, so it is refused once someone has settled. */
export const UpdateSplitBody = z
  .object({
    title: text(1, 80).optional(),
    total: kobo(100).optional(),
    paidBy: z.string().uuid().optional(),
    mode: z.enum(['equal', 'custom']).optional(),
    participants: z.array(splitPerson).min(1).max(30).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to change.');
export const SplitSettleBody = z.object({ settled: z.boolean(), afterAuth: z.boolean().optional() });
export const SplitSharedBody = z.object({ via: z.enum(['native', 'copy']) });

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

export interface PlanSummaryDTO {
  id: string;
  circleId: string;
  circle: { name: string; emoji: string; tint: CircleTint };
  title: string;
  category: (typeof categories)[number];
  date: string | null;
  endDate: string | null;
  location: string | null;
  status: PlanStatus;
  pactId: string | null;
  /** The organiser can close answers. Existing answers stay. */
  rsvpOpen: boolean;
  counts: { in: number; maybe: number; out: number };
  memberCount: number;
  /** The viewer's RSVP. */
  mine: Attendance | null;
  /** Linked questions that are still open. */
  undecided: number;
  tasksOpen: number;
  createdAt: string;
}

export interface PlanDTO extends PlanSummaryDTO {
  description: string | null;
  /** Kobo. Hidden from link visitors. */
  roughBudget: number | null;
  createdBy: string;
  rsvps: { userId: string; status: Attendance; at: string }[];
  /** Circle members who have not responded (members only). */
  waiting: string[];
  tasks: { id: string; title: string; assigneeId: string | null; status: 'open' | 'done'; createdBy: string; completedAt: string | null }[];
  /** Linked questions, never copies. Empty for link visitors. */
  asks: AskSummaryDTO[];
  decisions: number;
  activity: { kind: 'created' | 'rsvp' | 'rsvp_changed' | 'task_added' | 'task_done' | 'ask_linked' | 'confirmed' | 'done' | 'cancelled' | 'pact' | 'date_changed' | 'location_changed'; userId: string; status: Attendance | null; detail: string | null; at: string }[];
  isMember: boolean;
  canEdit: boolean;
  /** The organiser may turn it into a Pact: not cancelled, and not already one. */
  canMakePact: boolean;
  /** Members receive the link to share. */
  shareToken: string | null;
}

/** What a Plan carries into the existing Pact creation form. Nothing is created until the organiser confirms there. */
export interface PactDraftDTO {
  planId: string;
  title: string;
  category: (typeof categories)[number];
  circleId: string;
  /** A sensible deadline: a couple of days before the plan, if that is still ahead. */
  deadline: string | null;
  /** Kobo, from the rough budget. */
  target: number | null;
  tasks: string[];
  /** Circle mates who said they are in or maybe. */
  inviteUserIds: string[];
}

export interface SplitShareDTO {
  userId: string;
  /** Kobo. */
  amount: number;
  /** The payer's own portion is 'not_applicable': they paid it originally, so it is neither owed nor settled. */
  status: 'not_applicable' | 'owed' | 'settled';
  /** The person who paid: their own share is never "owed". */
  isPayer: boolean;
  settledAt: string | null;
  settledBy: string | null;
  /** The viewer may mark this share settled or owed again. */
  canChange: boolean;
}

export interface SplitSummaryDTO {
  id: string;
  circleId: string;
  circle: { name: string; emoji: string; tint: CircleTint };
  title: string;
  /** Kobo. */
  total: number;
  status: SplitStatus;
  paidBy: string;
  createdBy: string;
  mode: 'equal' | 'custom';
  /** People who owe the payer (the payer's own share is not counted). */
  owedCount: number;
  settledCount: number;
  /** Kobo the payer is owed in all: every allocation except the payer's own. */
  owedTotal: number;
  /** Kobo still unsettled. */
  unsettled: number;
  /** The viewer's own share, if they have one. */
  mine: { amount: number; status: 'not_applicable' | 'owed' | 'settled'; isPayer: boolean } | null;
  createdAt: string;
  settledAt: string | null;
}

export interface SplitDTO extends SplitSummaryDTO {
  shares: SplitShareDTO[];
  activity: { kind: 'created' | 'settled' | 'unsettled' | 'completed' | 'reopened' | 'cancelled'; userId: string; targetId: string | null; amount: number | null; at: string }[];
  canEdit: boolean;
  /** Total, payer, method and amounts can only change before anyone settles. */
  canEditStructure: boolean;
  canCancel: boolean;
  /** Members receive the link to share. */
  shareToken: string | null;
}

/** What a share link shows: the Split in general, and the viewer's own share once they are signed in. No other shares. */
export interface SplitLinkDTO {
  circle: { name: string; emoji: string; tint: CircleTint };
  title: string;
  total: number;
  status: SplitStatus;
  paidBy: string;
  owedCount: number;
  settledCount: number;
  mine: { amount: number; status: 'not_applicable' | 'owed' | 'settled'; isPayer: boolean } | null;
  signedIn: boolean;
  isMember: boolean;
  canJoinCircle: boolean;
  /** Members go to the full Split. */
  splitId: string | null;
}

export interface SplitNeedDTO {
  splitId: string;
  title: string;
  circle: { name: string; emoji: string; tint: CircleTint };
  kind: 'owe' | 'collect';
  /** "You still owe ₦15,625", "2 people still need to settle". */
  text: string;
}

export interface PlanNeedDTO {
  planId: string;
  title: string;
  circle: { name: string; emoji: string; tint: CircleTint };
  kind: 'rsvp' | 'task' | 'soon';
  /** "Are you coming?", "You're handling “Pick hotel”", "Starts Sunday". */
  text: string;
}

export interface AskSummaryDTO {
  id: string;
  /** The Plan it is linked to, if any. */
  planId: string | null;
  circleId: string;
  circle: { name: string; emoji: string; tint: CircleTint };
  type: AskType;
  title: string;
  status: 'open' | 'closed';
  responseCount: number;
  memberCount: number;
  /** The viewer has answered. */
  answered: boolean;
  /** "Labadi is winning", "5 in · 2 maybe", "Labadi won with 4 votes". */
  headline: string;
  createdAt: string;
}

export interface AskDTO extends AskSummaryDTO {
  createdBy: string;
  closedAt: string | null;
  options: { id: string; label: string; count: number }[];
  attendance: { in: number; maybe: number; out: number };
  /** Who answered what, newest first. First names and avatars only. */
  responders: { userId: string; optionId: string | null; attendance: Attendance | null; at: string }[];
  /** Circle members who have not answered yet (members only; never shown to link visitors). */
  waiting: string[];
  activity: { kind: 'responded' | 'changed' | 'closed'; userId: string; optionId: string | null; attendance: Attendance | null; at: string }[];
  /** The viewer's own answer. */
  mine: { optionId: string | null; attendance: Attendance | null } | null;
  /** The viewer is in the Circle. */
  isMember: boolean;
  canClose: boolean;
  /** Members receive the link to share. */
  shareToken: string | null;
}

export interface CircleSummaryDTO {
  id: string;
  name: string;
  emoji: string;
  tint: CircleTint;
  memberCount: number;
  /** A few member ids for the avatar stack. */
  memberIds: string[];
  role: 'owner' | 'member';
  /** One useful live line, if the Circle has something going on. */
  live: { text: string; needsYou: boolean } | null;
}

export interface CircleDTO extends CircleSummaryDTO {
  members: { userId: string; role: 'owner' | 'member'; joinedAt: string | null }[];
  /** What has happened in the Circle so far, newest first. Phase 1: it was made, people joined. */
  activity: { type: 'created' | 'joined'; actorId: string; at: string }[];
  /** The link people can use to join. Only joined members ever receive it. */
  invite: { token: string } | null;
  /** How many Pacts belong to this Circle (that the viewer is also in). */
  pactCount: number;
}

export interface CircleInvitePreviewDTO {
  circleId: string;
  name: string;
  emoji: string;
  tint: CircleTint;
  memberCount: number;
  inviter: { firstName: string; color: string; photoUrl: string | null };
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
  /** The Circle this Pact belongs to, if any. */
  circleId: string | null;
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

/** Safe details about what a notification is about. Amounts are kobo. Nothing here is ever a bank or identity detail. */
export interface NotificationMeta {
  actor?: string;
  amount?: number;
  purpose?: string;
  payee?: string;
  taskName?: string;
  reason?: string;
  about?: string;
  preview?: string;
  pinned?: boolean;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  pactId: string | null;
  /** The Pact's name, for context under the message. */
  pactTitle: string | null;
  /** What it is about inside the Pact (an activity item for threads); used to open the right place. */
  refId: string | null;
  /** How many events this one line stands for ("3 new contributions"). */
  count: number;
  meta: NotificationMeta;
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

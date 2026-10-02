/**
 * The communication template system: one data model and one registry for the moments that matter in a Pact's life.
 * Nothing here knows about React or CSS, so the copy and the data rules can be tested on their own and reused later
 * (a transactional email, a share card) without touching the screens.
 */

export type CommunicationKind =
  | 'welcome'
  | 'invite'
  | 'joined'
  | 'member_joined'
  | 'contribution'
  | 'task_assigned'
  | 'task_completed'
  | 'funded'
  | 'execute'
  | 'payment_approval'
  | 'payment_success'
  | 'payment_failed'
  | 'organizer_update'
  | 'completed'
  | 'balance_released'
  | 'reply';

export const COMMUNICATION_KINDS: CommunicationKind[] = [
  'welcome', 'invite', 'joined', 'funded', 'payment_approval', 'completed',
  'member_joined', 'contribution', 'task_completed', 'organizer_update', 'payment_success', 'payment_failed',
  'task_assigned', 'reply', 'balance_released', 'execute',
];

/** How it should feel: celebrate (milestones), calm (information), action (it needs you), alert (something went wrong). */
export type Tone = 'celebrate' | 'calm' | 'action' | 'alert';

/** Icon names, resolved to real icons in icons.tsx so this file stays free of UI code. */
export type IconName = 'sparkles' | 'mail' | 'user-plus' | 'coins' | 'list-checks' | 'check-circle' | 'party' | 'wallet' | 'shield-check' | 'alert' | 'megaphone' | 'message' | 'hand-coins';

export interface BudgetLineData {
  name: string;
  amount: number;
  status: 'not_paid' | 'pending' | 'paid';
}

/**
 * One shared shape for every template. A template reads only the fields it needs, and anything missing falls back
 * to calm, generic wording rather than showing a blank. Amounts are naira, the app's view-model unit.
 */
export interface CommunicationData {
  pactId?: string;
  pactName: string;
  /** Who the message is for, when it helps to say their name. */
  recipientName?: string;
  /** The person the event is about (who joined, who paid, who asked). */
  actorName?: string;
  organizerName?: string;
  /** What the Pact is for, in a few words. */
  purpose?: string;
  targetAmount?: number;
  raisedAmount?: number;
  /** The amount this event is about (a contribution, a payment, a release). */
  amount?: number;
  usedAmount?: number;
  releasedAmount?: number;
  availableAmount?: number;
  peopleCount?: number;
  /** User ids, for avatars. */
  people?: string[];
  deadline?: string;
  taskName?: string;
  assigneeName?: string;
  /** assigned: someone gave you a task. claimed: someone took one. */
  taskStatus?: 'assigned' | 'claimed' | 'done';
  tasksDone?: number;
  tasksTotal?: number;
  paymentPurpose?: string;
  payee?: string;
  failureReason?: string;
  budgetLines?: BudgetLineData[];
  updateBody?: string;
  pinned?: boolean;
  replyPreview?: string;
  /** What a reply or update relates to, e.g. "the venue update". */
  about?: string;
  inviteCode?: string;
  /** How many events a grouped notification stands for ("3 new contributions"). Above one, single-person details are not shown. */
  count?: number;
  /** When it happened, ISO. */
  occurredAt?: string;
  /** Overrides for the default buttons. */
  primaryCta?: Cta;
  secondaryCta?: Cta;
}

export interface Cta {
  label: string;
  /** An in-app path. Never an external address. */
  to: string;
}

/** Everything a screen needs to draw a message, worked out from the kind and the data. */
export interface Content {
  kind: CommunicationKind;
  tone: Tone;
  eyebrow: string;
  /** The status label and its icon: a state is never shown by colour alone. */
  badge: { label: string; icon: IconName };
  title: string;
  message: string;
  primary: Cta;
  secondary?: Cta;
  meta: string[];
}

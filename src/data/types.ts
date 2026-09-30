export type UserId = string;
export type PactId = string;

export interface User {
  id: UserId;
  name: string;       // first name, used in the UI
  fullName: string;
  photo?: string;     // portrait URL; Avatar falls back to initials
  tint: 'mint' | 'peach' | 'lilac' | 'sky' | 'sand';
  /** Vivid identity colour: this person's share of every ring, bar and coin. */
  color: string;
}

export type PactCategory = 'birthday' | 'trip' | 'wedding' | 'gift' | 'event' | 'dinner' | 'household' | 'fund' | 'other';

export type Participation = 'money' | 'task' | 'both' | 'later';

export interface Member {
  userId: UserId;
  contributed: number; // naira
  status: 'joined' | 'invited';
  /* From the API: */
  role?: 'organizer' | 'co_organizer' | 'member';
  participation?: Participation | null;
  /** Colour inside this Pact; falls back to the person's own colour. */
  color?: string;
  /** Naira asked of this person by "split the rest". */
  requestedAmount?: number | null;
}

export interface BudgetLine {
  id: string;
  name: string;
  amount: number; // naira
  funded: number; // naira
  /** Paid to vendors against this line, in naira. */
  paid?: number;
}

/** A bank transfer into the Pact. No userId: a guest, shown by their bank name. */
export interface PactTransfer {
  id: string;
  amount: number; // naira
  senderName: string;
  userId: string | null;
  matchedBy: 'name' | 'organizer' | null;
  status: 'credited' | 'returned' | 'refunded' | 'held';
  createdAt: string;
}

/** Something to order in an order Pact. Prices in naira. */
export interface PactItem {
  id: string;
  name: string;
  price: number;
  options: string[];
  stock: number | null;
  ordered: number;
  active: boolean;
}

export interface PactOrder {
  id: string;
  itemId: string;
  userId: string;
  option: string | null;
  quantity: number;
  amount: number; // naira
  status: 'active' | 'lapsed';
  paid: boolean;
  createdAt: string;
}

/** "I'll add ₦X by this date." Amounts in naira. */
export interface PactPledge {
  id: string;
  userId: string;
  amount: number;
  dueOn: string;
  source: 'member' | 'orders';
  status: 'open' | 'kept' | 'cancelled' | 'closed';
  remaining: number;
  reminded: number;
}

export type PayoutStatus = 'awaiting_approval' | 'pending' | 'processing' | 'succeeded' | 'failed' | 'rejected' | 'cancelled';

/** Money that left the Pact to a vendor (or back to a guest). */
export interface PactPayout {
  id: string;
  kind: 'vendor' | 'guest_refund' | 'transfer_return';
  amount: number; // naira
  fee: number; // naira
  accountName: string;
  bankName: string;
  last4: string;
  purpose: string | null;
  budgetItemId: string | null;
  status: PayoutStatus;
  requestedBy: string | null;
  decidedBy: string | null;
  hasReceipt: boolean;
  failureReason: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  budgetItemId: string | null;
  assigneeId: string | null;
  status: 'open' | 'in_progress' | 'done';
  createdBy: string;
  completedAt: string | null;
}

export interface Memory {
  note: string | null;
  happenedOn: string | null;
  photoIds: string[];
}

export interface Pact {
  id: PactId;
  slug: string;        // invite link: pact.app/<slug>
  title: string;
  category: PactCategory;
  target: number;      // naira
  deadline: string;    // ISO date
  createdAt: string;   // ISO date
  organizerId: UserId;
  members: Member[];
  /** Pacts created in this session simulate invitees joining on the Invite screen. */
  simulateJoins?: boolean;
  /* Live fields from the API (absent on the website's static showcase data). */
  status?: 'open' | 'funded' | 'released' | 'refunded' | 'cancelled';
  inviteCode?: string;
  note?: string | null;
  poolBalance?: number;
  /** Everything paid in, members and guests (the API's total). */
  raised?: number;
  missedGoalPolicy?: 'refund' | 'release';
  splitMode?: 'flexible' | 'equal';
  pendingPhoneInvites?: number;
  budget?: BudgetLine[];
  tasks?: Task[];
  memory?: Memory | null;
  mode?: 'goal' | 'orders';
  items?: PactItem[];
  orders?: PactOrder[];
  pledges?: PactPledge[];
  releaseRequest?: { requestedBy: string; requestedAt: string } | null;
  bankAccount?: { accountNumber: string; bankName: string; accountName: string; status: 'active' | 'closed' } | null;
  transfers?: PactTransfer[];
  payouts?: PactPayout[];
  viewer?: { role: 'organizer' | 'co_organizer' | 'member' | null; status: 'invited' | 'joined' | 'left' | null; suggestedShare: number };
}

export type ActivityType =
  | 'contribution' | 'join' | 'created' | 'completed' | 'released' | 'refunded' | 'cancelled' | 'left'
  | 'committed' | 'task_added' | 'task_claimed' | 'task_done' | 'milestone' | 'split_requested' | 'memory_added'
  | 'guest_contribution' | 'vendor_paid' | 'co_organizer' | 'release_requested' | 'pledged' | 'pledge_kept' | 'ordered' | 'orders_closed';

export interface Activity {
  id: string;
  pactId: PactId;
  type: ActivityType;
  userId: UserId;
  amount?: number;
  /** Short context from the API, e.g. a task title or "80%". */
  detail?: string | null;
  at: string; // ISO datetime
}

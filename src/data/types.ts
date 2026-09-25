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

export interface Member {
  userId: UserId;
  contributed: number; // naira
  status: 'joined' | 'invited';
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
  missedGoalPolicy?: 'refund' | 'release';
  splitMode?: 'flexible' | 'equal';
  pendingPhoneInvites?: number;
  viewer?: { role: 'organizer' | 'member' | null; status: 'invited' | 'joined' | 'left' | null; suggestedShare: number };
}

export type ActivityType =
  | 'contribution' | 'join' | 'created' | 'completed' | 'released' | 'refunded' | 'cancelled' | 'left'
  | 'committed' | 'task_added' | 'task_claimed' | 'task_done' | 'milestone' | 'split_requested' | 'memory_added';

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

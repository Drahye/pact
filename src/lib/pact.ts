import type { Pact, PactCategory } from '../data/types';
import { getUser } from '../data/users';
import { daysUntil } from './format';

export const raisedOf = (pact: Pact) => pact.members.reduce((sum, m) => sum + m.contributed, 0);

export const joinedMembers = (pact: Pact) => pact.members.filter((m) => m.status === 'joined');
export const invitedMembers = (pact: Pact) => pact.members.filter((m) => m.status === 'invited');

export interface PactSummary {
  raised: number;
  target: number;
  remaining: number;
  percent: number; // 0–100, uncapped values clamp to 100
  daysLeft: number;
  memberCount: number;
  isComplete: boolean;
}

export const summarize = (pact: Pact): PactSummary => {
  const raised = raisedOf(pact);
  const percent = Math.min(100, (raised / pact.target) * 100);
  return {
    raised,
    target: pact.target,
    remaining: Math.max(0, pact.target - raised),
    percent,
    daysLeft: daysUntil(pact.deadline),
    memberCount: joinedMembers(pact).length,
    // A Pact counts as complete once funded, including after its money is released.
    isComplete: raised >= pact.target && pact.status !== 'cancelled' && pact.status !== 'refunded',
  };
};

export const categoryLabel: Record<PactCategory, string> = {
  gift: 'Birthday gift',
  trip: 'Group trip',
  event: 'Event',
  household: 'Shared household',
  wedding: 'Wedding contribution',
  fund: 'Emergency fund',
  other: 'Shared goal',
};

/** Best guess at a category from what people call their Pact. */
export const inferCategory = (title: string): PactCategory => {
  const t = title.toLowerCase();
  if (/trip|travel|holiday|vacation|getaway|weekend in|flight/.test(t)) return 'trip';
  if (/wedding|bride|groom/.test(t)) return 'wedding';
  if (/birthday|gift|present|baby shower/.test(t)) return 'gift';
  if (/rent|apartment|flat|house|bill|utilities|household/.test(t)) return 'household';
  if (/emergency|medical|hospital|fund/.test(t)) return 'fund';
  if (/dinner|party|event|send-?off|concert|retreat|reunion/.test(t)) return 'event';
  return 'other';
};

export const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'my-pact';

/** Contributions as coloured shares, in member order: feeds SegmentedRing / SegmentedBar. */
export const sharesOf = (pact: Pact) =>
  pact.members
    .filter((m) => m.contributed > 0)
    .map((m) => ({ id: m.userId, color: getUser(m.userId).color, value: m.contributed, label: getUser(m.userId).name }));

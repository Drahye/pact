import { seedActivities } from '../../../data/activities';
import { seedPacts } from '../../../data/pacts';
import type { Activity } from '../../../data/types';
import { formatDate } from '../../../lib/format';
import { joinedMembers, summarize } from '../../../lib/pact';

/** The marketing site tells the story of the same showcase Pact as the app. */
export const showcase = seedPacts.find((p) => p.id === 'sarahs-birthday')!;
export const showcaseSummary = summarize(showcase);
export const showcaseMembers = joinedMembers(showcase).map((m) => m.userId);
export const showcaseDeadline = `${showcaseSummary.daysLeft} days left · ${formatDate(showcase.deadline, { month: 'short', day: 'numeric' })}`;

const byId = (id: string) => seedActivities.find((a) => a.id === id)!;

/** Feed used by the Activity section: exactly the order the app shows. */
export const showcaseFeed: Activity[] = seedActivities.filter((a) => a.pactId === showcase.id);

/** What the hero feed shows before live events arrive. */
export const heroBaseFeed = [byId('a3'), byId('a6')];

/**
 * How the showcase Pact finishes: today's totals, plus the hero's live payments
 * (David, Maya, Abraham), plus the final push from everyone else: 500,000 exactly.
 */
const finishTopUp: Record<string, number> = { david: 25_000, maya: 40_000, abraham: 15_000, sarah: 20_000, tolu: 20_000, kemi: 20_000, femi: 20_000, zara: 20_000 };
export const finishedShares = showcase.members.map((m) => ({ userId: m.userId, amount: m.contributed + (finishTopUp[m.userId] ?? 0) }));

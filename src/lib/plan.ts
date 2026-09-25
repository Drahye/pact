import type { Pact, Participation, Task } from '../data/types';
import { getUser } from '../data/users';
import { formatNaira, formatNairaCompact } from './format';
import { summarize } from './pact';

export const participationLabel: Record<Participation, { short: string; long: string }> = {
  money: { short: 'Contributing', long: 'Contributing money' },
  task: { short: 'Taking a task', long: 'Taking on a task' },
  both: { short: 'Money + task', long: 'Contributing and taking a task' },
  later: { short: 'Confirming later', long: 'I’m in, I’ll confirm later' },
};

export type Stage = 'invited' | 'just-you' | 'open' | 'almost' | 'past-deadline' | 'done' | 'closed';

/** Where the Pact is, which decides the primary action. */
export function stageOf(pact: Pact, meId: string): Stage {
  const s = summarize(pact);
  if (pact.viewer?.status === 'invited') return 'invited';
  if (pact.status === 'cancelled' || pact.status === 'refunded') return 'closed';
  if (pact.status === 'funded' || pact.status === 'released') return 'done';
  if (new Date(`${pact.deadline}T23:59:59`) < new Date()) return 'past-deadline';
  const joined = pact.members.filter((m) => m.status === 'joined');
  if (joined.length === 1 && joined[0].userId === meId && s.raised === 0) return 'just-you';
  if (s.percent >= 80) return 'almost';
  return 'open';
}

export interface AttentionItem {
  key: string;
  tone: 'accent' | 'sun' | 'coral' | 'lilac';
  title: string;
  body?: string;
  action?: { label: string; kind: 'contribute' | 'participation' | 'claim' | 'done' | 'remind' | 'split' | 'invite'; taskId?: string; amount?: number };
}

/**
 * What needs someone's attention, most personal first. Rule-based on purpose:
 * it should read like momentum, not debt collection.
 */
export function attentionFor(pact: Pact, meId: string): AttentionItem[] {
  const s = summarize(pact);
  if (pact.status !== 'open' || pact.viewer?.status !== 'joined') return [];
  const me = pact.members.find((m) => m.userId === meId);
  const isOrganizer = pact.organizerId === meId;
  const items: AttentionItem[] = [];
  const tasks = pact.tasks ?? [];

  if (me?.requestedAmount && me.requestedAmount > 0) {
    items.push({
      key: 'ask',
      tone: 'accent',
      title: `Your share of the rest is ${formatNaira(me.requestedAmount)}`,
      body: `${formatNaira(s.remaining)} to go, split between everyone contributing.`,
      action: { label: 'Add it', kind: 'contribute', amount: me.requestedAmount },
    });
  }
  if (me && (!me.participation || me.participation === 'later')) {
    items.push({ key: 'commit', tone: 'lilac', title: 'How are you showing up?', body: 'Money, a task, or both. The group can plan around it.', action: { label: 'Choose', kind: 'participation' } });
  }
  for (const t of tasks.filter((x) => x.assigneeId === meId && x.status !== 'done').slice(0, 2)) {
    items.push({ key: `mine-${t.id}`, tone: 'lilac', title: `You’re handling “${t.title}”`, action: { label: 'Mark done', kind: 'done', taskId: t.id } });
  }
  const unowned = tasks.find((x) => !x.assigneeId && x.status !== 'done');
  if (unowned) {
    items.push({ key: `claim-${unowned.id}`, tone: 'sun', title: `Nobody has “${unowned.title}” yet`, body: 'Taking a task counts as showing up too.', action: { label: 'I’ll do it', kind: 'claim', taskId: unowned.id } });
  }
  const short = (pact.budget ?? []).filter((b) => b.funded < b.amount);
  const emptiest = short.find((b) => b.funded === 0) ?? short[short.length - 1];
  if (emptiest && s.remaining > 0) {
    items.push({ key: `budget-${emptiest.id}`, tone: 'coral', title: `${emptiest.name} is still ${formatNairaCompact(emptiest.amount - emptiest.funded)} short` });
  }
  if (s.daysLeft <= 3 && s.remaining > 0) {
    items.push({ key: 'soon', tone: 'coral', title: s.daysLeft === 0 ? 'Today’s the day' : `${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'} left`, body: `${formatNaira(s.remaining)} to go.` });
  }
  if (isOrganizer) {
    const quiet = pact.members.filter((m) => m.status === 'joined' && m.userId !== meId && m.contributed === 0 && m.participation !== 'task');
    if (quiet.length) {
      const names = quiet.slice(0, 2).map((m) => getUser(m.userId).name);
      items.push({
        key: 'quiet',
        tone: 'sun',
        title: quiet.length === 1 ? `${names[0]} hasn’t added anything yet` : `${quiet.length} people haven’t added anything yet`,
        action: { label: 'Remind', kind: 'remind' },
      });
    }
  }
  return items.slice(0, 4);
}

export const taskStatusLabel: Record<Task['status'], string> = { open: 'Not started', in_progress: 'In progress', done: 'Done' };

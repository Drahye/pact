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

/** What someone brings to the Pact, in a few words: money, a task, or both. "₦50k · Cake". */
export function bringsOf(pact: Pact, userId: string): string {
  const m = pact.members.find((x) => x.userId === userId);
  if (!m) return '';
  const tasks = (pact.tasks ?? []).filter((t) => t.assigneeId === userId);
  const parts: string[] = [];
  if (m.contributed > 0) parts.push(formatNairaCompact(m.contributed));
  if (tasks.length) parts.push(tasks.length === 1 ? tasks[0].title : `${tasks[0].title} +${tasks.length - 1}`);
  if (parts.length) return parts.join(' · ');
  if (m.participation === 'money') return 'Adding money';
  if (m.participation === 'task') return 'Taking a task';
  if (m.participation === 'both') return 'Money + a task';
  return 'Confirming later';
}

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
  if (me && s.remaining > 0 && me.contributed === 0 && !(me.requestedAmount && me.requestedAmount > 0) && (me.participation === 'money' || me.participation === 'both')) {
    const share = pact.viewer?.suggestedShare ? Math.min(pact.viewer.suggestedShare, s.remaining) : 0;
    items.push({ key: 'share', tone: 'accent', title: 'Add your share', body: 'You said you’d contribute. Every bit shows up for the group.', action: { label: 'Add', kind: 'contribute', amount: share || undefined } });
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
  if (s.remaining > 0 && (s.daysLeft <= 3 || (s.daysLeft <= 7 && s.percent < 70))) {
    items.push({
      key: 'soon',
      tone: 'coral',
      title: s.daysLeft === 0 ? 'Today’s the day' : `${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'} left and ${formatNaira(s.remaining)} still to go`,
      body: 'If the goal is missed, the Pact’s rule decides what happens to the money.',
    });
  } else if (s.remaining > 0 && s.percent >= 80) {
    items.push({ key: 'rest', tone: 'accent', title: `${formatNaira(s.remaining)} left. Cover the rest?`, action: { label: 'Cover it', kind: 'contribute', amount: s.remaining } });
  }
  if (isOrganizer) {
    const waiting = pact.members.filter((m) => m.status === 'invited').length + (pact.pendingPhoneInvites ?? 0);
    const joinedCount = pact.members.filter((m) => m.status === 'joined').length;
    if (waiting > 0 && joinedCount >= 1) {
      items.push({ key: 'waiting', tone: 'sun', title: waiting === 1 ? '1 person hasn’t joined yet' : `${waiting} people haven’t joined yet`, body: 'A nudge in the group chat usually does it.', action: { label: 'Share link', kind: 'invite' } });
    } else if (waiting === 0 && joinedCount >= 3 && s.raised === 0) {
      items.push({ key: 'everyone-in', tone: 'accent', title: 'Everyone’s in. Start moving the plan.', body: 'Add your share and hand out the tasks.' });
    }
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

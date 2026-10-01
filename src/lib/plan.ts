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
 * What needs someone's attention, most useful first. Rule-based on purpose: it should read like
 * momentum, not debt collection. The first item is also the Pact's "Next step".
 *
 * Priority: 1 how you're showing up, 2 your requested share, 3 your unfinished task, 4 your share
 * to add, 5 an unclaimed task, 6 people still to join, 7 nearly there, 8 deadline, 9 a nudge for
 * the organiser. Money prompts are left out of order Pacts, which have their own flow.
 */
export function attentionFor(pact: Pact, meId: string): AttentionItem[] {
  const s = summarize(pact);
  if (pact.status !== 'open' || pact.viewer?.status !== 'joined') return [];
  const orders = pact.mode === 'orders';
  const me = pact.members.find((m) => m.userId === meId);
  const isOrganizer = pact.organizerId === meId;
  const items: AttentionItem[] = [];
  const tasks = pact.tasks ?? [];
  const joined = pact.members.filter((m) => m.status === 'joined');

  // 1. Say how you're showing up.
  if (me && (!me.participation || me.participation === 'later')) {
    items.push({ key: 'commit', tone: 'lilac', title: 'Tell the group how you’re showing up.', body: 'Money, a task, or both. Everyone brings something, and the group can plan around it.', action: { label: 'Choose how you’ll help', kind: 'participation' } });
  }
  // 2. A share someone asked of you.
  if (!orders && me?.requestedAmount && me.requestedAmount > 0) {
    items.push({
      key: 'ask',
      tone: 'accent',
      title: `Your share of the rest is ${formatNaira(me.requestedAmount)}`,
      body: `${formatNaira(s.remaining)} to go, split between everyone contributing.`,
      action: { label: 'Add your share', kind: 'contribute', amount: me.requestedAmount },
    });
  }
  // Until anyone else has joined, the first job is the group, whatever else is on the list.
  const waiting = pact.members.filter((m) => m.status === 'invited').length + (pact.pendingPhoneInvites ?? 0);
  if (isOrganizer && joined.length === 1) {
    items.push(
      waiting === 0
        ? { key: 'invite-first', tone: 'accent', title: 'Bring your people in.', body: 'A Pact comes alive once the group is in. Share the link in your group chat.', action: { label: 'Invite people', kind: 'invite' } }
        : { key: 'waiting', tone: 'sun', title: waiting === 1 ? '1 person hasn’t joined yet.' : `${waiting} people haven’t joined yet.`, body: 'A nudge in the group chat usually does it.', action: { label: 'Share invite', kind: 'invite' } },
    );
  }
  // 3. A task you took and haven't finished.
  for (const t of tasks.filter((x) => x.assigneeId === meId && x.status !== 'done').slice(0, 2)) {
    items.push({ key: `mine-${t.id}`, tone: 'lilac', title: `You’re handling “${t.title}”.`, body: 'Mark it done when it is, so the group can see.', action: { label: 'Mark done', kind: 'done', taskId: t.id } });
  }
  // 4. You said you'd put money in and haven't yet.
  // Organisers are asked for their own share once money is moving; until then the first job is the group.
  if (!orders && me && s.remaining > 0 && me.contributed === 0 && (!isOrganizer || s.raised > 0) && !(me.requestedAmount && me.requestedAmount > 0) && (me.participation === 'money' || me.participation === 'both')) {
    const share = pact.viewer?.suggestedShare ? Math.min(pact.viewer.suggestedShare, s.remaining) : 0;
    items.push({ key: 'share', tone: 'accent', title: 'Add your share to keep the plan moving.', body: 'You said you’d contribute. Every bit shows up for the group.', action: { label: 'Add your share', kind: 'contribute', amount: share || undefined } });
  }
  // 5. A task nobody has. The organiser sees how many are waiting.
  const unowned = tasks.filter((x) => !x.assigneeId && x.status !== 'done');
  if (unowned.length) {
    const t = unowned[0];
    items.push(
      isOrganizer && unowned.length > 1
        ? { key: `claim-${t.id}`, tone: 'sun', title: `${unowned.length} tasks still need someone.`, body: `Starting with “${t.title}”. Taking one counts as showing up too.`, action: { label: 'I’ll do it', kind: 'claim', taskId: t.id } }
        : { key: `claim-${t.id}`, tone: 'sun', title: `“${t.title}” still needs someone.`, body: 'Taking a task counts as showing up too.', action: { label: 'I’ll do it', kind: 'claim', taskId: t.id } },
    );
  }
  // 6. People who were invited and haven't come in. Organisers only.
  if (isOrganizer) {
    if (joined.length > 1 && waiting > 0) {
      items.push({ key: 'waiting', tone: 'sun', title: waiting === 1 ? '1 person hasn’t joined yet.' : `${waiting} people haven’t joined yet.`, body: 'A nudge in the group chat usually does it.', action: { label: 'Share invite', kind: 'invite' } });
    }
    // Several people in, but nobody has chosen how they're taking part.
    const undecided = joined.filter((m) => m.userId !== meId && (!m.participation || m.participation === 'later' || m.participation === null));
    if (undecided.length >= 2 && undecided.length >= joined.length - 2) {
      items.push({ key: 'undecided', tone: 'sun', title: `${undecided.length} people joined but haven’t said how they’re taking part.`, body: 'Once they choose, the plan shows who is bringing what.', action: { label: 'Share invite', kind: 'invite' } });
    }
  }
  // 7. Nearly there. 8. Or the deadline is close and the goal is short.
  if (!orders && s.remaining > 0 && s.percent >= 80) {
    items.push({ key: 'rest', tone: 'accent', title: `${formatNaira(s.remaining)} left to complete the goal.`, body: s.daysLeft <= 3 ? `${s.daysLeft === 0 ? 'Today’s the day' : `${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'} left`}.` : 'So close. One more push.', action: { label: 'Cover the rest', kind: 'contribute', amount: s.remaining } });
  } else if (!orders && s.remaining > 0 && (s.daysLeft <= 3 || (s.daysLeft <= 7 && s.percent < 70))) {
    items.push({
      key: 'soon',
      tone: 'coral',
      title: s.daysLeft === 0 ? 'Today’s the day.' : `${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'} left and ${formatNaira(s.remaining)} still to go.`,
      body: 'If the goal is missed, the Pact’s rule decides what happens to the money.',
      action: isOrganizer ? { label: 'Split the rest', kind: 'split' } : { label: 'Add to the Pact', kind: 'contribute', amount: s.remaining },
    });
  }
  const short = (pact.budget ?? []).filter((b) => b.funded < b.amount);
  const emptiest = short.find((b) => b.funded === 0) ?? short[short.length - 1];
  if (!orders && emptiest && s.remaining > 0) {
    items.push({ key: `budget-${emptiest.id}`, tone: 'coral', title: `${emptiest.name} is still ${formatNairaCompact(emptiest.amount - emptiest.funded)} short.` });
  }
  // 9. Everyone is in and nothing is moving: a prompt for the organiser.
  if (isOrganizer) {
    const moving = s.raised > 0 || tasks.some((t) => t.assigneeId || t.status !== 'open');
    if (joined.length >= 3 && !moving) {
      items.push({ key: 'everyone-in', tone: 'accent', title: 'Everyone’s in. Start moving the plan.', body: 'Add your share and hand out the tasks. A reminder goes to anyone who hasn’t added anything.', action: { label: 'Remind everyone', kind: 'remind' } });
    }
    const quiet = joined.filter((m) => m.userId !== meId && m.contributed === 0 && m.participation !== 'task');
    if (quiet.length && s.raised > 0) {
      const names = quiet.slice(0, 2).map((m) => getUser(m.userId).name);
      items.push({
        key: 'quiet',
        tone: 'sun',
        title: quiet.length === 1 ? `${names[0]} hasn’t added anything yet.` : `${quiet.length} people haven’t added anything yet.`,
        action: { label: 'Send a reminder', kind: 'remind' },
      });
    }
  }
  return items.slice(0, 5);
}

/** The one thing to do now: the first prompt that has an action. Order Pacts and closed Pacts have none. */
export function nextStepFor(pact: Pact, meId: string): AttentionItem | null {
  if (pact.mode === 'orders') return null;
  return attentionFor(pact, meId).find((i) => i.action) ?? null;
}

/** Rows for the organiser's "Getting there" checkpoint. Only what applies to this Pact. */
export interface Checkpoint {
  key: string;
  done: boolean;
  text: string;
  to?: 'invite';
}
export function checkpointsFor(pact: Pact): Checkpoint[] {
  if (pact.status !== 'open' || pact.mode === 'orders') return [];
  const s = summarize(pact);
  const joined = pact.members.filter((m) => m.status === 'joined');
  const invitedCount = pact.members.filter((m) => m.status === 'invited').length + (pact.pendingPhoneInvites ?? 0);
  const total = joined.length + invitedCount;
  const rows: Checkpoint[] = [{ key: 'created', done: true, text: 'Pact created' }];
  rows.push(total > 1 ? { key: 'invited', done: true, text: 'People invited' } : { key: 'invited', done: false, text: 'Invite people', to: 'invite' });
  if (total > 1) {
    rows.push({ key: 'joined', done: invitedCount === 0, text: `${joined.length} of ${total} joined` });
    const decided = joined.filter((m) => m.participation && m.participation !== 'later').length;
    if (joined.length > 1) rows.push({ key: 'participation', done: decided === joined.length, text: `${decided} of ${joined.length} have chosen how they’re taking part` });
  }
  rows.push({ key: 'funded', done: s.remaining <= 0, text: `${formatNaira(s.raised)} of ${formatNaira(s.target)} funded` });
  const tasks = pact.tasks ?? [];
  if (tasks.length) {
    const done = tasks.filter((t) => t.status === 'done').length;
    rows.push({ key: 'tasks', done: done === tasks.length, text: `${done} of ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} done` });
  }
  return rows;
}

export const taskStatusLabel: Record<Task['status'], string> = { open: 'Not started', in_progress: 'In progress', done: 'Done' };

import { formatDate, formatNaira } from '../../lib/format';
import type { CommunicationData, CommunicationKind, Content, Cta } from './model';

/**
 * The words. Short, specific and human: "David joined Sarah's Birthday", not "User has joined pact successfully".
 * Every message has a calm fallback when a detail is missing, so a template never shows a blank or "undefined".
 */

const first = (name?: string, fallback = 'Someone') => (name?.trim() ? name.trim().split(/\s+/)[0] : fallback);
const pct = (d: CommunicationData) => (d.targetAmount ? Math.min(100, Math.floor(((d.raisedAmount ?? 0) / d.targetAmount) * 100)) : 0);
const money = (n: number | undefined) => (n === undefined ? 'an amount' : formatNaira(n));
const snip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : (s ?? ''));
const people = (d: CommunicationData) => d.peopleCount ?? d.people?.length ?? 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const pactPath = (d: CommunicationData) => (d.pactId ? `/app/pact/${d.pactId}` : '/app/pacts');

export function contentFor(kind: CommunicationKind, d: CommunicationData): Content {
  const pact = d.pactName || 'your Pact';
  const open: Cta = d.secondaryCta ?? { label: 'Open Pact', to: pactPath(d) };
  const view = (label: string, to = pactPath(d)): Cta => ({ label, to });
  const when = d.occurredAt ? formatDate(d.occurredAt, { month: 'short', day: 'numeric' }) : null;
  const meta = (...extra: (string | null | undefined | false)[]) => [...extra, when].filter((x): x is string => !!x);
  let c: Omit<Content, 'kind' | 'primary' | 'meta'> & { primary: Cta; meta?: string[] };

  switch (kind) {
    case 'welcome':
      c = {
        tone: 'celebrate',
        eyebrow: 'Welcome to PACT',
        badge: { label: 'You’re in', icon: 'sparkles' },
        title: d.recipientName ? `Welcome, ${first(d.recipientName)}.` : 'Welcome to PACT.',
        message: 'This is where your group makes things happen together: the people, the money, the tasks and the next step, all in one place.',
        primary: { label: 'Create your first Pact', to: '/app/start' },
        secondary: { label: 'Explore PACT', to: '/#story' },
      };
      break;
    case 'invite':
      c = {
        tone: 'celebrate',
        eyebrow: 'You’re invited',
        badge: { label: 'Invitation', icon: 'mail' },
        title: `${first(d.organizerName, 'Someone')} invited you to ${pact}`,
        message: d.purpose ? `${d.purpose}. Everyone brings something: money, a task, or both.` : 'Everyone brings something: money, a task, or both. Take a look and join when you’re ready.',
        primary: d.primaryCta ?? { label: 'Join this Pact', to: d.inviteCode ? `/app/join/${d.inviteCode}` : pactPath(d) },
        secondary: d.secondaryCta ?? view('View Pact'),
      };
      break;
    case 'joined':
      c = {
        tone: 'celebrate',
        eyebrow: 'You’re in',
        badge: { label: 'Joined', icon: 'check-circle' },
        title: `You’re in ${pact}`,
        message: 'Pick how you’ll show up, with money, a task or both, and you can watch the plan come together.',
        primary: { label: 'Choose how you’ll participate', to: pactPath(d) },
        secondary: view('See the Pact'),
      };
      break;
    case 'member_joined':
      c = {
        tone: 'calm',
        eyebrow: 'New member',
        badge: { label: 'Joined', icon: 'user-plus' },
        title: (d.count ?? 1) > 1 ? `${d.count} people joined ${pact}` : `${first(d.actorName)} joined ${pact}`,
        message: people(d) > 1 ? `${plural(people(d), 'person', 'people')} are in now. Keep the momentum going.` : 'The group is starting to come together.',
        primary: view('View Pact'),
        meta: meta(),
      };
      break;
    case 'contribution': {
      const reached = pct(d) >= 100;
      c = {
        tone: reached ? 'celebrate' : 'calm',
        eyebrow: 'New contribution',
        badge: { label: reached ? 'Goal reached' : 'Added', icon: 'coins' },
        title: (d.count ?? 1) > 1 ? `${d.count} new contributions` : `${first(d.actorName)} added ${money(d.amount)}`,
        message: d.targetAmount ? (reached ? `${pact} has reached its goal.` : `${pact} is ${pct(d)}% funded, with ${formatNaira(Math.max(0, d.targetAmount - (d.raisedAmount ?? 0)))} to go.`) : `That’s another step for ${pact}.`,
        primary: view('View progress'),
      };
      break;
    }
    case 'task_assigned': {
      const claimed = d.taskStatus === 'claimed';
      c = {
        tone: claimed ? 'calm' : 'action',
        eyebrow: claimed ? 'Task taken' : 'A task for you',
        badge: { label: claimed ? 'Claimed' : 'Assigned', icon: 'list-checks' },
        title: claimed ? `${first(d.assigneeName ?? d.actorName)} took “${d.taskName ?? 'a task'}”` : `You’ve got a task in ${pact}`,
        message: claimed ? `One more job has an owner in ${pact}.` : `${first(d.actorName, 'The organiser')} asked you to handle “${d.taskName ?? 'a task'}”. Taking a task counts as showing up.`,
        primary: view('View task'),
        secondary: open,
      };
      break;
    }
    case 'task_completed': {
      const left = d.tasksTotal !== undefined && d.tasksDone !== undefined ? d.tasksTotal - d.tasksDone : null;
      c = {
        tone: 'calm',
        eyebrow: 'Task done',
        badge: { label: 'Done', icon: 'check-circle' },
        title: `${first(d.assigneeName ?? d.actorName)} finished “${d.taskName ?? 'a task'}”`,
        message: left === null ? `One less thing to think about for ${pact}.` : left === 0 ? `Every task for ${pact} is done.` : `${d.tasksDone} of ${d.tasksTotal} tasks are done for ${pact}.`,
        primary: view('View progress'),
      };
      break;
    }
    case 'funded':
      c = {
        tone: 'celebrate',
        eyebrow: 'Fully funded',
        badge: { label: 'Funded', icon: 'party' },
        title: `${pact} is fully funded`,
        message: 'The money is ready. Funded isn’t the end: now it’s time to make the plan happen.',
        primary: d.primaryCta ?? { label: 'Use Pact funds', to: pactPath(d) },
        secondary: open,
      };
      break;
    case 'execute':
      c = {
        tone: 'action',
        eyebrow: 'Make it happen',
        badge: { label: 'Ready to use', icon: 'wallet' },
        title: 'Your Pact money is ready to use',
        message: `${d.availableAmount !== undefined ? formatNaira(d.availableAmount) : 'The money'} is in ${pact}. Pay for what the plan needs, straight from the Pact.`,
        primary: { label: 'Pay for the plan', to: pactPath(d) },
        secondary: view('View execution'),
      };
      break;
    case 'payment_approval':
      c = {
        tone: 'action',
        eyebrow: 'Needs your approval',
        badge: { label: 'Waiting for you', icon: 'shield-check' },
        title: d.paymentPurpose ? `${d.paymentPurpose} payment is ready for your approval` : 'A payment is ready for your approval',
        message: `${first(d.actorName)} wants to pay ${money(d.amount)}${d.payee ? ` to ${d.payee}` : ''} from ${pact}. It only goes out once you approve.`,
        primary: { label: 'Review payment', to: pactPath(d) },
        secondary: open,
      };
      break;
    case 'payment_success':
      c = {
        tone: 'calm',
        eyebrow: 'Payment sent',
        badge: { label: 'Paid', icon: 'check-circle' },
        title: d.paymentPurpose ? `${d.paymentPurpose} is paid` : 'A payment went through',
        message: `${money(d.amount)} went${d.payee ? ` to ${d.payee}` : ''} from ${pact}. Everyone in the Pact can see it.`,
        primary: view('View payment'),
        secondary: open,
      };
      break;
    case 'payment_failed':
      c = {
        tone: 'alert',
        eyebrow: 'Didn’t go through',
        badge: { label: 'Not paid', icon: 'alert' },
        title: d.paymentPurpose ? `${d.paymentPurpose} payment didn’t go through` : 'A payment didn’t go through',
        message: `${money(d.amount)}${d.payee ? ` to ${d.payee}` : ''} came back to ${pact}. Nothing was lost, and you can review it and try again.`,
        primary: { label: 'Review and retry', to: pactPath(d) },
        secondary: open,
      };
      break;
    case 'organizer_update':
      c = {
        tone: d.pinned ? 'action' : 'calm',
        eyebrow: d.pinned ? 'Pinned update' : 'Update',
        badge: { label: d.pinned ? 'Pinned' : 'Update', icon: 'megaphone' },
        title: `${first(d.actorName, 'The organiser')} ${d.pinned ? 'pinned an update in' : 'posted an update in'} ${pact}`,
        message: d.pinned ? 'It’s pinned at the top of the Pact so nobody misses it.' : 'Here’s the latest from the organiser.',
        primary: view('View update'),
        secondary: d.secondaryCta ?? { label: 'Open discussion', to: pactPath(d) },
      };
      break;
    case 'completed':
      c = {
        tone: 'celebrate',
        eyebrow: 'We made it happen',
        badge: { label: 'Completed', icon: 'party' },
        title: d.recipientName && d.actorName === d.recipientName ? 'You completed the Pact' : `${pact} is complete`,
        message: people(d) > 1 ? `${plural(people(d), 'person', 'people')} came together and finished what you started.` : 'The plan happened.',
        primary: view('View completion'),
        secondary: d.secondaryCta ?? { label: 'See memory', to: pactPath(d) },
      };
      break;
    case 'balance_released':
      c = {
        tone: 'calm',
        eyebrow: 'Balance released',
        badge: { label: 'Released', icon: 'hand-coins' },
        title: `${money(d.releasedAmount ?? d.amount)} was released`,
        message: `What was left in ${pact} has moved to the organiser’s wallet. The plan is done and the money is settled.`,
        primary: view('View Pact'),
      };
      break;
    case 'reply':
      c = {
        tone: 'calm',
        eyebrow: 'New reply',
        badge: { label: 'Reply', icon: 'message' },
        title: `${first(d.actorName)} replied${d.about ? ` on ${d.about}` : ''}`,
        message: snip(d.replyPreview, 140) || `There’s a new comment in ${pact}.`,
        primary: view('Open thread'),
      };
      break;
  }
  return { kind, ...c, meta: c.meta ?? meta(), primary: d.primaryCta ?? c.primary };
}

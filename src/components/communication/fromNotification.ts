import type { NotificationDTO } from '../../../shared/contracts';
import { notificationLink } from '../../../shared/notificationLink';
import { fromKobo } from '../../lib/format';
import type { Pact } from '../../data/types';
import type { CommunicationData, CommunicationKind } from './model';

/**
 * Which template a notification gets. Types without one (security, wallet, reminders) return null and keep
 * going straight to where they lead. One table, so a new notification type is one line here.
 */
const KIND: Record<string, CommunicationKind> = {
  invite: 'invite',
  join: 'member_joined',
  contribution: 'contribution',
  funded: 'funded',
  completed: 'completed',
  vendor_paid: 'payment_success',
  vendor_failed: 'payment_failed',
  released: 'balance_released',
  task: 'task_assigned',
  update: 'organizer_update',
  pinned: 'organizer_update',
  comment: 'reply',
};

export function kindFor(n: Pick<NotificationDTO, 'type' | 'meta'>): CommunicationKind | null {
  // Two kinds of approval share a type: only a vendor payment (it has an amount and a purpose) has a template.
  if (n.type === 'approval') return n.meta.amount !== undefined && n.meta.purpose ? 'payment_approval' : null;
  return KIND[n.type] ?? null;
}

/** Everything a template needs: what the notification says, plus the Pact as the app knows it right now. */
export function dataFor(n: NotificationDTO, pact?: Pact): CommunicationData {
  const m = n.meta;
  const joined = pact?.members.filter((x) => (x as { status?: string }).status !== 'left') ?? [];
  const tasks = pact?.tasks ?? [];
  const to = notificationLink(n);
  return {
    pactId: n.pactId ?? undefined,
    pactName: pact?.title ?? n.pactTitle ?? 'your Pact',
    targetAmount: pact?.target,
    raisedAmount: pact?.raised ?? joined.reduce((s, x) => s + x.contributed, 0),
    peopleCount: joined.length || undefined,
    people: joined.map((x) => x.userId),
    deadline: pact?.deadline,
    organizerName: m.actor,
    actorName: m.actor,
    amount: m.amount !== undefined ? fromKobo(m.amount) : undefined,
    releasedAmount: n.type === 'released' && m.amount !== undefined ? fromKobo(m.amount) : undefined,
    paymentPurpose: m.purpose,
    payee: m.payee,
    failureReason: m.reason,
    taskName: m.taskName,
    taskStatus: 'assigned',
    tasksDone: tasks.length ? tasks.filter((t) => t.status === 'done').length : undefined,
    tasksTotal: tasks.length || undefined,
    updateBody: n.type === 'update' ? n.body : m.preview,
    pinned: n.type === 'pinned' || m.pinned,
    replyPreview: m.preview,
    about: m.about,
    count: n.count,
    occurredAt: n.createdAt,
    // Updates and replies lead to their thread; everything else to the Pact.
    ...(to && to.includes('thread=') ? { primaryCta: { label: n.type === 'comment' ? 'Open thread' : 'View update', to }, secondaryCta: { label: 'Open Pact', to: `/app/pact/${n.pactId}` } } : {}),
  };
}

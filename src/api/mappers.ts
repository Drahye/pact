import type { ActivityDTO, PactDTO, PersonDTO, ThreadDTO } from '../../shared/contracts';
import type { Activity, Pact, Thread } from '../data/types';
import { registerPeople } from '../data/users';
import { fromKobo } from '../lib/format';

/** API Pacts (kobo) become the app's view model (naira), so every existing component keeps working. */
export function toPact(p: PactDTO): Pact {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    category: p.category,
    target: fromKobo(p.target),
    deadline: p.deadline,
    createdAt: p.createdAt,
    organizerId: p.organizerId,
    members: p.members
      .filter((m) => m.status !== 'left')
      .map((m) => ({
        userId: m.userId,
        contributed: fromKobo(m.contributed),
        status: m.status === 'invited' ? ('invited' as const) : ('joined' as const),
        role: m.role,
        participation: m.participation,
        color: m.color,
        requestedAmount: m.requestedAmount !== null ? fromKobo(m.requestedAmount) : null,
      })),
    status: p.status,
    inviteCode: p.inviteCode,
    circleId: p.circleId,
    note: p.note,
    poolBalance: fromKobo(p.poolBalance),
    completedAt: p.completedAt,
    raised: fromKobo(p.raised),
    missedGoalPolicy: p.missedGoalPolicy,
    splitMode: p.splitMode,
    pendingPhoneInvites: p.pendingPhoneInvites,
    budget: p.budget.map((b) => ({ id: b.id, name: b.name, amount: fromKobo(b.amount), funded: fromKobo(b.funded), paid: fromKobo(b.paid), pending: fromKobo(b.pending), waiting: fromKobo(b.waiting) })),
    tasks: p.tasks.map((t) => ({ id: t.id, title: t.title, budgetItemId: t.budgetItemId, assigneeId: t.assigneeId, status: t.status, createdBy: t.createdBy, completedAt: t.completedAt })),
    memory: p.memory ? { note: p.memory.note, happenedOn: p.memory.happenedOn, photoIds: p.memory.photoIds } : null,
    mode: p.mode,
    items: p.items.map((i) => ({ ...i, price: fromKobo(i.price) })),
    orders: p.orders.map((o) => ({ ...o, amount: fromKobo(o.amount) })),
    pledges: p.pledges.map((x) => ({ ...x, amount: fromKobo(x.amount), remaining: fromKobo(x.remaining) })),
    releaseRequest: p.releaseRequest,
    bankAccount: p.bankAccount,
    transfers: p.transfers.map((x) => ({ id: x.id, amount: fromKobo(x.amount), senderName: x.senderName, userId: x.userId, matchedBy: x.matchedBy, status: x.status, createdAt: x.createdAt })),
    payouts: p.payouts.map((x) => ({
      id: x.id,
      kind: x.kind,
      amount: fromKobo(x.amount),
      fee: fromKobo(x.fee),
      accountName: x.accountName,
      bankName: x.bankName,
      last4: x.last4,
      purpose: x.purpose,
      budgetItemId: x.budgetItemId,
      status: x.status,
      requestedBy: x.requestedBy,
      decidedBy: x.decidedBy,
      hasReceipt: x.hasReceipt,
      failureReason: x.failureReason,
      createdAt: x.createdAt,
    })),
    pinned: p.pinned ? { activity: toActivity(p.pinned.activity)!, pinnedBy: p.pinned.pinnedBy, pinnedAt: p.pinned.pinnedAt } : null,
    viewer: { ...p.viewer, suggestedShare: fromKobo(p.viewer.suggestedShare) },
  };
}

export function toActivity(a: ActivityDTO): Activity | null {
  if (a.type === 'nudge') return null;
  return {
    id: a.id,
    pactId: a.pactId,
    type: a.type,
    userId: a.actorId ?? '',
    amount: a.amount !== null ? fromKobo(a.amount) : undefined,
    detail: a.detail,
    at: a.at,
    body: a.body,
    reactions: a.reactions,
    myReactions: a.myReactions,
    commentCount: a.commentCount,
  };
}

export function toThread(t: ThreadDTO): Thread | null {
  const activity = toActivity(t.activity);
  return activity ? { activity, comments: t.comments.map((c) => ({ ...c })), canReply: t.canReply } : null;
}

export const register = (people: PersonDTO[]) => registerPeople(people);

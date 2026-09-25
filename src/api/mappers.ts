import type { ActivityDTO, PactDTO, PersonDTO } from '../../shared/contracts';
import type { Activity, Pact } from '../data/types';
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
      .map((m) => ({ userId: m.userId, contributed: fromKobo(m.contributed), status: m.status === 'invited' ? 'invited' : 'joined' })),
    status: p.status,
    inviteCode: p.inviteCode,
    note: p.note,
    poolBalance: fromKobo(p.poolBalance),
    missedGoalPolicy: p.missedGoalPolicy,
    splitMode: p.splitMode,
    pendingPhoneInvites: p.pendingPhoneInvites,
    viewer: { ...p.viewer, suggestedShare: fromKobo(p.viewer.suggestedShare) },
  };
}

export function toActivity(a: ActivityDTO): Activity | null {
  if (a.type === 'nudge') return null;
  return { id: a.id, pactId: a.pactId, type: a.type, userId: a.actorId ?? '', amount: a.amount !== null ? fromKobo(a.amount) : undefined, at: a.at };
}

export const register = (people: PersonDTO[]) => registerPeople(people);

import type { Pact } from '../data/types';
import { joinedMembers, invitedMembers } from './pact';
import { peopleLine } from './peopleLine';

/** The people in a Pact, as a friend would say it: who has put in, who is still thinking, who has not answered yet. */
export function circleLine(pact: Pact, meId: string): { faces: string[]; text: string } | null {
  const joined = joinedMembers(pact);
  if (joined.length < 2 && !invitedMembers(pact).length) return null;
  const paid = joined.filter((m) => m.contributed > 0).map((m) => m.userId);
  const thinking = joined.filter((m) => m.contributed <= 0 && m.userId !== meId).map((m) => m.userId);
  const pending = invitedMembers(pact).length + (pact.pendingPhoneInvites ?? 0);
  const parts: string[] = [];
  if (paid.length) parts.push(`${peopleLine(paid, meId)} ${paid.length === 1 && paid[0] !== meId ? 'has' : 'have'} put in.`);
  if (thinking.length) parts.push(`${peopleLine(thinking, null)} ${thinking.length === 1 ? 'is' : 'are'} still thinking.`);
  if (pending) parts.push(`${pending} ${pending === 1 ? 'person has' : 'people have'} not joined yet.`);
  if (!parts.length) return null;
  const faces = [...paid, ...thinking, ...invitedMembers(pact).map((m) => m.userId)].filter((id, i, a) => a.indexOf(id) === i).slice(0, 5);
  // A full house is worth saying differently.
  if (!thinking.length && !pending && paid.length === joined.length && joined.length > 1) return { faces, text: 'Everyone has come through.' };
  return { faces, text: parts.join(' ') };
}

/**
 * People worth suggesting for a new Pact of a kind: the ones who were in your earlier Pacts of the same kind (or, failing that, of any kind), most often
 * first. Never yourself, and never anyone already shown or chosen. Computed on the device from Pacts it already holds.
 */
export function suggestedPeople(pacts: Pact[], category: string, meId: string, exclude: string[], limit = 4): { ids: string[]; sameKind: boolean } {
  const count = (list: Pact[]) => {
    const n = new Map<string, number>();
    for (const p of list) for (const m of joinedMembers(p)) if (m.userId !== meId && !exclude.includes(m.userId)) n.set(m.userId, (n.get(m.userId) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, limit);
  };
  const same = count(pacts.filter((p) => p.category === category));
  return same.length ? { ids: same, sameKind: true } : { ids: count(pacts), sameKind: false };
}

/** "You and Sarah have put in." / "Maya has put in." for the people who have given, or null when nobody has. */
export function gaveLine(ids: string[], meId?: string | null): string | null {
  if (!ids.length) return null;
  return `${peopleLine(ids, meId, { names: 2 })} ${ids.length === 1 && ids[0] !== meId ? 'has' : 'have'} put in`;
}

const MILESTONES = [
  { at: 100, line: 'Fully funded. Everyone came through.' },
  { at: 75, line: 'Three quarters there. Nearly done.' },
  { at: 50, line: 'Halfway. Your people are showing up.' },
  { at: 25, line: 'A quarter in. That is a good start.' },
] as const;

/** The warm line for the biggest milestone that went from not reached to reached between two readings, or null. */
export function milestoneLine(beforePercent: number, afterPercent: number): { at: number; line: string } | null {
  for (const m of MILESTONES) if (beforePercent < m.at && afterPercent >= m.at) return m;
  return null;
}

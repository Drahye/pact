import { useEffect, useRef } from 'react';
import type { Pact } from '../data/types';
import { getUser } from '../data/users';
import { joinedMembers } from './pact';

/**
 * Welcomes people who arrive while a Pact is on screen. The Pact refreshes every few seconds, so someone joining through the link shows up as a
 * new name in the joined list; this calls `onJoin` with who just came in (never the viewer, and never for the people already there on first load).
 */
export function useWelcomeJoiners(pact: Pact | undefined, meId: string | undefined, onJoin: (names: string[]) => void) {
  const seen = useRef<Set<string> | null>(null);
  const ids = pact ? joinedMembers(pact).map((m) => m.userId) : null;
  const key = ids?.join(',');
  useEffect(() => {
    if (!ids) return;
    const now = new Set(ids);
    if (seen.current) {
      const fresh = [...now].filter((id) => !seen.current!.has(id) && id !== meId);
      if (fresh.length) onJoin(fresh.map((id) => getUser(id).name));
    }
    seen.current = now;
    // Only the set of people matters, not the callback's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** "Tolu just joined." / "Tolu and 2 more just joined." */
export const joinedLine = (names: string[]) => `${names[0]}${names.length > 1 ? ` and ${names.length - 1} more` : ''} just joined.`;

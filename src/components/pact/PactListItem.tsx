import { memo } from 'react';
import type { Pact } from '../../data/types';
import { cardStatus, phaseOf } from '../../lib/execution';
import { daysUntil, formatDaysLeft } from '../../lib/format';
import { coverOf } from '../../lib/covers';
import { joinedMembers, summarize } from '../../lib/pact';
import { useAuth } from '../../api/auth';
import { gaveLine } from '../../lib/warmth';
import { PactObject } from '../objects';
import { categoryMeta } from './category';

/**
 * A Pact in a list, as the Pact object at compact density: its ring, its name, where it stands, and what is waiting on you. The same
 * object as on Home and in a Circle, so a Pact looks like itself everywhere. A finished or closed one says so in place of days left.
 */
function PactListItemBase({ pact, to, attention }: { pact: Pact; to: string; attention?: string }) {
  const { user } = useAuth();
  const s = summarize(pact);
  const paid = joinedMembers(pact).filter((m) => m.contributed > 0).sort((a, b) => b.contributed - a.contributed).map((m) => m.userId).slice(0, 4);
  const text = gaveLine(paid, user?.id);
  const { line } = cardStatus(pact, formatDaysLeft(s.daysLeft));
  const phase = phaseOf(pact);
  const running = phase === 'planning' || phase === 'funding';
  return (
    <PactObject
      density="compact"
      title={pact.title}
      tint={categoryMeta[pact.category].tint}
      raised={s.raised}
      target={s.target}
      daysLeft={running ? daysUntil(pact.deadline) : undefined}
      need={attention ?? (running ? undefined : line)}
      href={to}
      photo={coverOf(pact)}
      gave={text ? { ids: paid, text } : null}
    />
  );
}

export const PactListItem = memo(PactListItemBase);

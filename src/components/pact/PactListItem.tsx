import { memo } from 'react';
import type { Pact } from '../../data/types';
import { cardStatus, phaseOf } from '../../lib/execution';
import { daysUntil, formatDaysLeft } from '../../lib/format';
import { summarize } from '../../lib/pact';
import { PactObject } from '../objects';
import { categoryMeta } from './category';

/**
 * A Pact in a list, as the Pact object at compact density: its ring, its name, where it stands, and what is waiting on you. The same
 * object as on Home and in a Circle, so a Pact looks like itself everywhere. A finished or closed one says so in place of days left.
 */
function PactListItemBase({ pact, to, attention }: { pact: Pact; to: string; attention?: string }) {
  const s = summarize(pact);
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
    />
  );
}

export const PactListItem = memo(PactListItemBase);

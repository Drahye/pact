import { CalendarDays } from 'lucide-react';
import { formatDate, formatNaira } from '../../lib/format';
import { AvatarGroup } from '../ui/AvatarGroup';
import { ProgressBar } from '../ui/ProgressBar';
import { CommunicationCard } from './CommunicationCard';
import type { CommunicationData } from './model';

/** The Pact in one glance: its name, how far along it is, who is in it and when it closes. */
export function CommunicationPactSummary({ data, progress = true }: { data: CommunicationData; progress?: boolean }) {
  const pct = data.targetAmount ? Math.min(100, Math.round(((data.raisedAmount ?? 0) / data.targetAmount) * 100)) : null;
  const count = data.peopleCount ?? data.people?.length ?? 0;
  return (
    <CommunicationCard label="About this Pact" className="comm-pact">
      <p className="comm-pact__label">Pact</p>
      <h3 className="comm-pact__name">{data.pactName}</h3>
      {progress && pct !== null && (
        <div className="comm-pact__progress">
          <ProgressBar value={pct} label={`${data.pactName} is ${pct}% funded`} size="md" />
          <p className="comm-pact__money num">
            <strong>{formatNaira(data.raisedAmount ?? 0)}</strong> of {formatNaira(data.targetAmount ?? 0)} · {pct}%
          </p>
        </div>
      )}
      <div className="comm-pact__foot">
        {count > 0 && (
          <span className="comm-pact__people">
            {data.people?.length ? <AvatarGroup userIds={data.people} total={count} max={4} size="sm" /> : null}
            <span>{count} {count === 1 ? 'person' : 'people'}</span>
          </span>
        )}
        {data.deadline && (
          <span className="comm-pact__date">
            <CalendarDays aria-hidden /> Closes {formatDate(data.deadline, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </CommunicationCard>
  );
}

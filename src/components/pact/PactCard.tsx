import { ChevronRight } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { Pact } from '../../data/types';
import { formatDaysLeft, formatNaira, formatPercent } from '../../lib/format';
import { joinedMembers, sharesOf, summarize } from '../../lib/pact';
import { AvatarGroup } from '../ui/AvatarGroup';
import { Badge } from '../ui/Badge';
import { CategoryIcon } from './category';
import { SegmentedBar } from './SegmentedBar';
import './pact-card.css';

/** Compact list card: category, amount of target, a bar made of everyone's money, people, time. */
function PactCardBase({ pact, to, attention }: { pact: Pact; to: string; attention?: string }) {
  const s = summarize(pact);
  return (
    <Link to={to} className="pact-card">
      <div className="pact-card__top">
        <CategoryIcon category={pact.category} />
        <div className="pact-card__heading">
          <h3 className="pact-card__title">{pact.title}</h3>
          <p className="pact-card__sub">
            {s.isComplete ? 'Fully funded' : formatDaysLeft(s.daysLeft)} · <span className="num">{formatPercent(s.percent)}</span>
          </p>
        </div>
        {s.isComplete ? <Badge tone="accent">Funded</Badge> : <ChevronRight className="pact-card__chevron" aria-hidden />}
      </div>
      <p className="pact-card__amount num">
        <span className="pact-card__raised">{formatNaira(s.raised)}</span>
        <span className="pact-card__target"> / {formatNaira(s.target)}</span>
      </p>
      <SegmentedBar shares={sharesOf(pact)} target={pact.target} size="sm" label={`${pact.title} progress`} />
      <div className="pact-card__meta">
        <AvatarGroup userIds={joinedMembers(pact).map((m) => m.userId)} max={4} size="xs" />
        <span className="pact-card__stats">{joinedMembers(pact).length} {joinedMembers(pact).length === 1 ? "person" : "people"}</span>
      </div>
      {attention && <p className="pact-card__attention">{attention}</p>}
    </Link>
  );
}

export const PactCard = memo(PactCardBase);

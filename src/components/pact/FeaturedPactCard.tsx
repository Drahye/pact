import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Pact } from '../../data/types';
import { formatDaysLeft, formatNaira } from '../../lib/format';
import { joinedMembers, sharesOf, summarize } from '../../lib/pact';
import { AvatarGroup } from '../ui/AvatarGroup';
import { Badge } from '../ui/Badge';
import { cardStatus } from '../../lib/execution';
import { useFitText } from '../../lib/useFitText';
import { AnimatedNumber } from './AnimatedNumber';
import { CategoryChip } from './category';
import { SegmentedRing } from './SegmentedRing';
import './featured-pact.css';

/** The hero surface on Home: the Pact that needs attention first, drawn from everyone's colours. */
export function FeaturedPactCard({ pact, to }: { pact: Pact; to: string }) {
  const s = summarize(pact);
  const members = joinedMembers(pact).map((m) => m.userId);
  const pctRef = useFitText<HTMLSpanElement>([s.percent], 12);
  return (
    <Link to={to} className="featured-pact" aria-label={`${pact.title}: ${formatNaira(s.raised)} of ${formatNaira(s.target)}, ${Math.round(s.percent)}% funded, ${formatDaysLeft(s.daysLeft)}`}>
      <span className="featured-pact__shape featured-pact__shape--a" aria-hidden />
      <span className="featured-pact__shape featured-pact__shape--b" aria-hidden />
      <div className="featured-pact__top">
        <CategoryChip category={pact.category} />
        <Badge tone="inverse">{cardStatus(pact, formatDaysLeft(s.daysLeft)).line.replace('Funded · ', '')}</Badge>
      </div>
      <h2 className="featured-pact__title">{pact.title}</h2>
      <div className="featured-pact__body">
        <SegmentedRing shares={sharesOf(pact)} target={pact.target} size={132} stroke={14} tone="inverse" delay={0.2} label="Funded">
          <span ref={pctRef} className="featured-pact__pct">
            <AnimatedNumber value={s.percent} from={0} format="percent" delay={0.2} />
          </span>
          <span className="featured-pact__pct-label">funded</span>
        </SegmentedRing>
        <div className="featured-pact__amounts" style={{ ['--chars' as string]: formatNaira(s.raised).length }}>
          <p className="featured-pact__raised num">{formatNaira(s.raised)}</p>
          <p className="featured-pact__target">
            of <span className="num">{formatNaira(s.target)}</span>
          </p>
          <p className="featured-pact__remaining num">{formatNaira(s.remaining)} to go</p>
        </div>
      </div>
      <div className="featured-pact__footer">
        <span className="featured-pact__people">
          <AvatarGroup userIds={members} max={4} size="sm" ring="inverse" />
          <span>
            {members.length} {members.length === 1 ? 'person' : 'people'}
            <span className="featured-pact__note"> · every colour is someone</span>
          </span>
        </span>
        <span className="featured-pact__open" aria-hidden>
          <ArrowUpRight />
        </span>
      </div>
    </Link>
  );
}

import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AskSummaryDTO } from '../../../shared/contracts';
import { CircleBadge } from '../circle/CircleBadge';
import './ask.css';

/** A question in a list: what it is, how it's going, and what to do. */
export function AskCard({ ask, from, showCircle = false }: { ask: AskSummaryDTO; from: 'circle' | 'home'; showCircle?: boolean }) {
  const open = ask.status === 'open';
  const action = !open ? 'See result' : ask.answered ? 'See results' : ask.type === 'attendance' ? 'Respond' : 'Vote';
  return (
    <Link to={`/app/asks/${ask.id}?from=${from}`} className={`ask-card ${open && !ask.answered ? 'is-waiting' : ''}`}>
      {showCircle && <CircleBadge emoji={ask.circle.emoji} tint={ask.circle.tint} size="md" />}
      <span className="ask-card__text">
        {showCircle && <span className="ask-card__circle">{ask.circle.name}</span>}
        <span className="ask-card__title">{ask.title}</span>
        <span className="ask-card__meta">
          {open && !ask.answered && showCircle ? (ask.type === 'attendance' ? 'Are you in?' : 'They need your vote') : ask.headline}
          {open && ` · ${ask.responseCount} of ${Math.max(ask.memberCount, ask.responseCount)} ${ask.type === 'choice' ? 'voted' : 'answered'}`}
        </span>
      </span>
      <span className={`ask-card__action ${open && !ask.answered ? 'is-primary' : ''}`}>
        {action}
        <ChevronRight aria-hidden />
      </span>
    </Link>
  );
}

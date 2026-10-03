import { Check, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SplitNeedDTO, SplitSummaryDTO } from '../../../shared/contracts';
import { koboText } from '../../lib/splitMoney';
import { CircleBadge } from '../circle/CircleBadge';
import '../ask/ask.css';
import './split.css';

/** "2 of 4 settled", or the closed states in plain words. */
export const progressText = (s: Pick<SplitSummaryDTO, 'status' | 'owedCount' | 'settledCount'>) =>
  s.status === 'cancelled' ? 'Cancelled' : s.status === 'settled' ? 'All settled' : `${s.settledCount} of ${s.owedCount} settled`;

/** Owes / Settled, always as words with a mark, never colour alone. */
export function ShareStatus({ status, payer }: { status: 'owed' | 'settled'; payer?: boolean }) {
  if (payer) return <span className="split-status split-status--paid">Paid</span>;
  return status === 'settled' ? (
    <span className="split-status split-status--settled">
      Settled <Check aria-hidden strokeWidth={3} />
    </span>
  ) : (
    <span className="split-status split-status--owed">Owes</span>
  );
}

/** A split in a Circle: heavier than a question, about the size of a plan. */
export function SplitCard({ split, from }: { split: SplitSummaryDTO; from: 'circle' | 'home' }) {
  const owing = split.mine && !split.mine.isPayer && split.mine.status === 'owed';
  return (
    <Link to={`/app/splits/${split.id}?from=${from}`} className={`plan-card ${owing ? 'is-waiting' : ''} ${split.status === 'settled' ? 'is-quiet' : ''}`}>
      <span className="plan-card__text">
        <span className="plan-card__title">{split.title}</span>
        <span className="plan-card__when">{split.status === 'settled' ? 'All settled ✓' : split.status === 'open' ? `${koboText(split.unsettled)} still unsettled` : 'Cancelled'}</span>
        <span className="plan-card__meta">
          {split.status === 'open' && owing ? `You owe ${koboText(split.mine!.amount)} · ` : ''}
          {progressText(split)}
        </span>
      </span>
      <span className={`ask-card__action ${owing ? 'is-primary' : ''}`}>
        Open
        <ChevronRight aria-hidden />
      </span>
    </Link>
  );
}

/** Something on a split that needs me: a share I still owe, or people who still owe me. */
export function SplitNeedCard({ need }: { need: SplitNeedDTO }) {
  return (
    <Link to={`/app/splits/${need.splitId}?from=home`} className={`plan-card ${need.kind === 'owe' ? 'is-waiting' : ''}`}>
      <CircleBadge emoji={need.circle.emoji} tint={need.circle.tint} size="md" />
      <span className="plan-card__text">
        <span className="plan-card__title">{need.title}</span>
        <span className="plan-card__meta">{need.text}</span>
      </span>
      <span className={`ask-card__action ${need.kind === 'owe' ? 'is-primary' : ''}`}>
        {need.kind === 'owe' ? 'View Split' : 'View'}
        <ChevronRight aria-hidden />
      </span>
    </Link>
  );
}

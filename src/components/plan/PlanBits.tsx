import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Attendance, PlanNeedDTO, PlanStatus, PlanSummaryDTO } from '../../../shared/contracts';
import { goingText, whenWhere } from '../../lib/planDates';
import { CircleBadge } from '../circle/CircleBadge';
import '../ask/ask.css';
import './plan.css';

export const statusLabel: Record<PlanStatus, string> = { planning: 'Planning', confirmed: 'Confirmed', done: 'Done', cancelled: 'Cancelled' };
export const statusNote: Record<PlanStatus, string> = {
  planning: 'Still being worked out.',
  confirmed: 'The group has agreed on the basics.',
  done: 'The Plan happened.',
  cancelled: 'The Plan is no longer happening.',
};

/** In, Maybe, Can't. Words, not just colour; the one you chose is marked and announced. */
export function RsvpButtons({ value, pending, disabled, onPick }: { value: Attendance | null; pending?: Attendance | null; disabled?: boolean; onPick: (a: Attendance) => void }) {
  return (
    <div className="ask__att" role="radiogroup" aria-label="Your answer">
      {(['in', 'maybe', 'out'] as Attendance[]).map((a) => {
        const mine = value === a || (!value && pending === a);
        return (
          <button key={a} type="button" role="radio" aria-checked={mine} disabled={disabled} className={`ask__att-btn ask__att-btn--${a} ${mine ? 'is-mine' : ''}`} onClick={() => onPick(a)}>
            {a === 'in' ? 'I’m in' : a === 'maybe' ? 'Maybe' : 'Can’t'}
          </button>
        );
      })}
    </div>
  );
}

/** Title block: where and when, in plain words. */
export function PlanHeading({ plan, counts, note }: { plan: Pick<PlanSummaryDTO, 'title' | 'circle' | 'date' | 'endDate' | 'location' | 'status'>; counts?: PlanSummaryDTO['counts']; note?: boolean }) {
  return (
    <header className="plan-head">
      <p className="ask__circle">
        <CircleBadge emoji={plan.circle.emoji} tint={plan.circle.tint} size="sm" />
        <span>{plan.circle.name}</span>
      </p>
      <h1 className="large-title plan-head__title">{plan.title}</h1>
      {(plan.date || plan.location) && (
        <p className="plan-head__where">
          {plan.date && (
            <span>
              <CalendarDays aria-hidden />
              {whenWhere({ date: plan.date, endDate: plan.endDate, location: null })}
            </span>
          )}
          {plan.location && (
            <span>
              <MapPin aria-hidden />
              {plan.location}
            </span>
          )}
        </p>
      )}
      {counts && <p className="plan-head__going">{goingText(counts)}</p>}
      <p className="plan-head__status">
        <span className={`plan-pill plan-pill--${plan.status}`}>{statusLabel[plan.status]}</span>
        {note && <span>{statusNote[plan.status]}</span>}
      </p>
    </header>
  );
}

/** A plan in a list: heavier than a question, lighter than a Pact. */
export function PlanCard({ plan, from }: { plan: PlanSummaryDTO; from: 'circle' | 'home' }) {
  const needs = !plan.mine && plan.status !== 'done' && plan.status !== 'cancelled';
  return (
    <Link to={`/app/plans/${plan.id}?from=${from}`} className={`plan-card ${needs ? 'is-waiting' : ''}`}>
      <span className="plan-card__text">
        <span className="plan-card__title">{plan.title}</span>
        {whenWhere(plan) && <span className="plan-card__when">{whenWhere(plan)}</span>}
        <span className="plan-card__meta">
          {goingText(plan.counts)}
          {plan.undecided > 0 && ` · ${plan.undecided} ${plan.undecided === 1 ? 'thing' : 'things'} still undecided`}
          {plan.pactId && ' · Now a Pact'}
        </span>
      </span>
      <span className={`ask-card__action ${needs ? 'is-primary' : ''}`}>
        {needs ? 'RSVP' : 'Open'}
        <ChevronRight aria-hidden />
      </span>
    </Link>
  );
}

/** Something on a plan that needs me: an RSVP, a task I took, something starting soon. */
export function PlanNeedCard({ need }: { need: PlanNeedDTO }) {
  return (
    <Link to={`/app/plans/${need.planId}?from=home`} className={`plan-card ${need.kind === 'rsvp' ? 'is-waiting' : ''}`}>
      <CircleBadge emoji={need.circle.emoji} tint={need.circle.tint} size="md" />
      <span className="plan-card__text">
        <span className="plan-card__title">{need.title}</span>
        <span className="plan-card__meta">{need.text}</span>
      </span>
      <span className={`ask-card__action ${need.kind === 'rsvp' ? 'is-primary' : ''}`}>
        {need.kind === 'rsvp' ? 'RSVP' : need.kind === 'task' ? 'Open' : 'View'}
        <ChevronRight aria-hidden />
      </span>
    </Link>
  );
}

import { motion } from 'framer-motion';
import { CalendarClock, ChevronRight, MapPin, MessagesSquare } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import type { Attendance } from '../../../shared/contracts';
import { Link } from 'react-router-dom';
import { daysUntil } from '../../lib/format';
import { dateRange } from '../../lib/planDates';
import { spring } from '../../tokens/tokens';
import { AvatarStack } from './AvatarStack';
import { DoneMark } from './CompletionState';
import { ActionButton, ObjectLink, type ObjectAction } from './ObjectLink';
import { StatusIndicator } from './StatusIndicator';
import './primitives.css';

const ANSWERS: { value: Attendance; label: string }[] = [
  { value: 'in', label: 'I’m in' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'out', label: 'Can’t' },
];

/**
 * A plan, time first: its date as the anchor, what it is and where, who is going, and where you stand. The RSVP is one control that
 * slides to your answer. A linked question sits inline so the decision and the plan are one thing. Finished plans go quiet with a tick.
 */
export function PlanObject({
  title,
  date,
  endDate,
  location,
  goingIds,
  going,
  maybe,
  rsvp,
  onRsvp,
  linkedAsk,
  done,
  disabled,
  density = 'full',
  href,
  onOpen,
  circleName,
  need,
  action,
  heading,
  status,
  history,
  decisions,
  peopleText,
}: {
  title: string;
  date?: string | null;
  endDate?: string | null;
  location?: string | null;
  goingIds: string[];
  going: number;
  maybe?: number;
  rsvp?: Attendance | null;
  onRsvp?: (a: Attendance) => void;
  /** An open question attached to this plan: "Villa or hotel?" with where it stands. */
  linkedAsk?: { question: string; leading?: string };
  done?: boolean;
  disabled?: boolean;
  /** compact: the date block shrinks, the linked question folds away, the rest stays. */
  density?: 'full' | 'compact';
  /** Where the plan opens. */
  href?: string;
  onOpen?: () => void;
  /** Whose plan it is, in the kicker ("The Boys"). */
  circleName?: string;
  /** What is waiting on you: "You haven’t RSVP’d" or "2 things need you". */
  need?: ReactNode;
  /** A contextual action in place of the RSVP track, for when the thing waiting is not an RSVP. */
  action?: ObjectAction;
  /** The Plan's own page: the title is the h1, the date is set large on the page (no card), and the RSVP track is only drawn when it can be used. */
  heading?: boolean;
  /** Page only: what the kicker says ("Planning", "Confirmed"). */
  status?: string;
  /** Page only: the Plan has become a Pact. It stays as the record: quiet, and no longer asks anything of you. */
  history?: boolean;
  /** Page only: questions still open on this plan, each a way into the Ask. `mine` is true once you have answered. */
  decisions?: { id: string; question: string; leading?: string; to: string; mine?: boolean }[];
  /** Page only: who is in, as a sentence ("You, Maya and 2 others are in"), in place of the count. */
  peopleText?: string;
}) {
  const id = useId();
  const when = date ? new Date(`${date}T12:00:00`) : null;
  const range = dateRange(date ?? null, endDate ?? null);
  const meta = [range, location].filter(Boolean);
  const until = when && !done && !history ? daysUntil(date!) : null;
  const countdown = until === null ? null : until === 0 ? 'Today' : until === 1 ? 'Tomorrow' : `In ${until} days`;
  const Title = heading ? 'h1' : 'h3';
  return (
    <article className={`ox-plan tint--sun ${density === 'compact' ? 'ox-plan--compact' : ''} ${heading ? 'ox-plan--page' : ''} ${history ? 'is-history' : ''} ${done ? 'is-done' : ''} ${disabled ? 'is-disabled' : ''}`} aria-labelledby={`${id}-t`}>
      <ObjectLink to={href} onOpen={onOpen} className="ox-plan__top" label={href ? `${title}. Open plan` : undefined}>
        <span className={`ox-plan__date ${when ? '' : 'is-open'}`} aria-hidden>
          {when ? (
            <>
              <i>{when.toLocaleDateString('en-US', { weekday: 'short' })}</i>
              <b className="num">{when.getDate()}</b>
              <i>{when.toLocaleDateString('en-US', { month: 'short' })}</i>
            </>
          ) : (
            <CalendarClock />
          )}
        </span>
        <div className="ox-plan__text">
          <p className="ox-kicker">
            {done ? <DoneMark className="ox-kicker__done" /> : <StatusIndicator tone={history ? 'quiet' : 'live'} />}
            <span>{done ? 'It happened' : status ?? 'Plan'}</span>
            {circleName && <span className="ox-kicker__where">· {circleName}</span>}
          </p>
          <Title id={`${id}-t`} className={`ox-plan__title ${heading ? 't-page' : 't-object'}`}>
            {title}
          </Title>
          {meta.length > 0 && (
            <p className="ox-plan__meta t-support">
              {range && <span>{range}</span>}
              {location &&
                (heading ? (
                  <a className="ox-plan__where" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noopener noreferrer" aria-label={`${location}. Open in Maps`}>
                    <MapPin aria-hidden /> {location}
                    <ChevronRight aria-hidden />
                  </a>
                ) : (
                  <span>
                    <MapPin aria-hidden /> {location}
                  </span>
                ))}
            </p>
          )}
          {heading && countdown && (
            <p className="ox-plan__countdown">
              {until !== null && until > 1 ? (
                <>
                  <b className="num">{until}</b> <span>{until === 1 ? 'day' : 'days'} to go</span>
                </>
              ) : (
                <b>{countdown}</b>
              )}
            </p>
          )}
          {need && <p className="ox-plan__need">{need}</p>}
        </div>
      </ObjectLink>

      <p className="ox-plan__going">
        {goingIds.length > 0 && <AvatarStack userIds={goingIds} total={going} size={heading ? 'md' : 'sm'} max={heading ? 5 : 4} />}
        <span className={heading && peopleText ? 'ox-plan__people' : 't-support'}>{heading && peopleText ? peopleText : going ? `${going} in${maybe ? ` · ${maybe} maybe` : ''}` : maybe ? `${maybe} maybe` : heading ? 'No one has RSVP’d yet.' : 'No answers yet'}</span>
      </p>

      {linkedAsk && density !== 'compact' && (
        <p className="ox-plan__ask">
          <MessagesSquare aria-hidden />
          <span>
            <strong>{linkedAsk.question}</strong>
            {linkedAsk.leading && <span> {linkedAsk.leading}</span>}
          </span>
        </p>
      )}

      {!done && action && (
        <div className="ox-plan__action">
          <ActionButton action={action} onOpen={onOpen} />
        </div>
      )}

      {!done && !action && (onRsvp || !heading) && (
        <div className="ox-rsvp" role="radiogroup" aria-label="Are you coming?">
          {ANSWERS.map((a) => {
            const on = rsvp === a.value;
            return (
              <button key={a.value} type="button" role="radio" aria-checked={on} disabled={disabled} className={`ox-rsvp__btn ${on ? 'is-on' : ''}`} onClick={() => onRsvp?.(a.value)}>
                {on && <motion.span layoutId={`${id}-pill`} className="ox-rsvp__pill" transition={spring.soft} />}
                <span className="ox-rsvp__label">{a.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {heading && decisions && decisions.length > 0 && (
        <ul className="ox-plan__decisions" aria-label="Still to decide">
          {decisions.map((d) => (
            <li key={d.id}>
              <Link to={d.to} className={`ox-plan__decision ${d.mine ? '' : 'is-open'}`}>
                <MessagesSquare aria-hidden />
                <span className="ox-plan__decision-text">
                  <strong>{d.question}</strong>
                  <span>{d.leading ? `${d.leading}${d.mine ? '' : ' · tap to vote'}` : d.mine ? 'You’ve answered' : 'Tap to vote'}</span>
                </span>
                <ChevronRight aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

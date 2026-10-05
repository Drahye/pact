import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import './primitives.css';

/**
 * An agenda line: when on the left (a date block when `date` is given, so the day is the anchor), what and how it is going on the right. A ruled row on the page, not a card. `today` marks the
 * one that is now with a small green dot; the chevron nudges when the row is pressed.
 */
export function ComingUpRow({ when, today, title, emoji, meta, to, onOpen, disabled, date }: { when: string; today?: boolean; title: string; emoji?: string; meta?: string; to?: string; onOpen?: () => void; disabled?: boolean; /** An ISO day: the row leads with it as a date block (weekday over a large day number) instead of the words in `when`. */ date?: string | null }) {
  const at = date ? new Date(`${date.slice(0, 10)}T12:00:00`) : null;
  const inner = (
    <>
      {at ? (
        <span className={`ox-agenda__date ${today ? 'is-today' : ''}`}>
          <i aria-hidden>{at.toLocaleDateString('en-US', { weekday: 'short' })}</i>
          <b className="num" aria-hidden>
            {at.getDate()}
          </b>
          <span className="visually-hidden">{when}. </span>
        </span>
      ) : (
        <span className={`ox-agenda__when ${today ? 'is-today' : ''}`}>{when}</span>
      )}
      <span className="ox-agenda__main">
        <strong>
          {title} {emoji && <span aria-hidden>{emoji}</span>}
        </strong>
        {meta && <span>{meta}</span>}
      </span>
      <ChevronRight aria-hidden />
    </>
  );
  if (disabled) return <div className="ox-agenda is-disabled" aria-disabled="true">{inner}</div>;
  return to ? (
    <Link to={to} className="ox-agenda" onClick={onOpen}>
      {inner}
    </Link>
  ) : (
    <button type="button" className="ox-agenda" onClick={onOpen}>
      {inner}
    </button>
  );
}

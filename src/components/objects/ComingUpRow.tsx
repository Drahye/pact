import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import './primitives.css';

/**
 * An agenda line: when on the left, what and how it is going on the right. A ruled row on the page, not a card. `today` marks the
 * one that is now with a small green dot; the chevron nudges when the row is pressed.
 */
export function ComingUpRow({ when, today, title, emoji, meta, to, onOpen, disabled }: { when: string; today?: boolean; title: string; emoji?: string; meta?: string; to?: string; onOpen?: () => void; disabled?: boolean }) {
  const inner = (
    <>
      <span className={`ox-agenda__when ${today ? 'is-today' : ''}`}>{when}</span>
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

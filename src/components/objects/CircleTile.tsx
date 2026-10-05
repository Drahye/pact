import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CircleTint } from '../../../shared/contracts';
import { AvatarStack } from './AvatarStack';
import { StatusIndicator } from './StatusIndicator';
import './primitives.css';

/** True for a moment when something becomes live: one soft pulse, never a loop. */
function usePulseOnce(active: boolean) {
  const was = useRef(active);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const became = active && !was.current;
    was.current = active;
    if (!became) return;
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 1400);
    return () => window.clearTimeout(t);
  }, [active]);
  return pulse;
}

/**
 * A Circle as a place, not a row: its emoji on a soft plate, its name, the faces in it and one live line. Square-ish with one tucked
 * corner (`alt` turns a different corner so a shelf of them does not read as a grid). A live signal gives it a stronger edge and one pulse.
 */
export function CircleTile({
  name,
  emoji,
  tint,
  peopleIds,
  total,
  signal,
  live,
  alt,
  selected,
  disabled,
  to,
  onOpen,
  children,
  density = 'tile',
  meta,
}: {
  name: string;
  emoji: string;
  tint: CircleTint;
  peopleIds: string[];
  total?: number;
  signal?: string;
  live?: boolean;
  alt?: boolean;
  selected?: boolean;
  disabled?: boolean;
  to?: string;
  onOpen?: () => void;
  children?: ReactNode;
  /** header: the Circle's own page. Full width, the name is the page's h1, the faces are larger, and `children` (actions) sit under the signal. */
  density?: 'tile' | 'header';
  /** Header only: who is in it as a sentence ("You, Maya and 3 others"), under the name. */
  meta?: string;
}) {
  const pulse = usePulseOnce(!!live);
  const cls = `ox-circle tint--${tint} ${alt ? 'is-alt' : ''} ${live ? 'is-live' : ''} ${pulse ? 'is-pulsing' : ''} ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`;
  if (density === 'header') {
    return (
      <header className={`ox-circle ox-circle--header tint--${tint} ${live ? 'is-live' : ''}`}>
        <span className="ox-circle__emoji" aria-hidden>
          {emoji}
        </span>
        <div className="ox-circle__id">
          <h1 className="ox-circle__name t-page">{name}</h1>
          {meta && <p className="ox-circle__meta t-support">{meta}</p>}
        </div>
        <div className="ox-circle__row">
          <AvatarStack userIds={peopleIds} total={total} size="md" max={5} className="ox-circle__people" enter />
          {children}
        </div>
        {signal && (
          <p className="ox-circle__signal">
            <StatusIndicator tone={live ? 'live' : 'quiet'} label={signal} />
          </p>
        )}
      </header>
    );
  }
  const body = (
    <>
      <span className="ox-circle__emoji" aria-hidden>
        {emoji}
      </span>
      <span className="ox-circle__name">{name}</span>
      <span className="ox-circle__signal">
        {live && <StatusIndicator tone="live" />}
        {signal}
      </span>
      <AvatarStack userIds={peopleIds} total={total} size="xs" max={3} className="ox-circle__people" />
      {children}
    </>
  );
  if (disabled) return <div className={cls} aria-disabled="true">{body}</div>;
  return to ? (
    <Link to={to} className={`${cls} ox-press`} onClick={onOpen}>
      {body}
    </Link>
  ) : (
    <button type="button" className={`${cls} ox-press`} aria-pressed={selected ?? undefined} onClick={onOpen}>
      {body}
    </button>
  );
}

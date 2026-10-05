import { motion } from 'framer-motion';
import { useId, useRef, type KeyboardEvent } from 'react';
import { spring } from '../../tokens/tokens';
import { ActionButton, ObjectLink, type ObjectAction } from './ObjectLink';
import { AnimatedCount } from './AnimatedCount';
import { AvatarStack } from './AvatarStack';
import { StatusIndicator } from './StatusIndicator';
import './primitives.css';

export interface AskOption {
  id: string;
  label: string;
  /** How many have chosen it. Leave out to hide counts (before anyone has answered). */
  count?: number;
  /** Who chose it (page density): a few faces beside the count. */
  voters?: string[];
}

/**
 * A question and its answers: the lightest object. No card, a quiet tinted wash, the question large, and the options right there
 * to tap. A choice responds at once (selected, its count ticks up, the bar grows); a closed Ask shows its winner. Arrow keys move
 * between options, Space or Enter chooses. `answered` and `of` tell how many have said something.
 */
export function AskObject({
  question,
  options,
  selectedId,
  onSelect,
  answered,
  of,
  closed,
  disabled,
  kicker = 'Question',
  tint = 'sky',
  density = 'full',
  heading,
  countNoun = 'vote',
  href,
  onOpen,
  statusText,
  action,
}: {
  question: string;
  options: AskOption[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  answered?: number;
  of?: number;
  closed?: boolean;
  disabled?: boolean;
  kicker?: string;
  tint?: string;
  /** compact: the same object at the size Home needs: chips instead of bars, one line of status. */
  density?: 'full' | 'compact';
  /** The Ask's own page: the question is the page's h1, set large on the page itself (no wash), options a little taller, faces on each. */
  heading?: boolean;
  /** Said after an option's label for a screen reader ("Dec 20, 2 votes"). Null reads the number alone. */
  countNoun?: string | null;
  /** Where the question itself opens. */
  href?: string;
  onOpen?: () => void;
  /** Replaces the default status line. */
  statusText?: string;
  /** For an Ask seen without its options (in a list of what is happening): the way in, in place of answering here. */
  action?: ObjectAction;
}) {
  const group = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const counted = options.some((o) => (o.count ?? 0) > 0);
  const max = Math.max(1, ...options.map((o) => o.count ?? 0));
  const winner = closed ? [...options].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0]?.id : null;
  const locked = closed || disabled;

  const move = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const btns = [...(group.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = btns.indexOf(e.currentTarget);
    const next = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? btns[(i + 1) % btns.length] : btns[(i - 1 + btns.length) % btns.length];
    next?.focus();
  };

  return (
    <section className={`ox-ask tint--${tint} ${density === 'compact' ? 'ox-ask--compact' : ''} ${heading ? 'ox-ask--page' : ''} ${closed ? 'is-closed' : ''} ${disabled ? 'is-disabled' : ''}`} aria-labelledby={titleId}>
      <ObjectLink to={href} onOpen={onOpen} className="ox-ask__head" label={href ? `${question}. Open question` : undefined}>
        <p className="ox-kicker">
          <StatusIndicator tone={closed ? 'done' : selectedId ? 'done' : 'live'} />
          <span>{closed ? 'Decided' : kicker}</span>
        </p>
        {heading ? (
          <h1 id={titleId} className="ox-ask__q t-page">
            {question}
          </h1>
        ) : (
          <h3 id={titleId} className="ox-ask__q t-object">
            {question}
          </h3>
        )}
      </ObjectLink>
      {options.length > 0 && (
      <div ref={group} className="ox-ask__options" role="radiogroup" aria-labelledby={titleId}>
        {options.map((o) => {
          const picked = selectedId === o.id;
          const pct = counted ? Math.round(((o.count ?? 0) / max) * 100) : 0;
          return (
            <motion.button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={picked}
              disabled={locked}
              aria-label={counted ? `${o.label}, ${o.count ?? 0}${countNoun ? ` ${countNoun}${o.count === 1 ? '' : 's'}` : ''}` : undefined}
              className={`ox-opt ${picked ? 'is-picked' : ''} ${winner === o.id ? 'is-winner' : ''}`}
              onClick={() => onSelect?.(o.id)}
              onKeyDown={move}
              whileTap={locked ? undefined : { scale: 0.985 }}
              transition={spring.press}
            >
              <span className="ox-opt__bar" style={{ width: `${pct}%` }} aria-hidden />
              <span className="ox-opt__row">
                <span className="ox-opt__mark" aria-hidden>
                  <svg viewBox="0 0 24 24">
                    <path d="M7 12.5l3.2 3.2L17 8.8" />
                  </svg>
                </span>
                <span className="ox-opt__label">{o.label}</span>
                {heading && o.voters && o.voters.length > 0 && (
                  <span className="ox-opt__faces" aria-hidden>
                    <AvatarStack userIds={o.voters} size="xs" max={3} />
                  </span>
                )}
                {counted && (
                  <span className="ox-opt__n num">
                    <AnimatedCount value={o.count ?? 0} />
                  </span>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
      )}
      {(answered !== undefined || selectedId || statusText) && (
        <p className="ox-ask__status t-support" role="status">
          {statusText ?? `${closed ? 'Closed' : selectedId ? 'Counted' : 'Tap an answer'}${answered !== undefined && of ? ` · ${answered} of ${of} answered` : ''}`}
        </p>
      )}
      {action && (
        <div className="ox-ask__action">
          <ActionButton action={action} tone="tonal" onOpen={onOpen} />
        </div>
      )}
    </section>
  );
}

import { Handshake } from 'lucide-react';
import { useId, useState } from 'react';
import { formatNaira } from '../../lib/format';
import { AvatarStack } from './AvatarStack';
import { CompletionState, DoneMark } from './CompletionState';
import { ActionButton, ObjectLink, type ObjectAction } from './ObjectLink';
import { ProgressRing } from '../ui/ProgressRing';
import { StatusIndicator } from './StatusIndicator';
import { Avatar } from '../ui/Avatar';
import { SegmentedBar } from '../pact/SegmentedBar';
import type { Share } from '../pact/SegmentedRing';
import './primitives.css';

/**
 * The strongest object: "we said we would do this". Its category tint is stronger, its progress is segmented by who gave what, your
 * part (the thing you took on) sits right on it with one small action, and finishing it is the biggest moment in the product: the
 * object resolves into a completion with the faces of everyone who made it happen.
 */
export function PactObject({
  title,
  tint = 'mint',
  raised,
  target,
  shares,
  daysLeft,
  contributorIds,
  assignment,
  onMarkDone,
  completed,
  onRecap,
  disabled,
  density = 'full',
  href,
  onOpen,
  circleName,
  need,
  action,
}: {
  title: string;
  tint?: string;
  /** Naira. */
  raised: number;
  target: number;
  /** Everyone's money, in their colours. */
  shares?: Share[];
  daysLeft?: number;
  contributorIds?: string[];
  /** The responsibility the viewer holds: what it is, who holds it, and whether it is done. */
  assignment?: { label: string; assigneeId: string; done?: boolean; lead?: string };
  onMarkDone?: () => void;
  completed?: boolean;
  onRecap?: () => void;
  disabled?: boolean;
  /** compact: a progress ring and one line of what you hold, at the size Home needs. */
  density?: 'full' | 'compact';
  href?: string;
  onOpen?: () => void;
  circleName?: string;
  /** What is waiting on you when it is not a task: "Your share is ₦12,500". */
  need?: string;
  /** A contextual action that goes somewhere, in place of Mark done. */
  action?: ObjectAction;
}) {
  const id = useId();
  const people = contributorIds ?? [];
  const pct = Math.min(100, Math.round((raised / Math.max(1, target)) * 100));
  const [pressed, setPressed] = useState(false);
  const bar: Share[] = shares ?? [{ id: 'all', color: 'var(--tint-solid)', value: raised }];
  if (density === 'compact' && !completed) {
    return (
      <article className={`ox-pact ox-pact--compact tint--${tint} ${disabled ? 'is-disabled' : ''}`} aria-labelledby={`${id}-t`}>
        <ProgressRing value={pct} size={56} stroke={6} label={`${title} is ${pct}% funded`}>
          <span className="ox-pact__pct num">{pct}%</span>
        </ProgressRing>
        <ObjectLink to={href} onOpen={onOpen} className="ox-pact__main" label={href ? `${title}. ${need ?? assignment?.label ?? ''}` : undefined}>
          <p className="ox-kicker">
            <StatusIndicator tone="live" />
            <span>Pact</span>
            {circleName && <span className="ox-kicker__where">· {circleName}</span>}
          </p>
          <h3 id={`${id}-t`} className="ox-pact__title t-object">
            {title}
          </h3>
          <p className="ox-pact__yours">
            {assignment ? (
              <>
                {assignment.lead && <span>{assignment.lead} </span>}
                <b>{assignment.label}</b>
              </>
            ) : (
              need && <b>{need}</b>
            )}
          </p>
          <p className="ox-pact__meta num">
            {formatNaira(raised)} of {formatNaira(target)}
            {daysLeft !== undefined && ` · ${daysLeft === 0 ? 'due today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}`}
          </p>
        </ObjectLink>
        {action && (
          <div className="ox-pact__action">
            <ActionButton action={action} onOpen={onOpen} />
          </div>
        )}
      </article>
    );
  }
  if (completed) {
    return (
      <article className={`ox-pact ox-pact--completed tint--${tint}`} aria-labelledby={`${id}-t`}>
        <p className="ox-kicker">
          <Handshake aria-hidden />
          <span>Pact</span>
        </p>
        <CompletionState
          tint={tint as 'mint'}
          title="We made it happen."
          line={`${title} · ${formatNaira(raised)} together`}
          peopleIds={people}
          action={
            onRecap && (
              <button type="button" className="act act--solid" onClick={onRecap}>
                View recap
              </button>
            )
          }
        />
        <h3 id={`${id}-t`} className="visually-hidden">
          {title}
        </h3>
      </article>
    );
  }
  return (
    <article className={`ox-pact tint--${tint} ${disabled ? 'is-disabled' : ''}`} aria-labelledby={`${id}-t`}>
      <header className="ox-pact__head">
        <p className="ox-kicker">
          <StatusIndicator tone="live" />
          <Handshake aria-hidden />
          <span>Pact</span>
        </p>
        {daysLeft !== undefined && <span className="ox-chip t-meta">{daysLeft === 0 ? 'Due today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}</span>}
      </header>
      <h3 id={`${id}-t`} className="ox-pact__title t-object">
        {title}
      </h3>
      <p className="ox-pact__money num">
        <strong>{formatNaira(raised)}</strong> <span>of {formatNaira(target)}</span> <em>{pct}%</em>
      </p>
      <SegmentedBar shares={bar} target={target} size="md" label={`${title} is ${pct}% funded`} />

      {assignment && (
        <div className={`ox-pact__mine ${assignment.done ? 'is-done' : ''}`}>
          <Avatar userId={assignment.assigneeId} size="sm" label={false} />
          <span className="ox-pact__mine-text">
            <span className="t-support">{assignment.done ? 'Done' : 'You’re handling'}</span>
            <strong>{assignment.label}</strong>
          </span>
          {assignment.done ? (
            <DoneMark className="ox-pact__tick" />
          ) : (
            onMarkDone &&
            !disabled && (
              <button
                type="button"
                className={`act act--solid ${pressed ? 'is-pressed' : ''}`}
                onClick={() => {
                  setPressed(true);
                  onMarkDone();
                }}
              >
                Mark done
              </button>
            )
          )}
        </div>
      )}

      <footer className="ox-pact__foot">
        <AvatarStack userIds={people} size="xs" max={5} />
        <span className="t-meta">{people.length} {people.length === 1 ? 'person' : 'people'} in</span>
      </footer>
    </article>
  );
}

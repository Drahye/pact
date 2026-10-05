import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { transition } from '../../tokens/tokens';
import { AvatarGroup } from '../ui/AvatarGroup';
import './objects.css';

/**
 * How PACT says "that happened": a ring closes and a tick draws itself, the title settles in, the people who did it appear.
 * One language for a finished Pact, a settled Split, a plan that took place and a task marked done. Calm, a few hundred
 * milliseconds, and still under reduced motion.
 */
export function CompletionState({
  title,
  line,
  peopleIds = [],
  action,
  size = 'lg',
  tint = 'mint',
  flourish = true,
  layout = 'stack',
  lead,
  announce = true,
}: {
  title: string;
  line?: string;
  peopleIds?: string[];
  action?: ReactNode;
  size?: 'sm' | 'lg';
  tint?: 'mint' | 'sun' | 'lilac' | 'sky' | 'coral';
  /** A few small sparks once as the ring closes. Never confetti. */
  flourish?: boolean;
  /** stack: centred, for a moment of its own. row: one line in a list (a mark, the words, an action), no sparks. */
  layout?: 'stack' | 'row';
  /** Row only: something before the mark, such as the thing's emoji. */
  lead?: ReactNode;
  /** A single completion says so to a screen reader; a list of them does not announce each one. */
  announce?: boolean;
}) {
  const reduce = !!useReducedMotion();
  if (layout === 'row') {
    return (
      <div className={`done done--row tint--${tint}`}>
        {lead && <span className="done__lead" aria-hidden>{lead}</span>}
        <span className="done__words">
          <strong className="done__title">{title}</strong>
          {line && <span className="done__line">{line}</span>}
        </span>
        <DoneMark className="done__rowmark" />
        {action && <span className="done__rowaction">{action}</span>}
      </div>
    );
  }
  return (
    <motion.div className={`done done--${size} tint--${tint}`} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={transition.slow} role={announce ? 'status' : undefined}>
      <span className="done__mark" aria-hidden>
        {flourish && (
          <span className="done__sparks">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ ['--a' as string]: `${i * 45}deg` }} />
            ))}
          </span>
        )}
        <svg viewBox="0 0 64 64">
          <circle className="done__ring" cx="32" cy="32" r="28" pathLength={100} />
          <path className="done__tick" d="M20 33.5l8.5 8.5L44.5 24" pathLength={100} />
        </svg>
      </span>
      <strong className="done__title">{title}</strong>
      {line && <span className="done__line">{line}</span>}
      {peopleIds.length > 0 && <AvatarGroup userIds={peopleIds} size={size === 'lg' ? 'md' : 'sm'} max={5} className="done__people" enter />}
      {action && <div className="done__action">{action}</div>}
    </motion.div>
  );
}

/** Just the ring and the tick, small, for a list row: it draws once when the row scrolls into view. */
export function DoneMark({ className = '' }: { className?: string }) {
  return (
    <span className={`done__mark done__mark--inline ${className}`} aria-hidden>
      <svg viewBox="0 0 64 64">
        <circle className="done__ring" cx="32" cy="32" r="28" pathLength={100} />
        <path className="done__tick" d="M20 33.5l8.5 8.5L44.5 24" pathLength={100} />
      </svg>
    </span>
  );
}

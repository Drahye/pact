import type { ReactNode } from 'react';
import { OBJECT_KINDS, type ObjectKind } from './kinds';
import './objects.css';

/**
 * An empty place that says what belongs here and what to do, in a sentence a person would say. The mark is the object's own icon
 * on its tint, so an empty Circles list and an empty Plans list do not look like the same missing thing.
 */
export function EmptyState({ kind, title, body, action, compact, as: Title = 'p' }: { kind: ObjectKind; title: string; body?: string; action?: ReactNode; compact?: boolean; /** The title's element: a page that is only this (a link that leads nowhere) makes it its h1. */ as?: 'p' | 'h1' | 'h2' }) {
  const k = OBJECT_KINDS[kind];
  return (
    <div className={`empty tint--${k.tint} ${compact ? 'empty--compact' : ''}`}>
      <span className="empty__mark" aria-hidden>
        <span className="empty__ring" />
        {k.icon}
      </span>
      <Title className="empty__title">{title}</Title>
      {body && <p className="empty__body">{body}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

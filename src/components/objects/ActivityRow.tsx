import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatRelative } from '../../lib/format';
import { Avatar } from '../ui/Avatar';
import { OBJECT_KINDS, type ObjectKind } from './kinds';
import './primitives.css';

/**
 * One thing that happened, said the way a person would say it: who, in plain words, and when. A small badge says which kind of thing
 * it was about (a question, a plan, a split, a Pact). Never an audit line: no ids, no verbs like "updated".
 */
export function ActivityRow({ actorId, kind, text, at, to, onOpen }: { actorId?: string | null; kind: ObjectKind; text: ReactNode; at: string; to?: string; onOpen?: () => void }) {
  const k = OBJECT_KINDS[kind];
  const body = (
    <>
      <span className="ox-who">
        {actorId ? <Avatar userId={actorId} size="sm" label={false} /> : <span className="ox-who__dot" aria-hidden />}
        <span className="ox-who__kind" aria-hidden>
          {k.icon}
        </span>
      </span>
      <span className="ox-activity__text">{text}</span>
      <time className="ox-activity__time t-meta" dateTime={at}>
        {formatRelative(at)}
      </time>
    </>
  );
  const cls = `ox-activity ox-press tint--${k.tint}`;
  return to ? (
    <Link to={to} className={cls} onClick={onOpen}>
      {body}
    </Link>
  ) : (
    <div className={cls.replace(' ox-press', '')}>{body}</div>
  );
}

import { Check, LogOut, Plus, RotateCcw, Sparkles, UserPlus, Wallet, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Activity } from '../../data/types';
import { CURRENT_USER_ID, getUser } from '../../data/users';
import { formatNaira, formatRelative } from '../../lib/format';
import { Avatar, type AvatarSize } from './Avatar';
import './activity.css';

interface Props {
  activity: Activity;
  /** Viewer's id: their own events read "You". Pass null for third-person (marketing). */
  viewerId?: string | null;
  to?: string;
  meta?: ReactNode; // overrides the relative time line
  size?: AvatarSize;
  tone?: 'light' | 'inverse';
}

export function describeActivity(activity: Activity, viewerId: string | null = CURRENT_USER_ID) {
  const isYou = viewerId !== null && activity.userId === viewerId;
  const name = isYou ? 'You' : getUser(activity.userId).name;
  switch (activity.type) {
    case 'contribution':
      return { name, verb: 'contributed', amount: formatNaira(activity.amount ?? 0) };
    case 'join':
      return { name, verb: isYou ? 'joined the Pact' : 'joined the Pact' };
    case 'created':
      return { name, verb: 'created the Pact' };
    case 'completed':
      return { name: 'Goal reached.', verb: 'The Pact is fully funded' };
    case 'released':
      return { name, verb: isYou ? 'released the funds' : 'released the funds', amount: activity.amount ? formatNaira(activity.amount) : undefined };
    case 'refunded':
      return { name: 'Refunded.', verb: 'Everyone got their money back' };
    case 'cancelled':
      return { name, verb: 'closed the Pact and refunded everyone' };
    case 'left':
      return { name, verb: 'left the Pact' };
  }
}

const glyph = {
  contribution: <Plus strokeWidth={3} />,
  join: <UserPlus strokeWidth={2.5} />,
  created: <Sparkles strokeWidth={2.5} />,
  completed: <Check strokeWidth={3} />,
  released: <Wallet strokeWidth={2.5} />,
  refunded: <RotateCcw strokeWidth={2.5} />,
  cancelled: <X strokeWidth={3} />,
  left: <LogOut strokeWidth={2.5} />,
};

/** Events with no single person behind them get a badge instead of an avatar. */
const systemEvent = (a: Activity) => a.type === 'completed' || (a.type === 'refunded' && !a.userId) || !a.userId;

export function ActivityItem({ activity, viewerId = CURRENT_USER_ID, to, meta, size = 'md', tone = 'light' }: Props) {
  const d = describeActivity(activity, viewerId);
  const body = (
    <>
      <span className="activity__avatar">
        {systemEvent(activity) ? (
          <span className={`activity__complete avatar--${size}`} aria-hidden>
            {activity.type === 'refunded' ? <RotateCcw strokeWidth={2.5} /> : <Check strokeWidth={3} />}
          </span>
        ) : (
          <Avatar userId={activity.userId} size={size} label={false} accent />
        )}
        {!systemEvent(activity) && (
          <span className={`activity__glyph activity__glyph--${activity.type}`} aria-hidden>
            {glyph[activity.type]}
          </span>
        )}
      </span>
      <span className="activity__text">
        <span className="activity__line">
          <strong>{d.name}</strong> {d.verb}
          {d.amount && (
            <>
              {' '}
              <strong className="num">{d.amount}</strong>
            </>
          )}
        </span>
        <span className="activity__meta">{meta ?? formatRelative(activity.at)}</span>
      </span>
    </>
  );
  const cls = `activity activity--${tone} ${activity.type === 'completed' ? 'activity--completed' : ''}`;
  return to ? (
    <Link to={to} className={`${cls} activity--link`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

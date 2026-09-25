import { Camera, Check, CheckCheck, Divide, Flag, Hand, ListPlus, LogOut, Plus, RotateCcw, Sparkles, UserPlus, Wallet, X } from 'lucide-react';
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
    case 'committed':
      return { name, verb: activity.detail ?? 'is in' };
    case 'task_added':
      return { name, verb: `added a task: ${activity.detail ?? ''}`.trim() };
    case 'task_claimed':
      return { name, verb: `is handling ${activity.detail ?? 'a task'}` };
    case 'task_done':
      return { name, verb: `finished ${activity.detail ?? 'a task'}` };
    case 'milestone':
      return { name: `${activity.detail ?? 'Halfway'} there.`, verb: 'The group is moving' };
    case 'split_requested':
      return { name, verb: `split the rest between ${activity.detail ?? 'the group'}`, amount: activity.amount ? formatNaira(activity.amount) : undefined };
    case 'memory_added':
      return { name, verb: 'added a memory' };
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
  committed: <Hand strokeWidth={2.5} />,
  task_added: <ListPlus strokeWidth={2.5} />,
  task_claimed: <Hand strokeWidth={2.5} />,
  task_done: <CheckCheck strokeWidth={2.5} />,
  milestone: <Flag strokeWidth={2.5} />,
  split_requested: <Divide strokeWidth={2.5} />,
  memory_added: <Camera strokeWidth={2.5} />,
};

/** Events with no single person behind them get a badge instead of an avatar. */
const systemEvent = (a: Activity) => a.type === 'completed' || a.type === 'milestone' || !a.userId;

export function ActivityItem({ activity, viewerId = CURRENT_USER_ID, to, meta, size = 'md', tone = 'light' }: Props) {
  const d = describeActivity(activity, viewerId);
  const body = (
    <>
      <span className="activity__avatar">
        {systemEvent(activity) ? (
          <span className={`activity__complete avatar--${size}`} aria-hidden>
            {activity.type === 'refunded' ? <RotateCcw strokeWidth={2.5} /> : activity.type === 'milestone' ? <Flag strokeWidth={2.5} /> : <Check strokeWidth={3} />}
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

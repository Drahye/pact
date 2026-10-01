import { CalendarCheck, Megaphone, MessageCircle, ShoppingBag, Camera, Check, CheckCheck, Divide, Flag, Hand, Landmark, ListPlus, LogOut, Plus, Receipt, RotateCcw, ShieldCheck, Sparkles, UserPlus, Wallet, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Activity } from '../../data/types';
import { CURRENT_USER_ID, getUser } from '../../data/users';
import { formatNaira, formatRelative } from '../../lib/format';
import { REACTIONS } from '../../lib/reactions';
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
  /** Show reaction and comment counts, and make the row open its discussion. Pact detail only. */
  onOpen?: (a: Activity) => void;
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
      return { name: 'Funded.', verb: 'The money is ready to make the plan happen' };
    case 'update':
      return { name, verb: 'posted an update' };
    case 'pact_completed':
      return { name, verb: isYou ? 'completed the Pact. You made it happen' : 'completed the Pact. We made it happen' };
    case 'released':
      return { name, verb: 'released what was left', amount: activity.amount ? formatNaira(activity.amount) : undefined };
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
    case 'guest_contribution':
      return { name: activity.detail ?? 'A guest', verb: 'sent by bank transfer', amount: formatNaira(activity.amount ?? 0) };
    case 'vendor_paid':
      return { name, verb: `paid ${activity.detail ?? 'a vendor'}`, amount: activity.amount ? formatNaira(activity.amount) : undefined };
    case 'ordered':
      return { name, verb: `ordered ${activity.detail ?? 'something'}`, amount: activity.amount ? formatNaira(activity.amount) : undefined };
    case 'orders_closed':
      return { name: 'Orders closed.', verb: 'Unpaid orders were released after the pay-by date' };
    case 'pledged':
      return { name, verb: `pledged to add ${activity.amount ? formatNaira(activity.amount) : 'their share'} by ${activity.detail ?? 'the deadline'}` };
    case 'pledge_kept':
      return { name, verb: isYou ? 'kept your pledge' : 'kept their pledge', amount: activity.amount ? formatNaira(activity.amount) : undefined };
    case 'release_requested':
      return { name, verb: 'asked to release the funds', amount: activity.amount ? formatNaira(activity.amount) : undefined };
    case 'co_organizer':
      return { name, verb: isYou ? 'are now a co-organiser' : 'is now a co-organiser' };
  }
}

const glyph = {
  contribution: <Plus strokeWidth={3} />,
  join: <UserPlus strokeWidth={2.5} />,
  created: <Sparkles strokeWidth={2.5} />,
  completed: <Check strokeWidth={3} />,
  released: <Wallet strokeWidth={2.5} />,
  pact_completed: <CheckCheck strokeWidth={2.5} />,
  update: <Megaphone strokeWidth={2.5} />,
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
  guest_contribution: <Landmark strokeWidth={2.5} />,
  vendor_paid: <Receipt strokeWidth={2.5} />,
  co_organizer: <ShieldCheck strokeWidth={2.5} />,
  release_requested: <Wallet strokeWidth={2.5} />,
  pledged: <CalendarCheck strokeWidth={2.5} />,
  ordered: <ShoppingBag strokeWidth={2.5} />,
  orders_closed: <Flag strokeWidth={2.5} />,
  pledge_kept: <CheckCheck strokeWidth={2.5} />,
};

/** Events with no single person behind them get a badge instead of an avatar. */
const systemEvent = (a: Activity) => a.type === 'completed' || a.type === 'milestone' || !a.userId;

export function ActivityItem({ activity, viewerId = CURRENT_USER_ID, to, meta, size = 'md', tone = 'light', onOpen }: Props) {
  const d = describeActivity(activity, viewerId);
  const body = (
    <>
      <span className="activity__avatar">
        {activity.type === 'guest_contribution' ? (
          <span className={`activity__complete activity__guest avatar--${size}`} aria-hidden>
            {(activity.detail ?? 'G').charAt(0)}
          </span>
        ) : systemEvent(activity) ? (
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
        {activity.type === 'update' && activity.body && <span className="activity__update">{activity.body}</span>}
        <span className="activity__meta">{meta ?? formatRelative(activity.at)}</span>
        {onOpen && <Social activity={activity} />}
      </span>
    </>
  );
  const cls = `activity activity--${tone} ${activity.type === 'completed' ? 'activity--completed' : ''} ${activity.type === 'update' ? 'activity--update' : ''}`;
  if (onOpen) {
    const n = activity.commentCount ?? 0;
    return (
      <button type="button" className={`${cls} activity--social`} onClick={() => onOpen(activity)} aria-label={`${d.name} ${d.verb}. ${n ? `${n} ${n === 1 ? 'comment' : 'comments'}. ` : ''}Open the discussion`}>
        {body}
      </button>
    );
  }
  return to ? (
    <Link to={to} className={`${cls} activity--link`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Reaction and comment counts, only when there is something to show: a quiet row stays one line. */
function Social({ activity }: { activity: Activity }) {
  const shown = REACTIONS.filter((r) => (activity.reactions?.[r.key] ?? 0) > 0);
  const comments = activity.commentCount ?? 0;
  if (!shown.length && !comments) return null;
  return (
    <span className="activity__social">
      {shown.map((r) => (
        <span key={r.key} className={`activity__chip ${activity.myReactions?.includes(r.key) ? 'is-mine' : ''}`}>
          <span aria-hidden>{r.emoji}</span>
          <span className="num">{activity.reactions?.[r.key]}</span>
          <span className="visually-hidden">
            {r.label}
            {activity.myReactions?.includes(r.key) ? ', including you' : ''}
          </span>
        </span>
      ))}
      {comments > 0 && (
        <span className="activity__chip">
          <MessageCircle aria-hidden />
          <span className="num">{comments}</span>
          <span className="visually-hidden">{comments === 1 ? 'comment' : 'comments'}</span>
        </span>
      )}
    </span>
  );
}

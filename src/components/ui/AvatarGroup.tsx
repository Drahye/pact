import type { UserId } from '../../data/types';
import { Avatar, type AvatarSize } from './Avatar';
import './avatar.css';

interface Props {
  userIds: UserId[];
  max?: number;
  size?: AvatarSize;
  ring?: 'surface' | 'bg' | 'inverse';
  /** Total people when it exceeds userIds (e.g. "+4"). */
  total?: number;
  /** Invited but not yet joined: drawn dashed after the members. */
  pendingIds?: UserId[];
  className?: string;
}

export function AvatarGroup({ userIds, max = 4, size = 'sm', ring = 'surface', total, pendingIds = [], className = '' }: Props) {
  const shown = userIds.slice(0, max);
  const pending = pendingIds.slice(0, Math.max(0, max - shown.length));
  const count = total ?? userIds.length + pendingIds.length;
  const overflow = count - shown.length - pending.length;
  return (
    <span className={`avatar-group avatar-group--${size} ${className}`} role="group" aria-label={`${count} people`}>
      {shown.map((id) => (
        <Avatar key={id} userId={id} size={size} ring={ring} />
      ))}
      {pending.map((id) => (
        <Avatar key={id} userId={id} size={size} ring={ring} pending />
      ))}
      {overflow > 0 && (
        <span className={`avatar avatar--${size} avatar--ring-${ring} avatar__overflow`} aria-label={`and ${overflow} more`}>
          +{overflow}
        </span>
      )}
    </span>
  );
}

import { useState } from 'react';
import type { UserId } from '../../data/types';
import { getUser } from '../../data/users';
import './avatar.css';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface Props {
  userId: UserId;
  size?: AvatarSize;
  /** Separates stacked avatars with a ring in the surface colour. */
  ring?: 'surface' | 'bg' | 'inverse' | 'none';
  pending?: boolean;
  label?: boolean; // expose name to assistive tech
  /** Outline the avatar in the person's identity colour. */
  accent?: boolean;
  /** Overrides the identity colour, e.g. the person's colour inside one Pact. */
  accentColor?: string;
  className?: string;
  /** Letters shown without a photo; stacked groups use one so the overlap never cuts a letter. */
  letters?: 1 | 2;
}

const initials = (name: string, letters: number) =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, letters)
    .join('');

/** Portrait with a tinted initials fallback. Pending = invited but not yet joined. */
export function Avatar({ userId, size = 'md', ring = 'none', pending, label = true, accent, accentColor, className = '', letters = 2 }: Props) {
  const user = getUser(userId);
  const [failed, setFailed] = useState(false);
  const showPhoto = user.photo && !failed;
  return (
    <span
      className={`avatar avatar--${size} avatar--ring-${ring} avatar--${user.tint} ${pending ? 'is-pending' : ''} ${accent ? 'avatar--accent' : ''} ${className}`}
      style={accent ? { ['--accent' as string]: accentColor ?? user.color } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label ? `${user.name}${pending ? ' (invited)' : ''}` : undefined}
      aria-hidden={label ? undefined : true}
    >
      {showPhoto ? (
        <img src={user.photo} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span className="avatar__initials">{initials(user.fullName, letters)}</span>
      )}
    </span>
  );
}

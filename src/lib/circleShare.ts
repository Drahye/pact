import { trackClient } from '../api/circles';
import { shareOrCopy, type ShareResult } from './shareLink';

export const circleLink = (token: string) => `${window.location.origin}/app/c/${token}`;

/** Shares a Circle's invite link with the phone's share sheet, or copies it. Returns what happened. */
export function shareCircle(token: string, name: string): Promise<ShareResult> {
  const url = circleLink(token);
  return shareOrCopy({ title: `Join ${name} on PACT`, text: `Join ${name} on PACT`, url }, (via) => trackClient('circle_invite_shared', { via }));
}

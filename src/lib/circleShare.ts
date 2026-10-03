import { trackClient } from '../api/circles';

export const circleLink = (token: string) => `${window.location.origin}/app/c/${token}`;

/** Shares a Circle's invite link with the phone's share sheet, or copies it. Returns what happened. */
export async function shareCircle(token: string, name: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = circleLink(token);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `Join ${name} on PACT`, text: `Join ${name} on PACT`, url });
      trackClient('circle_invite_shared', { via: 'native' });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'failed'; // they closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    trackClient('circle_invite_shared', { via: 'copy' });
    return 'copied';
  } catch {
    return 'failed';
  }
}

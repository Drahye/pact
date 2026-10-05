import type { ObjectKind } from '../../../components/objects/kinds';
import { pendingReturnTo } from './flow';

/**
 * What a signed-out person was doing on a shared page when sign-in became necessary, so the sign-in screens can say it in human words
 * ("Verify your email so your RSVP stays with you") instead of a bare "sign in". Nothing secret: a title, a first name, a choice the
 * person made themselves. It is only shown while the saved return address still matches the page it was made for, and it expires.
 */
export interface Handoff {
  kind: ObjectKind;
  /** The in-app address to return to; the note is shown only while this is still the pending return. */
  path: string;
  /** What it is: the question, the plan, the split, the Circle. */
  title: string;
  /** Who sent it, by first name. */
  from?: string;
  /** What the person was about to do. */
  action: 'answer' | 'rsvp' | 'share' | 'join';
  /** What they chose, in words ("Dec 20", "I’m in"), if they already did. */
  choice?: string;
  at: number;
}

const KEY = 'pact.handoff';
const TTL = 30 * 60 * 1000;

export const setHandoff = (h: Omit<Handoff, 'at'>) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...h, at: Date.now() }));
  } catch {
    /* storage unavailable: sign-in still works, it just has less to say */
  }
};

export const clearHandoff = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

export const readHandoff = (): Handoff | null => {
  try {
    const h = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Handoff | null;
    if (!h || Date.now() - h.at > TTL || pendingReturnTo() !== h.path) return null;
    return h;
  } catch {
    return null;
  }
};

/** The words: what is asked of the person, and why signing in is the way to do it. */
export const handoffWords = (h: Handoff): { title: string; line: string } => {
  switch (h.action) {
    case 'answer':
      return { title: 'You’re almost in.', line: 'Verify your email so your answer counts and stays with you.' };
    case 'rsvp':
      return { title: 'You’re almost in.', line: 'Verify your email so your RSVP stays with you.' };
    case 'share':
      return { title: 'Almost there.', line: 'Sign in and we’ll show your share. It’s matched to your account, so only you see it.' };
    case 'join':
      return { title: 'You’re almost in.', line: 'Sign in to join. It takes a minute, and you land right inside.' };
  }
};

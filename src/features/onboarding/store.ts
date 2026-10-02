/**
 * Whether someone has been through the intro, kept on their device per account. Nothing secret, and nothing the server
 * needs: the intro is a convenience, so losing this (a new phone) means seeing it once more, never being blocked.
 *
 * VERSION is the version of the intro people have seen. To show a materially new intro to everyone, raise
 * CURRENT_VERSION: anyone who finished or skipped an older one sees it again once. Leave it alone for small copy changes.
 */
export const CURRENT_VERSION = 1;
const key = (userId: string) => `pact.onboarding.${userId}`;

export interface IntroState {
  version: number;
  how: 'finished' | 'skipped';
  at: string;
}

export function readIntro(userId: string): IntroState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? 'null') as Partial<IntroState> | null;
    return raw && typeof raw.version === 'number' && (raw.how === 'finished' || raw.how === 'skipped') ? { version: raw.version, how: raw.how, at: String(raw.at ?? '') } : null;
  } catch {
    return null;
  }
}

/** True once they have been through the current intro, whichever way they left it. */
export const introSeen = (userId: string) => (readIntro(userId)?.version ?? 0) >= CURRENT_VERSION;

export function markIntro(userId: string, how: IntroState['how']) {
  try {
    localStorage.setItem(key(userId), JSON.stringify({ version: CURRENT_VERSION, how, at: new Date().toISOString() } satisfies IntroState));
  } catch {
    /* without storage the intro may show again, which is acceptable */
  }
}

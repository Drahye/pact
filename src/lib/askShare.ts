import type { AskDTO } from '../../shared/contracts';
import { recordAskShared, recordLinkReshared } from '../api/asks';

export const askLink = (token: string) => `${window.location.origin}/a/${token}`;

/** Short on purpose: it lands in a group chat. No promotion, just the question and where to answer. */
export const askShareText = (ask: Pick<AskDTO, 'type' | 'title' | 'circle'>, url: string) =>
  ask.type === 'attendance' ? `${ask.title}\nAre you in?\n${url}` : `${ask.circle.name} ${ask.circle.emoji}\n${ask.title}\nHelp us choose:\n${url}`;

/** Opens the phone's share sheet, or copies the link. */
export async function shareAsk(ask: AskDTO): Promise<'shared' | 'copied' | 'failed'> {
  if (!ask.shareToken) return 'failed';
  const url = askLink(ask.shareToken);
  const text = askShareText(ask, url);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: ask.title, text });
      recordAskShared(ask.id, 'native');
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    recordAskShared(ask.id, 'copy');
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Someone who answered from the link passes it on. Same words, same link: the shared object is the pitch. */
export async function reshareAsk(ask: Pick<AskDTO, 'type' | 'title' | 'circle'>, token: string, signedIn: boolean): Promise<'shared' | 'copied' | 'failed'> {
  const url = askLink(token);
  const text = askShareText(ask, url);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: ask.title, text });
      if (signedIn) recordLinkReshared(token, 'native');
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    if (signedIn) recordLinkReshared(token, 'copy');
    return 'copied';
  } catch {
    return 'failed';
  }
}

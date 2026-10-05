import type { AskDTO } from '../../shared/contracts';
import { recordAskShared, recordLinkReshared } from '../api/asks';
import { shareOrCopy, type ShareResult } from './shareLink';

export const askLink = (token: string) => `${window.location.origin}/a/${token}`;

/** Short on purpose: it lands in a group chat. No promotion, just the question and where to answer. */
export const askShareText = (ask: Pick<AskDTO, 'type' | 'title' | 'circle'>, url: string) =>
  ask.type === 'attendance' ? `${ask.title}\nAre you in?\n${url}` : `${ask.circle.name} ${ask.circle.emoji}\n${ask.title}\nHelp us choose:\n${url}`;

/** Opens the phone's share sheet, or copies the link. */
export async function shareAsk(ask: AskDTO): Promise<ShareResult> {
  if (!ask.shareToken) return 'failed';
  return shareOrCopy({ title: ask.title, text: askShareText(ask, askLink(ask.shareToken)) }, (via) => recordAskShared(ask.id, via));
}

/** Someone who answered from the link passes it on. Same words, same link: the shared object is the pitch. */
export function reshareAsk(ask: Pick<AskDTO, 'type' | 'title' | 'circle'>, token: string, signedIn: boolean): Promise<ShareResult> {
  return shareOrCopy({ title: ask.title, text: askShareText(ask, askLink(token)) }, (via) => signedIn && recordLinkReshared(token, via));
}

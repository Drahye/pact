import { recordSplitLinkShared, recordSplitShared } from '../api/splits';
import { shareOrCopy, type ShareResult } from './shareLink';
import { koboText } from './splitMoney';

export const splitLink = (token: string) => `${window.location.origin}/s/${token}`;

/** Short, for a group chat: the split and the link, with "your share" when it is for one person. No promotion. */
export const splitShareText = (title: string, url: string, yourShare?: number) =>
  yourShare ? `${title}\nYour share is ${koboText(yourShare)}.\nView the split:\n${url}` : `${title}\nSee the split:\n${url}`;

/** Opens the phone's share sheet, or copies the text. `splitId` for members, `token` alone for link visitors. */
export function shareSplit(title: string, token: string, record: { splitId?: string; signedIn?: boolean }, yourShare?: number): Promise<ShareResult> {
  return shareOrCopy({ title, text: splitShareText(title, splitLink(token), yourShare) }, (via) => (record.splitId ? recordSplitShared(record.splitId, via) : record.signedIn ? recordSplitLinkShared(token, via) : undefined));
}

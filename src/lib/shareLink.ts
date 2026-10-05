export type ShareResult = 'shared' | 'copied' | 'failed';

/**
 * The one way anything is shared from PACT: the phone's share sheet where there is one (which is how a link reaches WhatsApp, Messages
 * or anything else on the phone), otherwise copy it. Closing the sheet is not a failure to report. `note` is told how it went, so each
 * kind can record that it was shared; it is never given the text or the link.
 */
export async function shareOrCopy(share: { title: string; text: string; url?: string }, note?: (via: 'native' | 'copy') => void): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(share.url ? { title: share.title, text: share.text, url: share.url } : { title: share.title, text: share.text });
      note?.('native');
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(share.url && !share.text.includes(share.url) ? `${share.text}\n${share.url}` : share.text);
    note?.('copy');
    return 'copied';
  } catch {
    return 'failed';
  }
}

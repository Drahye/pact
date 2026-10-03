import { recordRecapShared, type RecapKind } from '../api/home';

export const recapLink = (token: string) => `${window.location.origin}/r/${token}`;
const line = (m: { label: string; value: string }[]) => m.slice(0, 3).map((x) => `${x.value} ${x.label}`).join(' · ');

/** Short and warm, no promotion: the thing, that we made it happen, a few numbers, the link. */
export async function shareRecap(r: { title: string; metrics: { label: string; value: string }[] }, token: string, record?: { kind: RecapKind; id: string }): Promise<'shared' | 'copied' | 'failed'> {
  const text = [r.title, 'We actually made it happen.', line(r.metrics), recapLink(token)].filter(Boolean).join('\n');
  const note = (via: 'native' | 'copy') => record && recordRecapShared(record.kind, record.id, via);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: r.title, text });
      note('native');
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    note('copy');
    return 'copied';
  } catch {
    return 'failed';
  }
}

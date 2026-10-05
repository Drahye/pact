import { recordRecapShared, type RecapKind } from '../api/home';
import { shareOrCopy, type ShareResult } from './shareLink';

export const recapLink = (token: string) => `${window.location.origin}/r/${token}`;
const line = (m: { label: string; value: string }[]) => m.slice(0, 3).map((x) => `${x.value} ${x.label}`).join(' · ');

/** Short and warm, no promotion: the thing, that we made it happen, a few numbers, the link. */
export function shareRecap(r: { title: string; metrics: { label: string; value: string }[] }, token: string, record?: { kind: RecapKind; id: string }): Promise<ShareResult> {
  const text = [r.title, 'We actually made it happen.', line(r.metrics), recapLink(token)].filter(Boolean).join('\n');
  return shareOrCopy({ title: r.title, text }, (via) => record && recordRecapShared(record.kind, record.id, via));
}

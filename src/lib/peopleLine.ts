import { getUser } from '../data/users';

/**
 * People as a sentence, the way a friend would say it: "You, Maya and 3 others". You come first, then the first few names; the rest are counted.
 * Used where a count would be cold ("4 in") and the people are the point.
 */
export function peopleLine(ids: string[], selfId?: string | null, { names = 2 }: { names?: number } = {}): string {
  const ordered = [...ids].sort((a, b) => Number(b === selfId) - Number(a === selfId));
  const label = (id: string) => (id === selfId ? 'You' : getUser(id).name);
  if (ordered.length <= names + 1) {
    const all = ordered.map(label);
    return all.length <= 1 ? (all[0] ?? '') : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
  }
  const rest = ordered.length - names;
  return `${ordered.slice(0, names).map(label).join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
}

import type { PlanSummaryDTO } from '../../shared/contracts';
import { formatNairaCompact } from './format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const part = (iso: string) => ({ m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) });

/** "Dec 18–22", "Dec 28 – Jan 2" or "Dec 18". */
export function dateRange(date: string | null, end: string | null): string | null {
  if (!date) return null;
  const a = part(date);
  if (!end || end === date) return `${MONTHS[a.m]} ${a.d}`;
  const b = part(end);
  return a.m === b.m ? `${MONTHS[a.m]} ${a.d}–${b.d}` : `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}`;
}

/** "Dec 18–22 · Accra", with whatever is known. */
export const whenWhere = (p: Pick<PlanSummaryDTO, 'date' | 'endDate' | 'location'>) => [dateRange(p.date, p.endDate), p.location].filter(Boolean).join(' · ');

/** "6 in · 2 maybe". */
export const goingText = (c: PlanSummaryDTO['counts']) => `${c.in} in${c.maybe ? ` · ${c.maybe} maybe` : ''}`;

export const budgetText = (kobo: number | null) => (kobo ? formatNairaCompact(kobo / 100) : null);

/** Short, for a group chat: the plan, when and where, and the question. No promotion. */
export const planShareText = (p: Pick<PlanSummaryDTO, 'title' | 'date' | 'endDate' | 'location'>, url: string) => [p.title, whenWhere(p), 'Are you coming?', url].filter(Boolean).join('\n');

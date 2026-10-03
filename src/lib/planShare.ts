import type { PlanSummaryDTO } from '../../shared/contracts';
import { recordPlanLinkShared, recordPlanShared } from '../api/plans';
import { planShareText } from './planDates';

export const planLink = (token: string) => `${window.location.origin}/p/${token}`;

/** Opens the phone's share sheet, or copies the text. `planId` for members, `token` alone for link visitors. */
export async function sharePlan(plan: Pick<PlanSummaryDTO, 'title' | 'date' | 'endDate' | 'location'>, token: string, record: { planId?: string; signedIn?: boolean }): Promise<'shared' | 'copied' | 'failed'> {
  const text = planShareText(plan, planLink(token));
  const note = (via: 'native' | 'copy') => (record.planId ? recordPlanShared(record.planId, via) : record.signedIn ? recordPlanLinkShared(token, via) : undefined);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: plan.title, text });
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

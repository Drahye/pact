import type { PlanSummaryDTO } from '../../shared/contracts';
import { recordPlanLinkShared, recordPlanShared } from '../api/plans';
import { planShareText } from './planDates';
import { shareOrCopy, type ShareResult } from './shareLink';

export const planLink = (token: string) => `${window.location.origin}/p/${token}`;

/** Opens the phone's share sheet, or copies the text. `planId` for members, `token` alone for link visitors. */
export function sharePlan(plan: Pick<PlanSummaryDTO, 'title' | 'date' | 'endDate' | 'location'>, token: string, record: { planId?: string; signedIn?: boolean }): Promise<ShareResult> {
  return shareOrCopy({ title: plan.title, text: planShareText(plan, planLink(token)) }, (via) => (record.planId ? recordPlanShared(record.planId, via) : record.signedIn ? recordPlanLinkShared(token, via) : undefined));
}

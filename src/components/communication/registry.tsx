import type { ComponentType } from 'react';
import type { CommunicationData, CommunicationKind } from './model';
import { BalanceReleasedTemplate } from './templates/BalanceReleasedTemplate';
import { CompletedTemplate } from './templates/CompletedTemplate';
import { ContributionTemplate } from './templates/ContributionTemplate';
import { ExecuteTemplate } from './templates/ExecuteTemplate';
import { FundedTemplate } from './templates/FundedTemplate';
import { InviteTemplate } from './templates/InviteTemplate';
import { JoinedTemplate } from './templates/JoinedTemplate';
import { MemberJoinedTemplate } from './templates/MemberJoinedTemplate';
import { OrganizerUpdateTemplate } from './templates/OrganizerUpdateTemplate';
import { PaymentApprovalTemplate } from './templates/PaymentApprovalTemplate';
import { PaymentFailedTemplate } from './templates/PaymentFailedTemplate';
import { PaymentSuccessTemplate } from './templates/PaymentSuccessTemplate';
import { ReplyTemplate } from './templates/ReplyTemplate';
import { TaskAssignedTemplate } from './templates/TaskAssignedTemplate';
import { TaskCompletedTemplate } from './templates/TaskCompletedTemplate';
import { WelcomeTemplate } from './templates/WelcomeTemplate';

export interface TemplateProps {
  data: CommunicationData;
  headingLevel?: 'h1' | 'h2' | 'h3';
}

/** The one place that maps an event to its template. Nothing else in the app switches on the kind. */
export const templates: Record<CommunicationKind, ComponentType<TemplateProps>> = {
  welcome: WelcomeTemplate,
  invite: InviteTemplate,
  joined: JoinedTemplate,
  member_joined: MemberJoinedTemplate,
  contribution: ContributionTemplate,
  task_assigned: TaskAssignedTemplate,
  task_completed: TaskCompletedTemplate,
  funded: FundedTemplate,
  execute: ExecuteTemplate,
  payment_approval: PaymentApprovalTemplate,
  payment_success: PaymentSuccessTemplate,
  payment_failed: PaymentFailedTemplate,
  organizer_update: OrganizerUpdateTemplate,
  completed: CompletedTemplate,
  balance_released: BalanceReleasedTemplate,
  reply: ReplyTemplate,
};

/** `renderTemplate('funded', data)`: the template for that event, filled in. */
export function renderTemplate(kind: CommunicationKind, data: CommunicationData, headingLevel: TemplateProps['headingLevel'] = 'h1') {
  const Template = templates[kind];
  return <Template data={data} headingLevel={headingLevel} />;
}

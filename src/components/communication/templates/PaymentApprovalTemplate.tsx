import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import type { TemplateProps } from '../registry';
import { AmountHero, Person } from '../blocks';
import { CommunicationCard } from '../CommunicationCard';

export function PaymentApprovalTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('payment_approval', data)} headingLevel={headingLevel}>
      {data.amount !== undefined && <AmountHero amount={data.amount} caption={`${data.paymentPurpose ?? 'Payment'}${data.payee ? ` to ${data.payee}` : ''}`} />}
      <CommunicationCard label="Requested by">
        <Person name={data.actorName ?? 'Someone'} note={`Asked to pay from ${data.pactName}`} />
      </CommunicationCard>
    </CommunicationLayout>
  );
}

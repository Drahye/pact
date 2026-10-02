import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import type { TemplateProps } from '../registry';
import { AmountHero } from '../blocks';
import { CommunicationCard } from '../CommunicationCard';

export function PaymentFailedTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('payment_failed', data)} headingLevel={headingLevel}>
      {data.amount !== undefined && <AmountHero amount={data.amount} caption={`${data.paymentPurpose ?? 'Payment'}${data.payee ? ` to ${data.payee}` : ''}`} />}
      <CommunicationCard label="What happened" className="comm-reason">
        <h3 className="comm-card__title">What happened</h3>
        <p>{data.failureReason ?? 'The payment could not be completed.'}</p>
        <p>The money is back in {data.pactName}. Check the details, then try again.</p>
      </CommunicationCard>
    </CommunicationLayout>
  );
}

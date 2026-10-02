import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import type { TemplateProps } from '../registry';
import { formatNaira } from '../../../lib/format';
import { AmountHero } from '../blocks';

export function PaymentSuccessTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('payment_success', data)} headingLevel={headingLevel}>
      {data.amount !== undefined && <AmountHero amount={data.amount} caption={`${data.paymentPurpose ?? 'Payment'}${data.payee ? ` to ${data.payee}` : ''}`} tone="good" />}
      {data.availableAmount !== undefined && <p className="comm__note">{`Still available in the Pact: ${formatNaira(data.availableAmount)}.`}</p>}
    </CommunicationLayout>
  );
}

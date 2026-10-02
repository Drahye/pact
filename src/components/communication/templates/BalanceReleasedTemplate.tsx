import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import type { TemplateProps } from '../registry';
import { AmountHero, StepList } from '../blocks';

export function BalanceReleasedTemplate({ data, headingLevel }: TemplateProps) {
  const amount = data.releasedAmount ?? data.amount;
  return (
    <CommunicationLayout content={contentFor('balance_released', data)} headingLevel={headingLevel}>
      {amount !== undefined && <AmountHero amount={amount} caption="released from the Pact" />}
      <StepList
        title="Where this fits"
        steps={[
          { title: 'Funded', body: 'The group raised what it needed.' },
          { title: 'Used for the plan', body: 'Payments went to the people who made it happen.' },
          { title: 'Released', body: 'What was left moved to the organiser’s wallet.' },
        ]}
      />
    </CommunicationLayout>
  );
}

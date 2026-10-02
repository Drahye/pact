import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import { CommunicationPactSummary } from '../CommunicationPactSummary';
import type { TemplateProps } from '../registry';
import { PeopleRing, StepList } from '../blocks';

export function FundedTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('funded', data)} headingLevel={headingLevel} hero={<PeopleRing data={{ ...data, raisedAmount: data.targetAmount }} size={140}><span className="comm-ring-center"><strong className="num">100%</strong><span>funded</span></span></PeopleRing>}>
      <CommunicationPactSummary data={{ ...data, raisedAmount: data.targetAmount }} />
      <StepList
        title="Now make the plan happen"
        steps={[
          { title: 'Pay for what the plan needs', body: 'Use the Pact’s money for the venue, the cake, the trip.' },
          { title: 'Finish the tasks', body: 'See what’s still open and who has it.' },
          { title: 'Complete the Pact', body: 'Close the loop and celebrate what you made happen.' },
        ]}
      />
    </CommunicationLayout>
  );
}

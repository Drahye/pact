import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import { CommunicationPactSummary } from '../CommunicationPactSummary';
import type { TemplateProps } from '../registry';
import { AmountHero, LineList } from '../blocks';

export function ExecuteTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('execute', data)} headingLevel={headingLevel}>
      {data.availableAmount !== undefined && <AmountHero amount={data.availableAmount} caption="available in the Pact" tone="good" />}
      {data.budgetLines?.length ? <LineList title="The plan" lines={data.budgetLines} /> : <CommunicationPactSummary data={data} />}
    </CommunicationLayout>
  );
}

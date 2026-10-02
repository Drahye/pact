import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import { CommunicationPactSummary } from '../CommunicationPactSummary';
import type { TemplateProps } from '../registry';
import { AmountHero } from '../blocks';

export function ContributionTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('contribution', data)} headingLevel={headingLevel}>
      {data.amount !== undefined && (data.count ?? 1) <= 1 && <AmountHero amount={data.amount} caption={`added by ${data.actorName ?? 'someone'}`} tone="good" />}
      <CommunicationPactSummary data={data} />
    </CommunicationLayout>
  );
}

import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import { CommunicationPactSummary } from '../CommunicationPactSummary';
import type { TemplateProps } from '../registry';

export function InviteTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('invite', data)} headingLevel={headingLevel}>
      <CommunicationPactSummary data={data} />
    </CommunicationLayout>
  );
}

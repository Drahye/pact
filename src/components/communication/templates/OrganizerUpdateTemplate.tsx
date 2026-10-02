import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import { CommunicationPactSummary } from '../CommunicationPactSummary';
import type { TemplateProps } from '../registry';
import { Quote } from '../blocks';

export function OrganizerUpdateTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('organizer_update', data)} headingLevel={headingLevel}>
      <Quote by={data.actorName ? `${data.actorName}, organiser` : undefined}>{data.updateBody ?? 'There’s something new to know.'}</Quote>
      <CommunicationPactSummary data={data} progress={false} />
    </CommunicationLayout>
  );
}

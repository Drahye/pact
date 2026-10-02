import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import { CommunicationPactSummary } from '../CommunicationPactSummary';
import type { TemplateProps } from '../registry';
import { StepList } from '../blocks';

export function JoinedTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('joined', data)} headingLevel={headingLevel}>
      <CommunicationPactSummary data={data} />
      <StepList
        title="What happens next"
        steps={[
          { title: 'Choose how you’ll participate', body: 'Money, a task, or both. You can say you’re in and decide later.' },
          { title: 'Watch it come together', body: 'Everyone sees the progress and what’s left.' },
        ]}
      />
    </CommunicationLayout>
  );
}

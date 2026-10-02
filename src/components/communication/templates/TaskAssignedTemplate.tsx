import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import { CommunicationPactSummary } from '../CommunicationPactSummary';
import type { TemplateProps } from '../registry';
import { TaskCard } from '../blocks';

export function TaskAssignedTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('task_assigned', data)} headingLevel={headingLevel}>
      <TaskCard data={data} />
      <CommunicationPactSummary data={data} progress={false} />
    </CommunicationLayout>
  );
}

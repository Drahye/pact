import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import { CommunicationPactSummary } from '../CommunicationPactSummary';
import type { TemplateProps } from '../registry';
import { TaskCard } from '../blocks';

export function TaskCompletedTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('task_completed', { ...data, taskStatus: 'done' })} headingLevel={headingLevel}>
      <TaskCard data={{ ...data, taskStatus: 'done' }} />
      <CommunicationPactSummary data={data} />
    </CommunicationLayout>
  );
}

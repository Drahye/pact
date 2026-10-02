import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';

import type { TemplateProps } from '../registry';
import { StepList } from '../blocks';

export function WelcomeTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('welcome', data)} headingLevel={headingLevel}>
      <StepList
        title="How it works"
        steps={[
          { title: 'Start the plan', body: 'Name it, set the goal and the date.' },
          { title: 'Bring your people in', body: 'Share one link. Everyone brings money, a task, or both.' },
          { title: 'Make it happen', body: 'See what’s left, pay for the plan and finish it together.' },
        ]}
      />
    </CommunicationLayout>
  );
}

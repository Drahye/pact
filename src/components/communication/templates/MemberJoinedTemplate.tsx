import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import { CommunicationPactSummary } from '../CommunicationPactSummary';
import type { TemplateProps } from '../registry';
import { Person } from '../blocks';
import { CommunicationCard } from '../CommunicationCard';

export function MemberJoinedTemplate({ data, headingLevel }: TemplateProps) {
  const idx = data.people?.length ? data.people.length - 1 : -1;
  return (
    <CommunicationLayout content={contentFor('member_joined', data)} headingLevel={headingLevel}>
      <CommunicationCard label="Who joined">
        <Person userId={idx >= 0 ? data.people![idx] : undefined} name={data.actorName ?? 'Someone'} note={`Joined ${data.pactName}`} />
      </CommunicationCard>
      <CommunicationPactSummary data={data} />
    </CommunicationLayout>
  );
}

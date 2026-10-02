import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import { CommunicationPactSummary } from '../CommunicationPactSummary';
import type { TemplateProps } from '../registry';
import { Check } from 'lucide-react';
import { formatNaira } from '../../../lib/format';
import { PeopleRing, StatGrid } from '../blocks';

export function CompletedTemplate({ data, headingLevel }: TemplateProps) {
  const stats = [
    { label: 'People', value: String(data.peopleCount ?? data.people?.length ?? 0) },
    { label: 'Raised', value: formatNaira(data.raisedAmount ?? 0) },
    ...(data.usedAmount !== undefined ? [{ label: 'Used for the plan', value: formatNaira(data.usedAmount) }] : []),
    ...(data.releasedAmount ? [{ label: 'Released', value: formatNaira(data.releasedAmount) }] : []),
  ];
  return (
    <CommunicationLayout content={contentFor('completed', data)} headingLevel={headingLevel} hero={<PeopleRing data={{ ...data, raisedAmount: data.targetAmount ?? data.raisedAmount }} size={140}><span className="comm-ring-center"><Check aria-hidden /><span>Done</span></span></PeopleRing>}>
      <StatGrid stats={stats} />
      <CommunicationPactSummary data={{ ...data, raisedAmount: data.targetAmount ?? data.raisedAmount }} progress={false} />
    </CommunicationLayout>
  );
}

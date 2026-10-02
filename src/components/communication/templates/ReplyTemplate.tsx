import { contentFor } from '../copy';
import { CommunicationLayout } from '../CommunicationLayout';
import type { TemplateProps } from '../registry';
import { Quote } from '../blocks';

export function ReplyTemplate({ data, headingLevel }: TemplateProps) {
  return (
    <CommunicationLayout content={contentFor('reply', { ...data, replyPreview: undefined })} headingLevel={headingLevel}>
      <Quote by={`${data.actorName ?? 'Someone'}${data.about ? `, on ${data.about}` : ''}`}>{data.replyPreview ?? `There’s a new comment in ${data.pactName}.`}</Quote>
    </CommunicationLayout>
  );
}

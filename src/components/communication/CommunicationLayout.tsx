import { useId, type ReactNode } from 'react';
import { CommunicationCta } from './CommunicationCta';
import { CommunicationMeta } from './CommunicationMeta';
import { CommunicationStatusBadge } from './CommunicationStatusBadge';
import { iconFor } from './icons';
import type { Content } from './model';
import './communication.css';

/**
 * The shell every template sits in: status, a hero, the title and message, a place for the data blocks, the buttons and
 * the small print. It owns spacing, width and tone, so each template only says what is special about its moment.
 * It lays itself out from its own width (container queries), so the same template is right on a phone, in a sheet, in
 * a narrow preview frame and on a desktop page.
 */
export function CommunicationLayout({ content, hero, children, headingLevel = 'h1' }: { content: Content; hero?: ReactNode; children?: ReactNode; headingLevel?: 'h1' | 'h2' | 'h3' }) {
  const id = useId();
  const Heading = headingLevel;
  return (
    <div className="comm-wrap">
      <article className={`comm comm--${content.tone}`} aria-labelledby={id}>
        <header className="comm__head">
          <CommunicationStatusBadge label={content.badge.label} icon={content.badge.icon} tone={content.tone} />
          <p className="comm__eyebrow">{content.eyebrow}</p>
        </header>
        <div className="comm__hero" aria-hidden>
          {hero ?? <span className="comm__hero-icon">{iconFor(content.badge.icon)}</span>}
        </div>
        <Heading id={id} className="comm__title">
          {content.title}
        </Heading>
        <p className="comm__message">{content.message}</p>
        {children && <div className="comm__body">{children}</div>}
        <CommunicationCta primary={content.primary} secondary={content.secondary} />
        <CommunicationMeta items={content.meta} />
      </article>
    </div>
  );
}

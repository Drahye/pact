import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './section-heading.css';

interface Props {
  title: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  action?: { label: string; to: string };
  /** `app` = in-product list header; `site` = marketing section headline. */
  variant?: 'app' | 'site';
  align?: 'start' | 'center';
  as?: 'h1' | 'h2' | 'h3';
  id?: string;
  className?: string;
}

export function SectionHeading({ title, eyebrow, description, action, variant = 'app', align = 'start', as: Tag = 'h2', id, className = '' }: Props) {
  return (
    <div className={`section-heading section-heading--${variant} section-heading--${align} ${className}`}>
      <div className="section-heading__text">
        {eyebrow && <p className="section-heading__eyebrow">{eyebrow}</p>}
        <Tag id={id} className="section-heading__title">
          {title}
        </Tag>
        {description && <p className="section-heading__description">{description}</p>}
      </div>
      {action && (
        <Link to={action.to} className="section-heading__action">
          {action.label}
        </Link>
      )}
    </div>
  );
}

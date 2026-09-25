import type { ReactNode } from 'react';
import './badge.css';

interface Props {
  tone?: 'neutral' | 'accent' | 'inverse' | 'danger' | 'outline';
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', dot, icon, children, className = '' }: Props) {
  return (
    <span className={`badge badge--${tone} ${className}`}>
      {dot && <span className="badge__dot" aria-hidden />}
      {icon}
      {children}
    </span>
  );
}

import type { ReactNode } from 'react';

/** A contextual data block inside a message: the amounts, the task, the quote. */
export function CommunicationCard({ children, label, className = '' }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <section className={`comm-card ${className}`} aria-label={label}>
      {children}
    </section>
  );
}

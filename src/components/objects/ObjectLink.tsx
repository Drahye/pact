import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** The part of an object that opens it: a real link when it has somewhere to go, plain content when it does not. */
export function ObjectLink({ to, onOpen, className, label, children }: { to?: string; onOpen?: () => void; className?: string; label?: string; children: ReactNode }) {
  return to ? (
    <Link to={to} className={className} aria-label={label} onClick={onOpen}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

/** A small action inside an object: to somewhere, or a handler. */
export interface ObjectAction {
  label: string;
  to?: string;
  onClick?: () => void;
}

export function ActionButton({ action, tone = 'solid', onOpen }: { action: ObjectAction; tone?: 'solid' | 'tonal'; onOpen?: () => void }) {
  const cls = `act act--${tone}`;
  return action.to ? (
    <Link to={action.to} className={cls} onClick={() => (action.onClick?.(), onOpen?.())}>
      {action.label}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={() => (action.onClick?.(), onOpen?.())}>
      {action.label}
    </button>
  );
}

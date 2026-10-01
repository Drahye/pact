import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';
import './app-ui.css';

/** PACT's own loader: the mark's ring draws itself and turns. Used whenever the whole screen is waiting. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state state--loading app-loader" role="status" aria-label={label}>
      <span className="app-loader__mark" aria-hidden>
        <Logo wordmark={false} size="lg" />
      </span>
      <span className="app-loader__word" aria-hidden>
        pact
      </span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <span className="state__icon" aria-hidden>
        <AlertCircle />
      </span>
      <p className="state__title">That didn’t load</p>
      <p className="state__body">{message ?? 'Check your connection and try again.'}</p>
      {onRetry && (
        <Button variant="secondary" size="md" iconLeft={<RefreshCw />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="state state--empty">
      <span className="state__icon state__icon--soft" aria-hidden>
        {icon}
      </span>
      <p className="state__title">{title}</p>
      <p className="state__body">{body}</p>
      {action}
    </div>
  );
}

/** Inline notice: errors from the API, sandbox hints, policy notes. */
export function Notice({ tone = 'neutral', icon, children }: { tone?: 'neutral' | 'danger' | 'accent' | 'sun'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      {icon && <span className="notice__icon">{icon}</span>}
      <div className="notice__body">{children}</div>
    </div>
  );
}

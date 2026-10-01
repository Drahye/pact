import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import '../../styles/loader.css';
import './app-ui.css';

/**
 * PACT's own loader: the segmented ring, one colour per person, fills in and turns. `full` covers the screen
 * (app start, route chunks, signing in); the default sits inside a screen that is waiting for its data.
 */
export function Loading({ label = 'Loading', full = false }: { label?: string; full?: boolean }) {
  return (
    <div className={`pl ${full ? 'pl--full' : 'pl--inline'}`} role="status" aria-label={label}>
      <svg className="pl__ring" viewBox="0 0 96 96" aria-hidden>
        <g transform="rotate(-90 48 48)">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} cx="48" cy="48" r="38" pathLength="100" />
          ))}
        </g>
      </svg>
      <span className="pl__word" aria-hidden>
        PACT
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

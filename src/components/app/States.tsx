import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import '../../styles/loader.css';
import './app-ui.css';

/**
 * PACT's own loader: the app icon (dark disc, green loop) with its four pieces lighting up and the loop turning.
 * It is the same picture Android shows as its launch screen, so the two read as one moment. `full` covers the
 * screen (app start, route chunks, signing in); the default sits inside a screen waiting for its data.
 */
export function Loading({ label = 'Loading', full = false }: { label?: string; full?: boolean }) {
  return (
    <div className={`pl ${full ? 'pl--full' : 'pl--inline'}`} role="status" aria-label={label}>
      <svg className="pl__disc" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="32" fill="#0f1713" /><g className="pl__mark"><path d="M28.786 16.955A15.36 15.36 0 0 1 47.107 29.312" /><path d="M45.786 38.713A15.36 15.36 0 0 1 31.98 47.34" /><path d="M22.952 44.406A15.36 15.36 0 0 1 17.076 35.696" /><path d="M17.739 26.226A15.36 15.36 0 0 1 20.565 21.702" /></g>
      </svg>
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

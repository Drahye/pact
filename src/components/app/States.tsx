import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { loaderClass, loaderSvg } from '../brand/loaderMarkup';
import '../../styles/loader.css';
import './app-ui.css';

/**
 * PACT's startup loader: the logo's four pieces light up and the loop turns, small and centred. `full` covers the screen
 * (app start, lazy routes, signing in). The default sits inside a screen that is waiting; screens with a known shape
 * should use their skeletons instead, and a small action its button's spinner.
 *
 * The markup comes from loaderSvg(), the same function that builds the loader in index.html, so the first paint before
 * JavaScript and this component are one picture. The look is src/styles/loader.css.
 */
export function Loading({ label = 'Loading', full = false }: { label?: string; full?: boolean }) {
  return <div className={loaderClass(full)} role="status" aria-label={label} dangerouslySetInnerHTML={{ __html: loaderSvg() }} />;
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

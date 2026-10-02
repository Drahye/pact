import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { COMMUNICATION_KINDS, type CommunicationKind } from '../../components/communication/model';
import { renderTemplate } from '../../components/communication/registry';
import { samples } from '../../components/communication/samples';
import { contentFor } from '../../components/communication/copy';
import { useMediaQuery } from '../../lib/useMediaQuery';
import './templates-preview.css';

const WIDTHS = [320, 375, 390, 430, 768, 960] as const;
const THEMES = ['light', 'dark', 'system'] as const;
type Theme = (typeof THEMES)[number];

const label: Record<CommunicationKind, string> = {
  welcome: 'Welcome', invite: 'Invite', joined: 'You joined', member_joined: 'Member joined', contribution: 'Contribution', task_assigned: 'Task assigned',
  task_completed: 'Task done', funded: 'Funded', execute: 'Use the money', payment_approval: 'Approval needed', payment_success: 'Payment sent', payment_failed: 'Payment failed',
  organizer_update: 'Update', completed: 'Completed', balance_released: 'Released', reply: 'Reply',
};

/**
 * Design QA for the communication templates: every template with sample data, in light, dark or system theme, at the
 * widths people actually have. Not linked from the product. It is open in development and on staging, and closed in
 * production (the server says which it is).
 */
export function TemplatesPreview() {
  const { config } = useAuth();
  const [params, setParams] = useSearchParams();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const kind = (params.get('kind') as CommunicationKind | 'all' | null) ?? 'all';
  const theme = (THEMES.find((t) => t === params.get('theme')) ?? 'light') as Theme;
  const width = WIDTHS.find((w) => String(w) === params.get('w')) ?? 390;
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  const set = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); n.set(k, v); return n; }, { replace: true });

  useEffect(() => {
    document.title = 'Communication templates · PACT';
  }, []);

  // Closed in production. Until the server has said which deployment this is, wait rather than flash it.
  if (!import.meta.env.DEV) {
    if (!config) return null;
    if (config.deployEnv === 'production') return <Navigate to="/" replace />;
  }

  const kinds = kind === 'all' ? COMMUNICATION_KINDS : [kind];
  return (
    <main className="tp">
      <header className="tp__head">
        <h1>Communication templates</h1>
        <p>Every lifecycle message, with sample data. Choose a template, a width and a theme.</p>
      </header>

      <div className="tp__controls">
        <fieldset>
          <legend>Template</legend>
          <div className="tp__chips">
            {(['all', ...COMMUNICATION_KINDS] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} className={`tp__chip ${kind === k ? 'is-on' : ''}`} onClick={() => set('kind', k)}>
                {k === 'all' ? 'All' : label[k]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Width</legend>
          <div className="tp__chips">
            {WIDTHS.map((w) => (
              <button key={w} type="button" aria-pressed={width === w} className={`tp__chip ${width === w ? 'is-on' : ''}`} onClick={() => set('w', String(w))}>
                {w === 960 ? 'Desktop' : w}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Theme</legend>
          <div className="tp__chips">
            {THEMES.map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} className={`tp__chip ${theme === t ? 'is-on' : ''}`} onClick={() => set('theme', t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="tp__stage">
        {kinds.map((k) => (
          <section key={k} className="tp__item" aria-label={label[k]}>
            <p className="tp__tag">
              <strong>{label[k]}</strong> <code>{k}</code> · {contentFor(k, samples[k]).tone}
            </p>
            <div className="tp__frame" data-preview-theme={dark ? 'dark' : 'light'} style={{ width }}>
              {renderTemplate(k, samples[k], 'h2')}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

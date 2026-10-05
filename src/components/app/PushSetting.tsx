import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../api/auth';
import { pushDiagnostics } from '../../lib/push';
import type { Diagnostics } from '../../lib/pushSync';
import { usePush } from '../../lib/usePush';
import { SettingsGroup } from '../settings/Settings';
import { useToast } from '../ui/Toast';
import './push-prompt.css';

/** Settings → Notifications: one switch for this device. Hidden entirely when the server has push turned off. */
export function PushSetting() {
  const { state, busy, enable, disable } = usePush();
  const { config } = useAuth();
  const toast = useToast();
  // Development builds only: every input to "is push working" side by side. Absent from production.
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const publicKey = config?.push?.publicKey ?? null;
  useEffect(() => {
    if (import.meta.env.DEV && state !== 'checking') void pushDiagnostics(publicKey).then(setDiag);
  }, [state, publicKey]);
  if (state === 'checking' || state === 'unavailable') return null;

  const on = state === 'on';
  const blocked = state === 'blocked';
  const unsupported = state === 'unsupported';
  const hint = unsupported
    ? 'This browser can’t show notifications from PACT, so everything stays here in the app.'
    : state === 'error'
      ? 'Notifications are allowed in this browser, but this device didn’t finish setting up. Turn it on again to retry.'
    : blocked
      ? 'This browser is set to block notifications for PACT. Whenever you like, allow them in the browser’s site settings and come back.'
      : 'Plans and replies, money and settlements, Pact progress. Even when PACT isn’t open.';

  const toggle = async () => {
    if (on) {
      await disable();
      toast('Notifications are off on this device');
      return;
    }
    const next = await enable();
    if (next === 'on') toast('Notifications are on');
    else if (next === 'blocked') toast('Notifications are blocked in your browser.', 'neutral');
  };

  return (
    <SettingsGroup id="st-notify" title="Notifications" plain>
    <div className="push-setting">
      <span className="push-setting__icon" aria-hidden>
        <BellRing />
      </span>
      <div className="push-setting__text">
        <span id="push-setting-label" className="push-setting__title">
          Notify me on this device
        </span>
        <span id="push-setting-hint" className="push-setting__hint">
          {hint}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="push-setting-label"
        aria-describedby="push-setting-hint"
        className={`switch ${on ? 'is-on' : ''}`}
        disabled={busy || blocked || unsupported}
        onClick={toggle}
      >
        <span className="switch__thumb" aria-hidden />
        <span className="visually-hidden">{on ? 'On' : 'Off'}</span>
      </button>
    </div>
    {diag && (
      <details className="push-setting__dev" data-testid="push-diagnostics">
        <summary>Push diagnostics (dev)</summary>
        <pre>{[
          `Notification.permission: ${diag.permission}`,
          `service worker registered: ${diag.serviceWorkerRegistered ? 'yes' : 'no'}`,
          `service worker active: ${diag.serviceWorkerActive ? 'yes' : 'no'}`,
          `push subscription present: ${diag.pushSubscription ? 'yes' : 'no'}`,
          `server subscription present: ${diag.serverSubscription === null ? 'unknown' : diag.serverSubscription ? 'yes' : 'no'}`,
          `VAPID public key available: ${diag.vapidKey ? 'yes' : 'no'}`,
        ].join('\n')}</pre>
      </details>
    )}
    </SettingsGroup>
  );
}

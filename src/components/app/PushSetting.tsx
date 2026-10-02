import { BellRing } from 'lucide-react';
import { usePush } from '../../lib/usePush';
import { useToast } from '../ui/Toast';
import './push-prompt.css';

/** Profile → Notifications: one switch for this device. Hidden entirely when the server has push turned off. */
export function PushSetting() {
  const { state, busy, enable, disable } = usePush();
  const toast = useToast();
  if (state === 'checking' || state === 'unavailable') return null;

  const on = state === 'on';
  const blocked = state === 'blocked';
  const unsupported = state === 'unsupported';
  const hint = unsupported
    ? 'This browser can’t show notifications from PACT.'
    : blocked
      ? 'Blocked in your browser. Allow notifications for PACT in its site settings, then come back.'
      : 'Payment approvals, goals reached, tasks due and organiser updates, even when PACT isn’t open.';

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
    <>
    <p className="menu-label">Notifications</p>
    <div className="push-setting">
      <span className="push-setting__icon" aria-hidden>
        <BellRing />
      </span>
      <div className="push-setting__text">
        <span id="push-setting-label" className="push-setting__title">
          Notifications on this device
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
    </>
  );
}

import { BellRing, X } from 'lucide-react';
import { useState } from 'react';
import { dismissPrompt, promptDismissed } from '../../lib/push';
import { usePush } from '../../lib/usePush';
import { IconButton } from '../ui/IconButton';
import { useToast } from '../ui/Toast';
import './push-prompt.css';
import './strip.css';

/**
 * Offered once someone is part of a Pact and has something to be told about. The browser's own permission
 * question appears only after "Turn on notifications"; "Not now" is remembered and the card does not come back.
 */
export function PushPrompt({ hasPact }: { hasPact: boolean }) {
  const { state, busy, enable } = usePush();
  const [hidden, setHidden] = useState(promptDismissed);
  const toast = useToast();
  if (!hasPact || hidden || state !== 'off') return null;

  const later = () => {
    dismissPrompt();
    setHidden(true);
  };
  const turnOn = async () => {
    const next = await enable();
    if (next === 'blocked') {
      toast('Notifications are blocked in your browser. You can allow them in its site settings.', 'neutral');
      later();
    } else if (next === 'on') {
      toast('Notifications are on');
    } else {
      later();
    }
  };

  return (
    <section className="strip" aria-labelledby="push-prompt-title">
      <span className="strip__icon" aria-hidden>
        <BellRing />
      </span>
      <div className="strip__text">
        <h2 id="push-prompt-title" className="strip__title">
          Know when your people need you.
        </h2>
        <p>Updates even when PACT isn’t open.</p>
      </div>
      <button type="button" className="act act--solid" aria-label="Turn on notifications" onClick={turnOn} disabled={busy}>
        {busy ? 'Turning on' : 'Turn on'}
      </button>
      <IconButton label="Not now" variant="ghost" icon={<X />} onClick={later} disabled={busy} />
    </section>
  );
}

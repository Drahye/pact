import { BellRing } from 'lucide-react';
import { useState } from 'react';
import { dismissPrompt, promptDismissed } from '../../lib/push';
import { usePush } from '../../lib/usePush';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import './push-prompt.css';

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
    <section className="push-prompt" aria-labelledby="push-prompt-title">
      <span className="push-prompt__icon" aria-hidden>
        <BellRing />
      </span>
      <div className="push-prompt__text">
        <h2 id="push-prompt-title" className="push-prompt__title">
          Stay in the loop
        </h2>
        <p>Get important updates when your group needs you, even when PACT isn’t open.</p>
      </div>
      <div className="push-prompt__actions">
        <Button size="md" onClick={turnOn} loading={busy}>
          Turn on notifications
        </Button>
        <Button size="md" variant="ghost" onClick={later} disabled={busy}>
          Not now
        </Button>
      </div>
    </section>
  );
}

import { BellRing, X } from 'lucide-react';
import { useState } from 'react';
import { dismissPrompt, promptDismissed } from '../../lib/push';
import { usePush } from '../../lib/usePush';
import { IconButton } from '../ui/IconButton';
import { useToast } from '../ui/Toast';
import './push-prompt.css';
import './strip.css';

/**
 * Offered once someone is part of a Pact and has something to be told about, and only when the browser has not been asked yet. The browser's own
 * permission question appears only after "Turn on notifications"; "Not now" is remembered and the card does not come back. Never shown when
 * notifications work, and never again to someone who blocked them (Settings explains that quietly). If notifications are allowed but a working
 * subscription could not be made, it says so once, with a way to try again.
 */
export function PushPrompt({ hasPact }: { hasPact: boolean }) {
  const { state, busy, enable } = usePush();
  const [hidden, setHidden] = useState(promptDismissed);
  const [failedHidden, setFailedHidden] = useState(false);
  const toast = useToast();
  if (!hasPact || (state !== 'off' && state !== 'error') || (state === 'off' && hidden) || (state === 'error' && failedHidden)) return null;

  const later = () => {
    if (state === 'error') return setFailedHidden(true); // a problem is not "not now" forever: it is asked again next visit
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
    } else if (next === 'error') {
      toast('Couldn’t turn notifications on. Try again in a moment.', 'neutral');
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
          {state === 'error' ? 'Notifications need another try.' : 'Know when your people need you.'}
        </h2>
        <p>{state === 'error' ? 'They’re allowed, but this device didn’t finish setting up.' : 'Updates even when PACT isn’t open.'}</p>
      </div>
      <button type="button" className="act act--solid" aria-label="Turn on notifications" onClick={turnOn} disabled={busy}>
        {busy ? 'Turning on' : state === 'error' ? 'Try again' : 'Turn on'}
      </button>
      <IconButton label="Not now" variant="ghost" icon={<X />} onClick={later} disabled={busy} />
    </section>
  );
}

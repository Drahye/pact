import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useAccountActions } from '../../api/account';
import { useAuth } from '../../api/auth';
import { ApiError } from '../../api/client';
import { MailPlus, X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { useToast } from '../ui/Toast';
import './strip.css';

const KEY = 'pact.upgradePrompt.until';
const quietDays = 14;

const snoozed = () => {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
};

/**
 * For people who signed up with a phone number: a gentle, dismissible nudge to add an email or connect Google.
 * Never blocks anything, and stays quiet for two weeks after "Maybe later".
 */
export function SignInUpgradePrompt() {
  const { user, config } = useAuth();
  const account = useAccount();
  const { startGoogle } = useAccountActions();
  const toast = useToast();
  const a = account.data;
  const [gone, setGone] = useState(false);
  const hide = () => {
    try {
      localStorage.setItem(KEY, String(Date.now() + quietDays * 86_400_000));
    } catch {
      /* ignore */
    }
    setGone(true);
  };
  if (gone || !user || !a || a.email || a.google.connected || !a.phone || snoozed()) return null;

  const google = async () => {
    try {
      const { url } = await startGoogle.mutateAsync(undefined);
      window.location.assign(url);
    } catch (e) {
      toast((e as ApiError).message, 'neutral');
    }
  };

  return (
    <section className="strip" aria-labelledby="upgrade-h">
      <span className="strip__icon" aria-hidden>
        <MailPlus />
      </span>
      <div className="strip__text">
        <h2 id="upgrade-h" className="strip__title">
          Make signing in easier
        </h2>
        <p>{config?.auth?.google ? 'Add an email or connect Google, so you’re not tied to one phone number.' : 'Add an email, so you’re not tied to one phone number.'}</p>
      </div>
      {config?.auth?.google ? (
        <button type="button" className="act act--solid" onClick={google} disabled={startGoogle.isPending}>
          Connect Google
        </button>
      ) : (
        <Link to="/app/profile/account" className="act act--solid">
          Add email
        </Link>
      )}
      <IconButton label="Maybe later" variant="ghost" icon={<X />} onClick={hide} />
    </section>
  );
}

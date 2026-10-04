import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useAccountActions } from '../../api/account';
import { useAuth } from '../../api/auth';
import { ApiError } from '../../api/client';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import './sign-in-upgrade.css';

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
    <section className="upgrade" aria-labelledby="upgrade-h">
      <h2 id="upgrade-h" className="upgrade__title">Make signing in easier</h2>
      <p className="upgrade__body">{config?.auth?.google ? 'Add an email or connect Google, so you’re not tied to one phone number.' : 'Add an email, so you’re not tied to one phone number.'}</p>
      <div className="upgrade__actions">
        {config?.auth?.google && (
          <Button size="sm" onClick={google} loading={startGoogle.isPending}>
            Connect Google
          </Button>
        )}
        <Button size="sm" variant={config?.auth?.google ? 'secondary' : 'primary'} to="/app/profile/account">
          Add email
        </Button>
        <button type="button" className="link upgrade__later" onClick={hide}>
          Maybe later
        </button>
      </div>
      <Link to="/app/profile/account" className="visually-hidden">Account and sign-in</Link>
    </section>
  );
}

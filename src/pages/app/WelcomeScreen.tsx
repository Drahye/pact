import { FlaskConical, Link2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PactLogo } from '../../components/brand/PactLogo';
import { Modal } from '../../components/ui/Modal';
import { ApiError } from '../../api/client';
import { pendingReturnTo, readFlow, setReturnTo, writeFlow } from './auth/flow';
import { Screen } from './Screen';
import './welcome.css';

/** Accepts a full invite link, a path, or just the code. */
export const parseInviteCode = (raw: string) => {
  const m = raw.trim().match(/(?:join\/)?([A-Za-z0-9]{6,12})\/?$/);
  return m ? m[1].toUpperCase() : null;
};

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.76-2.11-6.7-4.94H1.3v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.3 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.3a12 12 0 0 0 0 10.78l4-3.1z" />
    <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.3 6.61l4 3.1C6.24 6.88 8.88 4.77 12 4.77z" />
  </svg>
);

/**
 * The front door: Google first, email second, and the phone sign-in kept for people who already use PACT that way.
 * Nothing here talks about wallets or money.
 */
export function WelcomeScreen() {
  const { config, startGoogle, requestEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [joinOpen, setJoinOpen] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string>();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [email, setEmail] = useState(() => readFlow().email ?? '');
  const [emailError, setEmailError] = useState<string>();
  const [emailBusy, setEmailBusy] = useState(false);
  const googleOn = config?.auth?.google ?? false;
  const [googleError, setGoogleError] = useState(params.get('error') === 'google');

  // Came here from a protected screen: go back there after signing in.
  useEffect(() => {
    setReturnTo((location.state as { from?: string } | null)?.from);
  }, [location.state]);

  const join = () => {
    const code = parseInviteCode(link);
    if (!code) return setError('That doesn’t look like a PACT invite. Paste the whole link.');
    setJoinOpen(false);
    navigate(`/app/join/${code}`);
  };

  /** Email first: the address is asked for right here, the code goes to it, and the next screen takes the code. */
  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setEmailError('Enter a valid email address.');
    setEmailBusy(true);
    setEmailError(undefined);
    try {
      const r = await requestEmail(value);
      writeFlow({ email: value, maskedEmail: r.email, via: 'email', needsProfile: false });
      navigate('/app/auth/email-code', { state: { devCode: r.devCode } });
    } catch (err) {
      setEmailError((err as ApiError).message);
    } finally {
      setEmailBusy(false);
    }
  };

  const google = async () => {
    setGoogleBusy(true);
    setGoogleError(false);
    try {
      const { url } = await startGoogle(pendingReturnTo() ?? undefined);
      window.location.assign(url);
    } catch {
      setGoogleError(true);
      setGoogleBusy(false);
    }
  };

  return (
    <Screen className="welcome welcome--signin">
      <div className="welcome__top">
        <PactLogo size="md" />
      </div>
      <div className="signin">
        <h1 className="signin__title">Make things happen with your people.</h1>
        {config?.deployEnv === 'staging' && (
          <span className="sandbox-tag">
            <FlaskConical aria-hidden /> Sandbox beta: no real money moves
          </span>
        )}
        {googleOn && (
          <div className="signin__actions">
            <Button fullWidth size="lg" loading={googleBusy} iconLeft={<GoogleMark />} onClick={google}>
              Continue with Google
            </Button>
            {googleError && (
              <p className="field__error signin__error" role="alert">
                We couldn’t sign you in with Google. Try again.
              </p>
            )}
            <div className="signin__or" role="separator" aria-label="or">
              <span>or</span>
            </div>
          </div>
        )}
        <form className="signin__form" onSubmit={sendCode} noValidate>
          <Input
            label="Email address"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(undefined);
            }}
            error={emailError}
          />
          <Button type="submit" fullWidth size="lg" loading={emailBusy} disabled={!email.trim()}>
            Continue
          </Button>
        </form>
        <p className="signin__phone">
          Already use PACT with your phone? <Link to="/app/auth/phone">Sign in with phone</Link>
        </p>
        <p className="signin__invite">
          <button type="button" className="link" onClick={() => setJoinOpen(true)}>
            Have an invite link?
          </button>
        </p>
        <p className="auth__fine">
          PACT is for people aged 18 and over. By continuing you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>

      <Modal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Join with invite"
        description="Paste the link someone shared with you."
        footer={
          <Button fullWidth onClick={join}>
            Continue
          </Button>
        }
      >
        <Input
          label="Invite link"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError(undefined);
          }}
          leading={<Link2 />}
          error={error}
          placeholder="pact.app/app/join/K7M2Q9XR"
          hint="Or just the invite code"
          autoComplete="off"
          spellCheck={false}
        />
      </Modal>
    </Screen>
  );
}

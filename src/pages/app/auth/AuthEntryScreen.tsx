import { FlaskConical } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { TopBar } from '../../../components/ui/TopBar';
import { Screen } from '../Screen';
import { pendingReturnTo, readFlow, writeFlow } from './flow';
import { GoogleMark } from './GoogleMark';
import { HandoffNote, useHandoffWords } from './HandoffNote';
import './auth.css';

/**
 * The way in, after the introduction: Google, then email, with phone kept for people who already use PACT that way.
 * `start` and `signin` are the same two doors with different words; either one creates an account on first use.
 */
export function AuthEntryScreen({ mode }: { mode: 'start' | 'signin' }) {
  const { config, startStytchGoogle, requestEmail } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(() => readFlow().email ?? '');
  const [emailError, setEmailError] = useState<string>();
  const [emailBusy, setEmailBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState(params.get('error') === 'google');
  const handoff = useHandoffWords();
  const googleOn = config?.auth?.stytchGoogle ?? false;
  // Not hiding Google quietly: in development, say why it is missing, in the console and never on the page.
  useEffect(() => {
    if (config && !googleOn && import.meta.env.DEV) console.info('PACT: Google sign-in is hidden because the API reports no Stytch Google. Set EMAIL_AUTH_PROVIDER=stytch with STYTCH_PROJECT_ID, STYTCH_SECRET and STYTCH_PUBLIC_TOKEN.');
  }, [config, googleOn]);

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
      const { url } = await startStytchGoogle(pendingReturnTo() ?? undefined);
      // Stays disabled while the browser leaves for Google.
      window.location.assign(url);
    } catch {
      setGoogleError(true);
      setGoogleBusy(false);
    }
  };

  return (
    <Screen topBar={<TopBar backTo="/app/auth/welcome" />} className="auth auth--entry">
      <div className="entry">
        <HandoffNote />
        <h1 className="entry__title">{handoff?.title ?? (mode === 'signin' ? 'Welcome back' : 'Let’s get you in')}</h1>
        <p className="entry__lede">{handoff?.line ?? (mode === 'signin' ? 'Sign in the way you did before.' : 'Pick whichever is quickest. No password to remember.')}</p>

        {googleOn && (
          <div className="entry__google">
            <Button variant="secondary" fullWidth size="lg" loading={googleBusy} disabled={googleBusy} iconLeft={<GoogleMark />} onClick={google}>
              Continue with Google
            </Button>
            {googleError && (
              <p className="field__error entry__error" role="alert">
                We couldn’t sign you in with Google. Try again, or use your email.
              </p>
            )}
          </div>
        )}

        {googleOn && (
          <div className="entry__or" role="separator" aria-label="or">
            <span>or</span>
          </div>
        )}

        <form className="entry__form" onSubmit={sendCode} noValidate>
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
            Continue with email
          </Button>
        </form>


        <p className="entry__phone">
          Already use PACT with your phone? <Link to="/app/auth/phone">Sign in with phone</Link>
        </p>

        <div className="entry__foot">
          {config?.deployEnv === 'staging' && (
            <p className="entry__sandbox">
              <FlaskConical aria-hidden /> Sandbox beta. No real money moves.
            </p>
          )}
          <p className="auth__fine">
            PACT is for people aged 18 and over. By continuing you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </Screen>
  );
}

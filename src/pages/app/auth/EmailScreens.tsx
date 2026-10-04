import { FlaskConical, Mail } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { Loading, Notice } from '../../../components/app/States';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { TopBar } from '../../../components/ui/TopBar';
import { Screen } from '../Screen';
import { clearFlow, readFlow, setReturnTo, safeAppPath, writeFlow } from './flow';
import './auth.css';

/* Email: enter the address ------------------------------------------------- */
export function EmailScreen() {
  const { requestEmail } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => readFlow().email ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setError('Enter a valid email address.');
    setBusy(true);
    setError(undefined);
    try {
      const r = await requestEmail(value);
      writeFlow({ email: value, maskedEmail: r.email, via: 'email', needsProfile: false });
      // A sandbox code is passed along in navigation state, never stored.
      navigate('/app/auth/email-code', { state: { devCode: r.devCode } });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      topBar={<TopBar backTo="/app/auth/welcome" />}
      footer={
        <Button type="submit" form="email-form" fullWidth loading={busy} disabled={!email.trim()}>
          Continue
        </Button>
      }
      className="auth"
    >
      <h1 className="large-title">What’s your email?</h1>
      <p className="screen-lede">We’ll send you a 6-digit code. No password to remember.</p>
      <form id="email-form" className="auth__form" onSubmit={submit} noValidate>
        <Input
          label="Email"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(undefined);
          }}
          error={error}
          autoFocus
        />
      </form>
    </Screen>
  );
}

/* Email: enter the code ------------------------------------------------------ */
export function EmailCodeScreen() {
  const { verifyEmail, requestEmail, config } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const flow = readFlow();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const [expired, setExpired] = useState(false);
  const [success, setSuccess] = useState(false);
  const [devCode, setDevCode] = useState((location.state as { devCode?: string } | null)?.devCode);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  if (!flow.email) return <Navigate to="/app/auth/email" replace />;

  const verify = async (value: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const out = await verifyEmail(flow.email!, value);
      setSuccess(true);
      if (out.status === 'signed_in') clearFlow();
      else {
        writeFlow({ needsProfile: true, via: 'email' });
        // A beat for the boxes to settle green, then the name step.
        window.setTimeout(() => navigate('/app/auth/profile'), 380);
      }
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'otp_expired') setExpired(true);
      setError(e.code === 'otp_expired' ? 'That code has expired. Send a new one.' : e.message);
      setCode('');
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const onChange = (v: string) => {
    const next = v.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    setError(undefined);
    if (next.length === 6) void verify(next);
  };

  const resend = async () => {
    try {
      const r = await requestEmail(flow.email!);
      setDevCode(r.devCode);
      setResendIn(30);
      setExpired(false);
      setError(undefined);
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  return (
    <Screen
      topBar={<TopBar backTo="/app/auth/welcome" />}
      footer={
        <Button fullWidth loading={busy} disabled={code.length !== 6 || success} onClick={() => void verify(code)}>
          Verify
        </Button>
      }
      className="auth"
    >
      <h1 className="large-title">Check your email</h1>
      <p className="screen-lede">
        We sent a code to <strong className="auth__email">{flow.email}</strong>. It expires in 10 minutes.
      </p>

      <label className="code-field" htmlFor="email-otp">
        <span className="visually-hidden">6-digit code</span>
        <input
          ref={input}
          id="email-otp"
          className="code-field__input"
          name="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="done"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          maxLength={6}
          disabled={busy || success}
          autoFocus
          aria-invalid={!!error || undefined}
          aria-describedby={error ? 'email-otp-error' : undefined}
        />
        <span className="code-field__boxes" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`code-field__box num ${i === code.length && !busy && !success ? 'is-active' : ''} ${error ? 'is-error' : ''} ${success ? 'is-success' : ''}`}>
              {code[i] ?? ''}
            </span>
          ))}
        </span>
      </label>
      {error && <p className="field__error auth__error" id="email-otp-error" role="alert">{error}</p>}

      {devCode && config?.exposeDevCodes && (
        <Notice tone="sun" icon={<FlaskConical />}>
          Sandbox: no email is sent. Your code is <strong className="num">{devCode}</strong>.{' '}
          <button type="button" className="link" onClick={() => onChange(devCode)}>
            Fill it in
          </button>
        </Notice>
      )}

      <div className="auth__resend">
        {resendIn > 0 && !expired ? (
          <p className="num">Resend code in 0:{String(resendIn).padStart(2, '0')}</p>
        ) : (
          <Button variant="ghost" size="sm" iconLeft={<Mail />} onClick={resend}>
            Send a new code
          </Button>
        )}
        <Button variant="ghost" size="sm" to="/app/auth/welcome">
          Change email
        </Button>
      </div>
    </Screen>
  );
}

/* Back from Google ---------------------------------------------------------- */
/** The server set the session cookie on the way back; collect it, then go where the person was headed. */
export function GoogleReturnScreen() {
  const { completeRedirectSignIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // The destination was chosen server-side before leaving; it is still checked as an in-app path before it is used.
    setReturnTo(safeAppPath(params.get('to')) ?? undefined);
    void completeRedirectSignIn().then((ok) => {
      // Signed in: the guest-only guard sends them on. Otherwise back to the start, with the usual Google message.
      if (!ok) navigate('/app/auth/welcome?error=google', { replace: true });
    });
  }, [completeRedirectSignIn, navigate, params]);

  return <Loading full />;
}

/* Back from Google through Stytch (/authenticate) -------------------------- */
/**
 * Stytch sends the browser here with a one-time token in the address. It is read once, removed from the address bar, and handed to the
 * server, which is the only thing that decides whether it proves anything. The destination comes back from the server, not from the URL.
 */
export function AuthenticateScreen() {
  const { finishStytchGoogle } = useAuth();
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const type = params.get('stytch_token_type');
    window.history.replaceState(null, '', '/authenticate');
    const fail = () => navigate('/app/auth/welcome?error=google', { replace: true });
    if (!token || (type && type !== 'oauth')) {
      fail();
      return;
    }
    finishStytchGoogle(token)
      .then((r) => {
        setReturnTo(safeAppPath(r.returnTo) ?? undefined);
        if (r.status === 'needs_profile') {
          writeFlow({ needsProfile: true, via: 'google' });
          navigate('/app/auth/profile?via=google', { replace: true });
        } else {
          // The session is set; go straight to where the person was headed, not to Home.
          navigate(safeAppPath(r.returnTo) ?? '/app/home', { replace: true });
        }
      })
      .catch(fail);
  }, [finishStytchGoogle, navigate]);

  return <Loading full />;
}

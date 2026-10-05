import { FlaskConical, Phone, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../api/auth';
import { api, ApiError } from '../../../api/client';
import { Notice } from '../../../components/app/States';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { TopBar } from '../../../components/ui/TopBar';
import { deviceMemory } from '../../../lib/drafts';
import { OTPInput } from '../../../components/objects';
import { Screen } from '../Screen';
import { clearFlow, readFlow, safeAppPath, setReturnTo, writeFlow } from './flow';
import './auth.css';

const toLocal = (raw: string) => raw.replace(/\D/g, '').replace(/^234/, '').replace(/^0/, '').slice(0, 10);
const pretty = (digits: string) => [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join(' ');

/* 1. Phone number ---------------------------------------------------------- */
export function PhoneScreen() {
  const { requestOtp } = useAuth();
  const navigate = useNavigate();
  // Returning on this device: offer the number used last time (cleared when someone signs out on purpose).
  const remembered = useState(() => toLocal(deviceMemory.get('lastPhone') ?? ''))[0];
  const [digits, setDigits] = useState(() => toLocal(readFlow().phone ?? '') || remembered);
  const [usedRemembered, setUsedRemembered] = useState(() => !readFlow().phone && !!remembered);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const valid = /^[789][01]\d{8}$/.test(digits);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return setError('Enter your 11-digit mobile number, like 0803 123 4567.');
    setBusy(true);
    setError(undefined);
    try {
      const r = await requestOtp(`0${digits}`);
      deviceMemory.set('lastPhone', digits);
      writeFlow({ phone: r.phone, displayPhone: `0${pretty(digits)}`, needsProfile: false });
      // A sandbox code is passed along in navigation state, never stored: a refresh simply asks to resend.
      navigate('/app/auth/code', { state: { devCode: r.devCode } });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      topBar={<TopBar backTo="/app/auth/start" />}
      footer={
        <>
          <Button type="submit" form="phone-form" fullWidth loading={busy} disabled={!digits}>
            Send code
          </Button>
          <p className="auth__fine">
            PACT is for people aged 18 and over. By continuing you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </>
      }
      className="auth"
    >
      <h1 className="large-title">What’s your number?</h1>
      <p className="screen-lede">We’ll text you a code. It’s how you sign in and how friends find you.</p>
      <form id="phone-form" className="auth__form" onSubmit={submit} noValidate>
        <div className={`phone-field ${error ? 'has-error' : ''}`}>
          <label className="field__label" htmlFor="phone">
            Mobile number
          </label>
          <div className="phone-field__control">
            <span className="phone-field__cc">
              <span aria-hidden>🇳🇬</span> +234
            </span>
            <input
              id="phone"
              className="phone-field__input num"
              type="tel"
              name="phone"
              inputMode="tel"
              autoComplete="tel-national"
              enterKeyHint="send"
              placeholder="803 123 4567"
              value={pretty(digits)}
              onChange={(e) => {
                setUsedRemembered(false);
                setDigits(toLocal(e.target.value));
                setError(undefined);
              }}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? 'phone-error' : undefined}
              autoFocus
            />
          </div>
          {usedRemembered && !error && (
            <p className="field__hint">
              Filled in from last time.{' '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setDigits('');
                  setUsedRemembered(false);
                  deviceMemory.clear('lastPhone');
                }}
              >
                Use a different number
              </button>
            </p>
          )}
          {error && (
            <p className="field__error" id="phone-error">
              {error}
            </p>
          )}
        </div>
      </form>
      <div className="auth__trust">
        <ShieldCheck aria-hidden />
        <p>Your number is never shown to people outside your Pacts.</p>
      </div>
    </Screen>
  );
}

/* 2. SMS code ---------------------------------------------------------------- */
export function CodeScreen() {
  const { verifyOtp, requestOtp, config } = useAuth();
  const navigate = useNavigate();
  const flow = readFlow();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const location = useLocation();
  const [devCode, setDevCode] = useState((location.state as { devCode?: string } | null)?.devCode);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  // Android Chrome can read the code straight out of the SMS (needs "@host #code" in the message).
  useEffect(() => {
    if (!('OTPCredential' in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal } as CredentialRequestOptions)
      .then((c) => {
        const v = ((c as unknown as { code?: string } | null)?.code ?? '').replace(/\D/g, '').slice(0, 6);
        if (v.length === 6) onChangeRef.current(v);
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, []);
  const onChangeRef = useRef<(v: string) => void>(() => undefined);

  if (!flow.phone) return <Navigate to="/app/auth/phone" replace />;

  const verify = async (value: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const out = await verifyOtp(flow.phone!, value);
      if (out.status === 'signed_in') {
        // The guest-only route guard sends them on to wherever they were headed.
        clearFlow();
      } else {
        writeFlow({ needsProfile: true });
        navigate('/app/auth/profile');
      }
    } catch (err) {
      setError((err as ApiError).message);
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

  onChangeRef.current = onChange;

  const resend = async () => {
    try {
      const r = await requestOtp(flow.phone!);
      setDevCode(r.devCode);
      setResendIn(30);
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  return (
    <Screen topBar={<TopBar backTo="/app/auth/phone" />} className="auth">
      <h1 className="large-title">Enter the code</h1>
      <p className="screen-lede">
        Sent to <strong className="num">{flow.displayPhone}</strong>. It expires in 5 minutes.
      </p>

      <OTPInput ref={input} id="otp" value={code} onChange={onChange} busy={busy} error={!!error} />
      {error && <p className="field__error auth__error">{error}</p>}

      {devCode && config?.exposeDevCodes && (
        <Notice tone="sun" icon={<FlaskConical />}>
          Sandbox: no SMS is sent. Your code is <strong className="num">{devCode}</strong>.{' '}
          <button type="button" className="link" onClick={() => onChange(devCode)}>
            Fill it in
          </button>
        </Notice>
      )}

      <div className="auth__resend">
        {resendIn > 0 ? (
          <p className="num">Resend code in 0:{String(resendIn).padStart(2, '0')}</p>
        ) : (
          <Button variant="ghost" size="sm" iconLeft={<Phone />} onClick={resend}>
            Resend code
          </Button>
        )}
      </div>
    </Screen>
  );
}

/* 3. Name (new accounts, whichever way they signed in) ------------------------ */
export function ProfileSetupScreen() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const flow = readFlow();
  const fromGoogle = params.get('via') === 'google';
  const [first, setFirst] = useState(flow.firstName ?? '');
  const [last, setLast] = useState(flow.lastName ?? '');
  const [referral, setReferral] = useState(flow.referralCode ?? '');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const proceed = !!flow.needsProfile || fromGoogle;

  // Back from Google: the name step is next, and the destination chosen before leaving still applies.
  useEffect(() => {
    if (!fromGoogle) return;
    writeFlow({ needsProfile: true, via: 'google' });
    setReturnTo(safeAppPath(params.get('to')) ?? undefined);
  }, [fromGoogle, params]);

  // A name Google (or nothing) can suggest. The credential itself stays in an httpOnly cookie the page cannot read.
  useEffect(() => {
    if (!proceed || flow.firstName) return;
    void api<{ suggested?: { firstName: string; lastName: string } }>('POST', '/auth/signup/pending', {})
      .then((r) => {
        setFirst((v) => v || r.suggested?.firstName || '');
        setLast((v) => v || r.suggested?.lastName || '');
      })
      .catch((err: ApiError) => {
        if (err.code === 'signup_expired') {
          clearFlow();
          navigate('/app/auth/welcome', { replace: true });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proceed]);

  if (!proceed) return <Navigate to="/app/auth/welcome" replace />;

  const errors = {
    first: first.trim() ? undefined : 'Enter your first name.',
    last: last.trim() ? undefined : 'Enter your last name.',
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errors.first || errors.last) return;
    setBusy(true);
    setError(undefined);
    try {
      await signup({ firstName: first.trim(), lastName: last.trim(), referralCode: referral.trim() || undefined });
      // The guest-only route guard sends them on to wherever they were headed.
      clearFlow();
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.code === 'signup_expired' || e2.code === 'already_registered') {
        clearFlow();
        navigate('/app/auth/welcome', { replace: true });
        return;
      }
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      topBar={<TopBar backTo="/app/auth/start" />}
      footer={
        <Button type="submit" form="profile-form" fullWidth loading={busy}>
          Continue
        </Button>
      }
      className="auth"
    >
      <h1 className="large-title">Nice to meet you</h1>
      <p className="screen-lede">What should your people call you?</p>
      <form id="profile-form" className="auth__form" onSubmit={submit} noValidate>
        <Input label="First name" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" maxLength={40} error={touched ? errors.first : undefined} autoFocus />
        <Input label="Last name" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" maxLength={40} error={touched ? errors.last : undefined} />
        <Input label="Invite code (optional)" value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} autoComplete="off" maxLength={12} hint="If a friend gave you one." />
        {error && <p className="field__error" role="alert">{error}</p>}
      </form>
    </Screen>
  );
}

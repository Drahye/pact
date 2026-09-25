import { FlaskConical, Phone, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { PinPad } from '../../../components/app/PinPad';
import { Notice } from '../../../components/app/States';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { TopBar } from '../../../components/ui/TopBar';
import { Screen } from '../Screen';
import { clearFlow, readFlow, takeReturnTo, writeFlow } from './flow';
import './auth.css';

const toLocal = (raw: string) => raw.replace(/\D/g, '').replace(/^234/, '').replace(/^0/, '').slice(0, 10);
const pretty = (digits: string) => [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join(' ');

/* 1. Phone number ---------------------------------------------------------- */
export function PhoneScreen() {
  const { requestOtp } = useAuth();
  const navigate = useNavigate();
  const [digits, setDigits] = useState(() => toLocal(readFlow().phone ?? ''));
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
      writeFlow({ phone: r.phone, displayPhone: `0${pretty(digits)}`, devCode: r.devCode, isNewUser: r.isNewUser, signupToken: undefined });
      navigate('/app/auth/code');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      topBar={<TopBar backTo="/app" />}
      footer={
        <>
          <Button type="submit" form="phone-form" fullWidth loading={busy} disabled={!digits}>
            Send code
          </Button>
          <p className="auth__fine">
            By continuing you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
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
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="803 123 4567"
              value={pretty(digits)}
              onChange={(e) => {
                setDigits(toLocal(e.target.value));
                setError(undefined);
              }}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? 'phone-error' : undefined}
              autoFocus
            />
          </div>
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
  const [devCode, setDevCode] = useState(flow.devCode);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  if (!flow.phone) return <Navigate to="/app/auth/phone" replace />;

  const verify = async (value: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const out = await verifyOtp(flow.phone!, value);
      if (out.status === 'signed_in') {
        clearFlow();
        navigate(takeReturnTo(), { replace: true });
      } else {
        writeFlow({ signupToken: out.signupToken });
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

  const resend = async () => {
    try {
      const r = await requestOtp(flow.phone!);
      writeFlow({ devCode: r.devCode });
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

      <label className="code-field" htmlFor="otp">
        <span className="visually-hidden">6-digit code</span>
        <input
          ref={input}
          id="otp"
          className="code-field__input"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          maxLength={6}
          disabled={busy}
          autoFocus
          aria-invalid={!!error || undefined}
        />
        <span className="code-field__boxes" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`code-field__box num ${i === code.length && !busy ? 'is-active' : ''} ${error ? 'is-error' : ''}`}>
              {code[i] ?? ''}
            </span>
          ))}
        </span>
      </label>
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

/* 3. Name (new accounts) ----------------------------------------------------- */
export function ProfileSetupScreen() {
  const navigate = useNavigate();
  const flow = readFlow();
  const [first, setFirst] = useState(flow.firstName ?? '');
  const [last, setLast] = useState(flow.lastName ?? '');
  const [referral, setReferral] = useState(flow.referralCode ?? '');
  const [touched, setTouched] = useState(false);
  if (!flow.signupToken) return <Navigate to="/app/auth/phone" replace />;

  const errors = {
    first: first.trim() ? undefined : 'Enter your first name.',
    last: last.trim() ? undefined : 'Enter your last name.',
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errors.first || errors.last) return;
    writeFlow({ firstName: first.trim(), lastName: last.trim(), referralCode: referral.trim() || undefined });
    navigate('/app/auth/pin');
  };

  return (
    <Screen
      topBar={<TopBar backTo="/app/auth/phone" />}
      footer={
        <Button type="submit" form="profile-form" fullWidth>
          Continue
        </Button>
      }
      className="auth"
    >
      <h1 className="large-title">Nice to meet you</h1>
      <p className="screen-lede">Use the name on your bank account so withdrawals go through.</p>
      <form id="profile-form" className="auth__form" onSubmit={submit} noValidate>
        <Input label="First name" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" maxLength={40} error={touched ? errors.first : undefined} autoFocus />
        <Input label="Last name" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" maxLength={40} error={touched ? errors.last : undefined} />
        <Input label="Invite code (optional)" value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} autoComplete="off" maxLength={12} hint="If a friend gave you one." />
      </form>
    </Screen>
  );
}

/* 4. Transaction PIN --------------------------------------------------------- */
const WEAK = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '9876']);

export function PinSetupScreen() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const flow = readFlow();
  const [first, setFirst] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  if (!flow.signupToken || !flow.firstName) return <Navigate to="/app/auth/phone" replace />;

  const onComplete = async (pin: string) => {
    if (!first) {
      if (WEAK.has(pin)) return 'That PIN is easy to guess. Try another.';
      setFirst(pin);
      setError(null);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      return 'Those didn’t match. Start again.';
    }
    setBusy(true);
    try {
      await signup({ signupToken: flow.signupToken!, firstName: flow.firstName!, lastName: flow.lastName!, pin, referralCode: flow.referralCode });
      clearFlow();
      navigate(takeReturnTo(), { replace: true });
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'signup_expired') {
        clearFlow();
        navigate('/app/auth/phone', { replace: true });
        return;
      }
      setFirst(null);
      setError(e.message);
      setErrorKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topBar={<TopBar backTo="/app/auth/profile" />} className="auth auth--pin">
      <h1 className="large-title">{first ? 'Confirm your PIN' : 'Create a PIN'}</h1>
      <p className="screen-lede">
        {first ? 'Enter the same four digits again.' : 'You’ll use these four digits to approve every payment. Don’t share them with anyone.'}
      </p>
      <div className="auth__pin">
        <PinPad onComplete={onComplete} busy={busy} error={error} errorKey={errorKey} resetKey={first ? 'confirm' : 'create'} label="New PIN" />
      </div>
    </Screen>
  );
}

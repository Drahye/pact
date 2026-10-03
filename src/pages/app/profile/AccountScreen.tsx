import { BadgeCheck, ChevronRight, Mail, Phone, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccount, useAccountActions } from '../../../api/account';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { PinSheet } from '../../../components/app/PinSheet';
import { Notice } from '../../../components/app/States';
import { RowListSkeleton } from '../../../components/app/Skeleton';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { formatPhone } from '../../../lib/format';
import { Screen } from '../Screen';
import '../../../components/app/app-ui.css';
import '../profile.css';

type Sheet = null | 'email' | 'phone' | { disconnect: 'google' | 'email' | 'phone' };

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.76-2.11-6.7-4.94H1.3v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.3 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.3a12 12 0 0 0 0 10.78l4-3.1z" />
    <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.3 6.61l4 3.1C6.24 6.88 8.88 4.77 12 4.77z" />
  </svg>
);

const toLocal = (raw: string) => raw.replace(/\D/g, '').replace(/^234/, '').replace(/^0/, '').slice(0, 10);

/** How you sign in, and the phone that makes the account more trusted. Connect, verify or disconnect each; the last way in stays. */
export function AccountScreen() {
  const account = useAccount();
  const { user, config } = useAuth();
  const actions = useAccountActions();
  const toast = useToast();
  const [params] = useSearchParams();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState<string>();
  const close = () => setSheet(null);
  const a = account.data;

  // Back from Google after connecting it.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    if (params.get('linked') === 'google') {
      toast('Google connected');
      void account.refetch();
    }
    if (params.get('google') === 'conflict') setNotice('This sign-in method is already connected to another PACT account. Sign in with it there, or use a different Google account.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const googleOn = config?.auth?.google ?? false;
  const connectGoogle = async () => {
    try {
      const { url } = await actions.startGoogle.mutateAsync(undefined);
      window.location.assign(url);
    } catch (e) {
      toast((e as ApiError).message, 'neutral');
    }
  };

  const disconnect = async (provider: 'google' | 'email' | 'phone', pin?: string) => {
    await actions.unlink.mutateAsync({ provider, pin });
    toast('Disconnected');
    close();
  };

  return (
    <Screen topBar={<TopBar backTo="/app/profile" title="Account and sign-in" />}>
      {account.isLoading || !a ? (
        <RowListSkeleton count={3} label="Loading your account" />
      ) : (
        <>
          {notice && <Notice tone="sun">{notice}</Notice>}
          <p className="menu-label">Sign in</p>
          <div className="menu">
            <button type="button" className="menu__row" onClick={() => setSheet('email')}>
              <span className="menu__icon tint--sky"><Mail /></span>
              <span className="menu__text">
                <span className="menu__title">Email</span>
                <span className="menu__sub">{a.email ? <>{a.email.address} · <span className="acct__ok"><BadgeCheck aria-hidden /> Verified</span></> : 'Not added'}</span>
              </span>
              <span className="menu__end">{a.email ? 'Change' : 'Add email'}</span>
            </button>
            {googleOn || a.google.connected ? (
              <div className="menu__row acct__row">
                <span className="menu__icon tint--mint"><GoogleMark /></span>
                <span className="menu__text">
                  <span className="menu__title">Google</span>
                  <span className="menu__sub">{a.google.connected ? (a.google.email ? <>Connected<br />{a.google.email}</> : 'Connected') : 'Not connected'}</span>
                </span>
                {a.google.connected ? (
                  <Button variant="ghost" size="sm" onClick={() => setSheet({ disconnect: 'google' })} disabled={a.signInMethods <= 1}>
                    Disconnect
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" loading={actions.startGoogle.isPending} onClick={connectGoogle}>
                    Connect
                  </Button>
                )}
              </div>
            ) : null}
          </div>

          <p className="menu-label">Trust</p>
          <div className="menu">
            <button type="button" className="menu__row" onClick={() => (a.phone ? setSheet({ disconnect: 'phone' }) : setSheet('phone'))} disabled={!!a.phone && a.signInMethods <= 1}>
              <span className={`menu__icon ${a.phone ? 'tint--mint' : 'tint--sun'}`}>{a.phone ? <ShieldCheck /> : <Phone />}</span>
              <span className="menu__text">
                <span className="menu__title">Phone</span>
                <span className="menu__sub">
                  {a.phone ? (
                    <>
                      <span className="num">{formatPhone(a.phone.number)}</span> · <span className="acct__ok"><BadgeCheck aria-hidden /> Verified</span>
                    </>
                  ) : (
                    'Not verified. Needed to withdraw, add a bank account or verify your identity.'
                  )}
                </span>
              </span>
              <span className="menu__end">{a.phone ? <ChevronRight /> : 'Verify phone'}</span>
            </button>
          </div>
          <p className="acct__fine">Everyday things like Circles, questions, plans and splits never need a verified phone.</p>
        </>
      )}

      {a && sheet === 'email' && <EmailSheet open onClose={close} replacing={!!a.email} hasPin={a.hasPin} />}
      <PhoneSheet open={sheet === 'phone'} onClose={close} />
      {a && typeof sheet === 'object' && sheet && (
        <DisconnectSheet
          provider={sheet.disconnect}
          hasPin={!!user?.hasPin}
          busy={actions.unlink.isPending}
          onClose={close}
          onConfirm={(pin) => disconnect(sheet.disconnect, pin)}
        />
      )}
    </Screen>
  );
}

function EmailSheet({ open, onClose, replacing, hasPin }: { open: boolean; onClose: () => void; replacing: boolean; hasPin: boolean }) {
  const actions = useAccountActions();
  const { config } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [masked, setMasked] = useState('');
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [pinOpen, setPinOpen] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    try {
      const r = await actions.requestEmail.mutateAsync(email.trim());
      setMasked(r.email);
      setDevCode(r.devCode);
      setStep('code');
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  const verify = async (pin?: string) => {
    setError(undefined);
    try {
      await actions.verifyEmail.mutateAsync({ email: email.trim(), code, ...(pin ? { pin } : {}) });
      toast(replacing ? 'Email changed' : 'Email added');
      onClose();
    } catch (err) {
      const e = err as ApiError;
      setError(e.code === 'identity_taken' ? 'This sign-in method is already connected to another PACT account.' : e.message);
      if (pin) throw err;
    }
  };

  return (
    <>
      <Modal
        open={open && !pinOpen}
        onClose={onClose}
        title={replacing ? 'Change your email' : 'Add an email'}
        description={step === 'email' ? 'We’ll send a code to confirm it’s yours.' : `Enter the 6-digit code sent to ${masked}.`}
        footer={
          step === 'email' ? (
            <Button type="submit" form="acct-email" fullWidth loading={actions.requestEmail.isPending} disabled={!email.trim()}>
              Send code
            </Button>
          ) : (
            <Button fullWidth loading={actions.verifyEmail.isPending} disabled={code.length !== 6} onClick={() => (replacing && hasPin ? setPinOpen(true) : void verify())}>
              {replacing && hasPin ? 'Continue' : 'Confirm'}
            </Button>
          )
        }
      >
        {step === 'email' ? (
          <form id="acct-email" onSubmit={send} noValidate>
            <Input label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => (setEmail(e.target.value), setError(undefined))} error={error} autoFocus />
          </form>
        ) : (
          <>
            <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => (setCode(e.target.value.replace(/\D/g, '').slice(0, 6)), setError(undefined))} error={error} autoFocus />
            {devCode && config?.exposeDevCodes && (
              <p className="acct__fine">
                Sandbox code: <strong className="num">{devCode}</strong>
              </p>
            )}
          </>
        )}
      </Modal>
      <PinSheet
        open={open && pinOpen}
        onClose={() => setPinOpen(false)}
        title="Enter your PIN"
        description="To change your email."
        onSubmit={async (pin) => {
          await verify(pin);
          setPinOpen(false);
        }}
      />
    </>
  );
}

function PhoneSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actions = useAccountActions();
  const { config } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState<string>();
  const valid = /^[789][01]\d{8}$/.test(digits);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return setError('Enter your 11-digit mobile number, like 0803 123 4567.');
    setError(undefined);
    try {
      const r = await actions.requestPhone.mutateAsync(`0${digits}`);
      setDevCode(r.devCode);
      setStep('code');
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  const verify = async () => {
    setError(undefined);
    try {
      const r = await actions.verifyPhone.mutateAsync({ phone: `0${digits}`, code });
      toast(r.claimedInvites > 0 ? `Phone verified. You have ${r.claimedInvites === 1 ? 'an invitation' : `${r.claimedInvites} invitations`} waiting.` : 'Phone verified');
      setStep('phone');
      setCode('');
      onClose();
    } catch (err) {
      const e = err as ApiError;
      setError(e.code === 'identity_taken' ? 'This number is already connected to another PACT account.' : e.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Verify your phone"
      description={step === 'phone' ? 'We’ll text you a code. It keeps your money safe and helps you recover your account.' : 'Enter the 6-digit code we texted you.'}
      footer={
        step === 'phone' ? (
          <Button type="submit" form="acct-phone" fullWidth loading={actions.requestPhone.isPending} disabled={!digits}>
            Send code
          </Button>
        ) : (
          <Button fullWidth loading={actions.verifyPhone.isPending} disabled={code.length !== 6} onClick={verify}>
            Verify
          </Button>
        )
      }
    >
      {step === 'phone' ? (
        <form id="acct-phone" onSubmit={send} noValidate>
          <Input label="Mobile number" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="0803 123 4567" value={digits} onChange={(e) => (setDigits(toLocal(e.target.value)), setError(undefined))} error={error} autoFocus />
        </form>
      ) : (
        <>
          <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => (setCode(e.target.value.replace(/\D/g, '').slice(0, 6)), setError(undefined))} error={error} autoFocus />
          {devCode && config?.exposeDevCodes && (
            <p className="acct__fine">
              Sandbox code: <strong className="num">{devCode}</strong>
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

function DisconnectSheet({ provider, hasPin, busy, onClose, onConfirm }: { provider: 'google' | 'email' | 'phone'; hasPin: boolean; busy: boolean; onClose: () => void; onConfirm: (pin?: string) => Promise<void> }) {
  const label = { google: 'Google', email: 'email', phone: 'phone' }[provider];
  const [error, setError] = useState<string>();
  const run = async (pin?: string) => {
    try {
      await onConfirm(pin);
    } catch (err) {
      const e = err as ApiError;
      setError(e.code === 'last_sign_in_method' ? 'This is your only way to sign in. Add another first.' : e.message);
      if (hasPin) throw err;
    }
  };
  // With a PIN, the PIN confirms it; without one, a plain confirmation does (nothing is created just to disconnect).
  if (hasPin) return <PinSheet open onClose={onClose} title={`Disconnect ${label}?`} description="Enter your PIN to confirm." onSubmit={run} />;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Disconnect ${label}?`}
      description={provider === 'phone' ? 'You won’t be able to withdraw or use your phone to recover your account until you verify one again.' : `You won’t be able to sign in with ${label} any more.`}
      footer={
        <Button fullWidth loading={busy} onClick={() => run()}>
          Disconnect
        </Button>
      }
    >
      {error && <p className="field__error" role="alert">{error}</p>}
    </Modal>
  );
}

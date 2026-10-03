import { KeyRound, LifeBuoy, LogOut, Monitor, Smartphone } from 'lucide-react';
import { ResetPinSheet } from './ResetPinSheet';
import { useState } from 'react';
import { ApiError } from '../../../api/client';
import { useAuth } from '../../../api/auth';
import { useProfileActions, useSessions } from '../../../api/hooks';
import { PinPad } from '../../../components/app/PinPad';
import { PinSheet } from '../../../components/app/PinSheet';
import { RowListSkeleton } from '../../../components/app/Skeleton';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { formatRelative } from '../../../lib/format';
import { Screen } from '../Screen';
import '../../../components/app/app-ui.css';
import '../profile.css';

type Step = 'current' | 'new' | 'confirm';

export function SecurityScreen() {
  const sessions = useSessions();
  const { changePin, revokeSession, revokeOthers } = useProfileActions();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('current');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const { user } = useAuth();

  const close = () => {
    setOpen(false);
    setStep('current');
    setError(null);
  };

  const onPin = async (pin: string) => {
    setError(null);
    if (step === 'current') {
      setCurrent(pin);
      setStep('new');
      return;
    }
    if (step === 'new') {
      setNext(pin);
      setStep('confirm');
      return;
    }
    if (pin !== next) {
      setStep('new');
      return 'Those didn’t match. Enter the new PIN again.';
    }
    try {
      await changePin.mutateAsync({ currentPin: current, newPin: next });
      toast('PIN changed');
      close();
    } catch (err) {
      const e = err as ApiError;
      setStep(e.code === 'incorrect_pin' || e.code === 'pin_locked' ? 'current' : 'new');
      setError(e.message);
      setErrorKey((k) => k + 1);
    }
  };

  const others = sessions.data?.filter((s) => !s.current) ?? [];

  return (
    <Screen topBar={<TopBar backTo="/app/profile" title="PIN and devices" />}>
      <p className="menu-label">Transaction PIN</p>
      <div className="menu">
        {user && !user.hasPin ? (
          <button type="button" className="menu__row" onClick={() => setSetupOpen(true)}>
            <span className="menu__icon tint--mint"><KeyRound /></span>
            <span className="menu__text">
              <span className="menu__title">Set up your PIN</span>
              <span className="menu__sub">Asked for when you move money or change something sensitive</span>
            </span>
          </button>
        ) : (
          <>
            <button type="button" className="menu__row" onClick={() => setOpen(true)}>
              <span className="menu__icon tint--mint"><KeyRound /></span>
              <span className="menu__text">
                <span className="menu__title">Change PIN</span>
                <span className="menu__sub">Used to approve payments and sensitive changes</span>
              </span>
            </button>
            <button type="button" className="menu__row" onClick={() => setResetOpen(true)}>
              <span className="menu__icon tint--sun"><LifeBuoy /></span>
              <span className="menu__text">
                <span className="menu__title">Forgot your PIN?</span>
                <span className="menu__sub">Reset it with a code sent to your verified phone or email</span>
              </span>
            </button>
          </>
        )}
      </div>
      <PinSheet open={setupOpen} onClose={() => setSetupOpen(false)} onSubmit={async () => (setSetupOpen(false), toast('PIN set'))} />
      <ResetPinSheet open={resetOpen} onClose={() => setResetOpen(false)} />

      <p className="menu-label">Signed in on</p>
      {sessions.isLoading ? (
        <RowListSkeleton count={3} trailing={false} label="Loading devices" />
      ) : (
        <div className="menu sessions">
          {sessions.data?.map((s) => (
            <div key={s.id} className="menu__row">
              <span className="menu__icon tint--sky">{/iPhone|Android/.test(s.device) ? <Smartphone /> : <Monitor />}</span>
              <span className="menu__text">
                <span className="menu__title">{s.device}</span>
                <span className="menu__sub">{s.current ? 'This device' : `Active ${formatRelative(s.lastUsedAt)}`}</span>
              </span>
              {!s.current && (
                <Button size="sm" variant="secondary" onClick={() => revokeSession.mutate(s.id)}>
                  Sign out
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Button variant="secondary" fullWidth iconLeft={<LogOut />} onClick={() => revokeOthers.mutate(undefined, { onSuccess: () => toast('Signed out of other devices') })}>
            Sign out of all other devices
          </Button>
        </div>
      )}

      <Modal
        open={open}
        onClose={close}
        title={step === 'current' ? 'Enter your current PIN' : step === 'new' ? 'Choose a new PIN' : 'Confirm your new PIN'}
      >
        <PinPad onComplete={onPin} busy={changePin.isPending} error={error} errorKey={errorKey} resetKey={step} />
      </Modal>
    </Screen>
  );
}

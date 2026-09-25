import { FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { useProfileActions } from '../../../api/hooks';
import { PinPad } from '../../../components/app/PinPad';
import { Notice } from '../../../components/app/States';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { formatPhone } from '../../../lib/format';

type Step = 'intro' | 'code' | 'new' | 'confirm';

/** Forgotten PIN: proven with a fresh SMS code to your own number, then a 24-hour withdrawal hold. */
export function ResetPinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, config } = useAuth();
  const { requestPinReset, resetPin } = useProfileActions();
  const toast = useToast();
  const [step, setStep] = useState<Step>('intro');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string>();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  useEffect(() => {
    if (open) {
      setStep('intro');
      setCode('');
      setPin('');
      setError(null);
    }
  }, [open]);

  const send = async () => {
    setError(null);
    try {
      const r = await requestPinReset.mutateAsync();
      setDevCode(r.devCode);
      setStep('code');
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  const onPin = async (value: string) => {
    if (step === 'new') {
      setPin(value);
      setStep('confirm');
      return;
    }
    if (value !== pin) {
      setStep('new');
      return 'Those didn’t match. Choose your new PIN again.';
    }
    try {
      await resetPin.mutateAsync({ code, newPin: value });
      toast('PIN reset');
      onClose();
    } catch (err) {
      const e = err as ApiError;
      setError(e.message);
      setErrorKey((k) => k + 1);
      setStep(e.code.startsWith('otp') ? 'code' : 'new');
    }
  };

  const titles: Record<Step, string> = { intro: 'Reset your PIN', code: 'Enter the code', new: 'Choose a new PIN', confirm: 'Confirm your new PIN' };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titles[step]}
      description={step === 'intro' ? 'We’ll text a code to your number to make sure it’s you.' : step === 'code' ? `Sent to ${user ? formatPhone(user.phone) : 'your phone'}.` : undefined}
      footer={
        step === 'intro' ? (
          <Button fullWidth onClick={send} loading={requestPinReset.isPending}>
            Text me a code
          </Button>
        ) : step === 'code' ? (
          <Button fullWidth disabled={code.length !== 6} onClick={() => setStep('new')}>
            Continue
          </Button>
        ) : undefined
      }
    >
      {step === 'intro' && (
        <div className="sheet-form">
          <Notice>For your safety, withdrawals and bank changes pause for 24 hours after a reset, and your other devices are signed out.</Notice>
          {error && <p className="field__error">{error}</p>}
        </div>
      )}
      {step === 'code' && (
        <div className="sheet-form">
          <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="num" />
          {devCode && config?.exposeDevCodes && (
            <Notice tone="sun" icon={<FlaskConical />}>
              Sandbox: your code is <strong className="num">{devCode}</strong>.{' '}
              <button type="button" className="link" onClick={() => setCode(devCode)}>
                Fill it in
              </button>
            </Notice>
          )}
          {error && <p className="field__error">{error}</p>}
        </div>
      )}
      {(step === 'new' || step === 'confirm') && <PinPad onComplete={onPin} busy={resetPin.isPending} error={error} errorKey={errorKey} resetKey={step} label="New PIN" />}
    </Modal>
  );
}

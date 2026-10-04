import { useState, type ReactNode } from 'react';
import { useAuth } from '../../api/auth';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { PinPad } from './PinPad';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: ReactNode;
  /** Runs the protected action with the PIN. Throw an ApiError to show it on the pad. */
  onSubmit: (pin: string) => Promise<void>;
}

const WEAK = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '9876']);

/**
 * Every movement of money out of a wallet, and every other sensitive change, asks for the PIN in this sheet.
 * Someone who has never made a PIN (accounts start without one) is asked to create it right here, then the original action runs.
 */
export function PinSheet({ open, onClose, title = 'Enter your PIN', description, onSubmit }: Props) {
  const { user, setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [first, setFirst] = useState<string | null>(null);
  const needsSetup = !!user && !user.hasPin;

  const fail = (err: unknown) => {
    const e = err as ApiError;
    const left = typeof e.details?.attemptsLeft === 'number' ? ` ${e.details.attemptsLeft} ${e.details.attemptsLeft === 1 ? 'try' : 'tries'} left.` : '';
    setError(`${e.message ?? 'Something went wrong.'}${left}`);
    setAttempt((a) => a + 1);
  };

  const submit = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(pin);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  /** Create, confirm, save, then carry on with what the person was doing. */
  const setup = async (pin: string) => {
    if (!first) {
      if (WEAK.has(pin)) {
        setError('That PIN is easy to guess. Try another.');
        setAttempt((a) => a + 1);
        return;
      }
      setFirst(pin);
      setError(null);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setError('Those didn’t match. Start again.');
      setAttempt((a) => a + 1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/me/pin/setup', { pin });
      if (user) setUser({ ...user, hasPin: true });
      setFirst(null);
      await onSubmit(pin);
    } catch (err) {
      setFirst(null);
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    setError(null);
    setFirst(null);
    onClose();
  };

  if (needsSetup) {
    return (
      <Modal
        open={open}
        onClose={close}
        title={first ? 'Confirm your PIN' : 'Set up your security PIN'}
        description={first ? 'Enter the same four digits again.' : 'You’ll use these four digits to approve payments and other sensitive changes. Don’t share them with anyone.'}
      >
        <PinPad onComplete={setup} busy={busy} error={error} errorKey={attempt} resetKey={first ? 'confirm' : 'create'} label="New PIN" />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} title={title} description={description}>
      <PinPad onComplete={submit} busy={busy} error={error} errorKey={attempt} />
    </Modal>
  );
}

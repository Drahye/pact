import { useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
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

/** Every movement of money out of a wallet asks for the PIN in this sheet. */
export function PinSheet({ open, onClose, title = 'Enter your PIN', description, onSubmit }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const submit = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(pin);
    } catch (err) {
      const e = err as ApiError;
      const left = typeof e.details?.attemptsLeft === 'number' ? ` ${e.details.attemptsLeft} ${e.details.attemptsLeft === 1 ? 'try' : 'tries'} left.` : '';
      setError(`${e.message ?? 'Something went wrong.'}${left}`);
      setAttempt((a) => a + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (busy) return;
        setError(null);
        onClose();
      }}
      title={title}
      description={description}
    >
      <PinPad onComplete={submit} busy={busy} error={error} errorKey={attempt} />
    </Modal>
  );
}

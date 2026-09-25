import { motion, useAnimationControls } from 'framer-motion';
import { Delete } from 'lucide-react';
import { useEffect, useState } from 'react';
import './app-ui.css';

interface Props {
  /** Called with all four digits. Resolve to accept, reject (or return an error string) to shake and clear. */
  onComplete: (pin: string) => Promise<string | void> | string | void;
  busy?: boolean;
  error?: string | null;
  /** Bump to replay the error shake when the same message comes back twice. */
  errorKey?: number;
  label?: string;
  /** Clears the dots when this value changes (e.g. between "create" and "confirm"). */
  resetKey?: string | number;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

/** Four-digit PIN with its own keypad, so the phone keyboard never covers the sheet. */
export function PinPad({ onComplete, busy, error, errorKey, label = 'Transaction PIN', resetKey }: Props) {
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const shake = useAnimationControls();
  const shown = localError ?? error ?? null;

  useEffect(() => setPin(''), [resetKey]);
  useEffect(() => {
    if (!error) return;
    setPin('');
    void shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.36 } });
  }, [error, errorKey, shake]);

  const press = async (k: (typeof KEYS)[number]) => {
    if (busy) return;
    setLocalError(null);
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    if (!k || pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      const msg = await onComplete(next);
      if (typeof msg === 'string') {
        setLocalError(msg);
        setPin('');
        void shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.36 } });
      }
    }
  };

  // Physical keyboards work too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) void press(e.key as (typeof KEYS)[number]);
      else if (e.key === 'Backspace') void press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="pinpad">
      <motion.div className="pinpad__dots" animate={shake} role="status" aria-label={`${label}: ${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pinpad__dot ${i < pin.length ? 'is-filled' : ''} ${busy ? 'is-busy' : ''}`} style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </motion.div>
      <p className={`pinpad__msg ${shown ? 'is-error' : ''}`} aria-live="assertive">
        {shown ?? ' '}
      </p>
      <div className="pinpad__keys">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button key={i} type="button" className="pinpad__key" onClick={() => void press(k)} disabled={busy} aria-label={k === 'del' ? 'Delete' : k}>
              {k === 'del' ? <Delete aria-hidden /> : <span className="num">{k}</span>}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

import { forwardRef } from 'react';
import './objects.css';

interface Props {
  value: string;
  onChange: (digits: string) => void;
  id: string;
  length?: number;
  busy?: boolean;
  success?: boolean;
  error?: boolean;
  describedBy?: string;
}

/**
 * One real input under six drawn boxes, so paste, autofill from SMS or email, the numeric keyboard and screen readers all just work.
 * Pasting "123 456" or "123-456" keeps the digits. The active box lifts and shows a caret; filled boxes settle with one small pop.
 */
export const OTPInput = forwardRef<HTMLInputElement, Props>(function OTPInput({ value, onChange, id, length = 6, busy, success, error, describedBy }, ref) {
  const disabled = busy || success;
  return (
    <label className="code-field" htmlFor={id}>
      <span className="visually-hidden">{length}-digit code</span>
      <input
        ref={ref}
        id={id}
        className="code-field__input"
        name="otp"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        enterKeyHint="done"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        disabled={disabled}
        autoFocus
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
      />
      <span className="code-field__boxes" aria-hidden style={{ gridTemplateColumns: `repeat(${length}, 1fr)` }}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={`code-field__box num ${i === value.length && !disabled ? 'is-active' : ''} ${value[i] ? 'is-filled' : ''} ${error ? 'is-error' : ''} ${success ? 'is-success' : ''}`}>
            {value[i] ?? ''}
          </span>
        ))}
      </span>
    </label>
  );
});

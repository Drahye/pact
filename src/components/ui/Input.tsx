import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import './input.css';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input({ label, hint, error, leading, trailing, className = '', id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="field__control">
        {leading && <span className="field__leading">{leading}</span>}
        <input ref={ref} id={inputId} className="field__input" aria-invalid={!!error || undefined} aria-describedby={describedBy} {...rest} />
        {trailing && <span className="field__trailing">{trailing}</span>}
      </div>
      {error ? (
        <p className="field__error" id={`${inputId}-error`}>
          {error}
        </p>
      ) : (
        hint && (
          <p className="field__hint" id={`${inputId}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
});

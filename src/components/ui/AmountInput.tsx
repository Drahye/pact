import { forwardRef, useId } from 'react';
import { formatAmountInput, parseAmount } from '../../lib/format';
import './input.css';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  size?: 'md' | 'xl';
  max?: number;
  placeholder?: string;
  align?: 'left' | 'center';
  hideLabel?: boolean;
  onFocus?: () => void;
}

/** Large naira entry. Formats as you type and keeps the caret-friendly width. */
export const AmountInput = forwardRef<HTMLInputElement, Props>(function AmountInput(
  { label, value, onChange, size = 'md', max = 100_000_000, placeholder = '0', align = 'left', hideLabel, onFocus },
  ref,
) {
  const id = useId();
  const text = formatAmountInput(value);
  return (
    <div className={`amount amount--${size} amount--${align}`} style={{ ['--chars' as string]: (text || placeholder).length }}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'field__label'}>
        {label}
      </label>
      {/* the whole control is a click target for the field */}
      <label className="amount__control" htmlFor={id}>
        <span className="amount__currency" aria-hidden>
          ₦
        </span>
        <span className="amount__field" data-value={text || placeholder}>
        <input
          ref={ref}
          id={id}
          className="amount__input num"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          onFocus={onFocus}
          onChange={(e) => onChange(Math.min(max, parseAmount(e.target.value)))}
        />
        </span>
      </label>
    </div>
  );
});

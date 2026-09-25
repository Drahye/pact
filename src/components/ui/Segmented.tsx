import { motion } from 'framer-motion';
import { useId } from 'react';
import { spring } from '../../tokens/tokens';
import './segmented.css';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  variant?: 'track' | 'chips';
  size?: 'md' | 'lg';
  className?: string;
}

/** iOS-style segmented control (`track`) or free-standing amount chips (`chips`). */
export function Segmented<T extends string>({ options, value, onChange, label, variant = 'track', size = 'md', className = '' }: Props<T>) {
  const layoutId = useId();
  return (
    <div className={`segmented segmented--${variant} segmented--${size} ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`segmented__option ${active ? 'is-active' : ''}`}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const i = options.findIndex((x) => x.value === value);
              const next = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
              onChange(next.value);
              (e.currentTarget.parentElement?.querySelectorAll('button')[options.indexOf(next)] as HTMLButtonElement)?.focus();
            }}
            tabIndex={active || (value === null && o === options[0]) ? 0 : -1}
          >
            {active && <motion.span layoutId={layoutId} className="segmented__thumb" transition={spring.snappy} />}
            <span className="segmented__label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

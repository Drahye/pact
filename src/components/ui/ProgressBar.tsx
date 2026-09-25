import { motion, useReducedMotion } from 'framer-motion';
import { transition } from '../../tokens/tokens';
import './progress.css';

interface Props {
  /** 0–100 */
  value: number;
  /** Optional ghost segment showing where a pending contribution would land (0–100, absolute). */
  preview?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'light' | 'inverse';
  /** Start value for the entrance animation. */
  from?: number;
  label?: string;
  delay?: number;
  className?: string;
}

export function ProgressBar({ value, preview, size = 'md', tone = 'light', from = 0, label = 'Progress', delay = 0, className = '' }: Props) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, value));
  const t = reduce ? { duration: 0 } : { ...transition.progress, delay };
  return (
    <div
      className={`progress progress--${size} progress--${tone} ${clamped >= 100 ? 'is-complete' : ''} ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      {preview !== undefined && preview > clamped && (
        <motion.span
          className="progress__preview"
          initial={false}
          animate={{ width: `${Math.min(100, preview)}%` }}
          transition={reduce ? { duration: 0 } : transition.base}
        />
      )}
      <motion.span
        className="progress__fill"
        initial={{ width: `${from}%` }}
        animate={{ width: `${clamped}%` }}
        transition={t}
      />
    </div>
  );
}

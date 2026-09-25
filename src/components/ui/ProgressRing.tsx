import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { transition } from '../../tokens/tokens';
import './progress.css';

interface Props {
  value: number; // 0–100
  size?: number;
  stroke?: number;
  tone?: 'light' | 'inverse';
  from?: number;
  delay?: number;
  label?: string;
  children?: ReactNode;
  className?: string;
}

export function ProgressRing({ value, size = 120, stroke = 10, tone = 'light', from = 0, delay = 0, label = 'Progress', children, className = '' }: Props) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`ring ring--${tone} ${clamped >= 100 ? 'is-complete' : ''} ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <motion.circle
          className="ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c * (1 - from / 100) }}
          animate={{ strokeDashoffset: c * (1 - clamped / 100) }}
          transition={reduce ? { duration: 0 } : { ...transition.progress, duration: 1.1, delay }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <div className="ring__center">{children}</div>}
    </div>
  );
}

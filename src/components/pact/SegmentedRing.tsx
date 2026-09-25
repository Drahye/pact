import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { ease } from '../../tokens/tokens';
import './segmented-ring.css';

export interface Share {
  id: string;
  color: string;
  value: number;
  label?: string;
}

interface Props {
  shares: Share[];
  target: number;
  size?: number;
  stroke?: number;
  tone?: 'light' | 'inverse';
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  /** Delay before segments start drawing (s). */
  delay?: number;
  /** Draw on mount. When false, segments appear drawn. */
  animate?: boolean;
  label: string;
  children?: ReactNode;
  className?: string;
}

const GAP_PX = 5;

/**
 * Progress as people: each contributor is a segment in their own colour,
 * drawn clockwise from 12 o'clock. Tap a segment to single someone out.
 */
export function SegmentedRing({ shares, target, size = 220, stroke = 18, tone = 'light', selected = null, onSelect, delay = 0, animate = true, label, children, className = '' }: Props) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = shares.reduce((s, x) => s + x.value, 0);
  const pct = Math.min(100, (total / target) * 100);
  let offset = 0;
  const segs = shares
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const full = (s.value / target) * c;
      const seg = { ...s, start: offset, len: Math.max(1, full - GAP_PX), i };
      offset += full;
      return seg;
    });
  const draw = animate && !reduce;
  // Stagger only the first draw; later value changes glide without delay.
  const drawn = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => (drawn.current = true), (delay + 1.2) * 1000);
    return () => window.clearTimeout(t);
  }, [delay]);
  return (
    <div
      className={`sring sring--${tone} ${selected ? 'has-selection' : ''} ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} onClick={() => onSelect?.(null)}>
        <circle className="sring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        {segs.map((s) => (
          <motion.circle
            key={s.id}
            className={`sring__seg ${selected === s.id ? 'is-selected' : ''} ${onSelect ? 'is-interactive' : ''}`}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            initial={draw ? { strokeDasharray: `0 ${c}`, strokeDashoffset: -s.start } : false}
            animate={{ strokeDasharray: `${s.len} ${c}`, strokeDashoffset: -s.start }}
            transition={{ duration: reduce ? 0 : 0.55, delay: draw && !drawn.current ? delay + s.i * 0.07 : 0, ease: ease.out }}
            onClick={(e) => {
              if (!onSelect) return;
              e.stopPropagation();
              onSelect(selected === s.id ? null : s.id);
            }}
          />
        ))}
      </svg>
      {children && <div className="sring__center">{children}</div>}
    </div>
  );
}

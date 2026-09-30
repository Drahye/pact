import { motion, useReducedMotion } from 'framer-motion';
import type { Share } from './SegmentedRing';
import { transition } from '../../tokens/tokens';
import './segmented-bar.css';

interface Props {
  shares: Share[];
  target: number;
  /** A pending amount drawn striped at the end, in the viewer's colour. */
  preview?: { amount: number; color: string } | null;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'light' | 'inverse';
  label: string;
}

/** Linear version of the ring: the bar is made of everyone's money, in their colours. */
export function SegmentedBar({ shares, target, preview, size = 'md', tone = 'light', label }: Props) {
  const reduce = useReducedMotion();
  const total = shares.reduce((s, x) => s + x.value, 0);
  const pct = Math.min(100, (total / Math.max(1, target)) * 100);
  const t = reduce ? { duration: 0 } : transition.progress;
  return (
    <div className={`sbar sbar--${size} sbar--${tone}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      {shares
        .filter((s) => s.value > 0)
        .map((s) => (
          <motion.span
            key={s.id}
            className="sbar__seg"
            style={{ background: s.color }}
            initial={false}
            animate={{ width: `${(s.value / Math.max(1, target)) * 100}%` }}
            transition={t}
          />
        ))}
      {preview && preview.amount > 0 && (
        <motion.span
          className="sbar__seg sbar__preview"
          style={{ ['--c' as string]: preview.color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100 - pct, (preview.amount / Math.max(1, target)) * 100)}%` }}
          transition={reduce ? { duration: 0 } : transition.base}
        />
      )}
    </div>
  );
}

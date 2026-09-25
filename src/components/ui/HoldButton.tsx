import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { gsap } from '../../lib/gsap';
import './hold-button.css';

interface Props {
  label: string;
  holdingLabel?: string;
  onComplete: () => void;
  duration?: number;
  disabled?: boolean;
  /** Flip to true to play the hold by itself once: a demonstration of the gesture. */
  autoHold?: boolean;
}

/**
 * Press-and-hold to confirm. The fill tracks your finger; let go early and it
 * drains back. Keyboard and reduced-motion users confirm with a single press.
 */
export function HoldButton({ label, holdingLabel = 'Keep holding…', onComplete, duration = 0.9, disabled, autoHold }: Props) {
  const reduce = useReducedMotion();
  const el = useRef<HTMLButtonElement>(null);
  const tween = useRef<gsap.core.Tween | null>(null);
  const [holding, setHolding] = useState(false);

  const start = () => {
    if (disabled || !el.current) return;
    if (reduce) return onComplete();
    setHolding(true);
    tween.current?.kill();
    tween.current = gsap.to(el.current, {
      '--p': 1,
      duration,
      ease: 'power1.in',
      onComplete: () => {
        setHolding(false);
        gsap.set(el.current, { '--p': 0 });
        if ('vibrate' in navigator) navigator.vibrate?.(12);
        onComplete();
      },
    });
  };
  useEffect(() => {
    if (!autoHold) return;
    const t = window.setTimeout(() => start(), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHold]);

  const cancel = () => {
    if (!holding || !el.current) return;
    setHolding(false);
    tween.current?.kill();
    tween.current = gsap.to(el.current, { '--p': 0, duration: 0.35, ease: 'power2.out' });
  };

  return (
    <button
      ref={el}
      type="button"
      className={`hold ${holding ? 'is-holding' : ''}`}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          onComplete();
        }
      }}
    >
      <span className="hold__fill" aria-hidden />
      <span className="hold__label">{holding ? holdingLabel : label}</span>
    </button>
  );
}

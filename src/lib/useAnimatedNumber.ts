import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { duration, ease } from '../tokens/tokens';

/**
 * Tweens a number whenever `value` changes. Returns the current display value.
 * Instant when the user prefers reduced motion.
 */
export function useAnimatedNumber(value: number, { from, delay = 0, seconds = duration.count } = {} as {
  from?: number;
  delay?: number;
  seconds?: number;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(from ?? value);
  const current = useRef(from ?? value);

  useEffect(() => {
    if (reduce) {
      current.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(current.current, value, {
      duration: seconds,
      delay,
      ease: ease.out,
      onUpdate: (v) => {
        current.current = v;
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce, delay, seconds]);

  return display;
}

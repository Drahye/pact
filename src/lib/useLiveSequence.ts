import { useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { LiveEvent } from '../data/landing';

interface Options {
  startRaised: number;
  firstDelay?: number;
  interval?: number;
  hold?: number;
}

/**
 * Plays scripted contributions on a loop while `ref` is on screen.
 * Returns how many events have landed this cycle, a cycle counter and play state.
 */
export function useLiveSequence(events: LiveEvent[], ref: RefObject<Element>, { startRaised, firstDelay = 1200, interval = 2600, hold = 4200 }: Options) {
  const reduce = useReducedMotion();
  const inView = useInView(ref, { margin: '-10% 0px' });
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number>();

  const running = inView && !paused && !reduce;

  useEffect(() => {
    if (!running) return;
    const wait = step === 0 ? firstDelay : step < events.length ? interval : hold;
    timer.current = window.setTimeout(() => {
      if (step < events.length) setStep((s) => s + 1);
      else {
        setStep(0);
        setCycle((c) => c + 1);
      }
    }, wait);
    return () => window.clearTimeout(timer.current);
  }, [running, step, events.length, firstDelay, interval, hold]);

  // Reduced motion: show the settled end state, no loop.
  const shown = reduce ? events.length : step;
  const raised = startRaised + events.slice(0, shown).reduce((sum, e) => sum + e.amount, 0);
  const latest = shown > 0 ? events[shown - 1] : null;

  return { step: shown, cycle, raised, latest, paused, setPaused, reduce };
}

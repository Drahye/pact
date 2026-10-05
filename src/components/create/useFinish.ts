import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavigateOptions } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

export interface Finished {
  title: string;
  line?: string;
  strong?: boolean;
}

/**
 * When something has been made: show its completion for a moment, then open it. A Pact gets the longer, stronger moment. Under reduced
 * motion the pause is almost nothing. The caller passes `done` to the shell.
 */
export function useFinish() {
  const navigate = useNavigate();
  const [done, setDone] = useState<Finished>();
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const finish = useCallback(
    (what: Finished, to: string, options?: NavigateOptions) => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      setDone(what);
      timer.current = window.setTimeout(() => navigate(to, options), reduce ? 80 : what.strong ? 1000 : 620);
    },
    [navigate],
  );
  return { done, finish };
}

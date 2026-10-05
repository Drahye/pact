import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayRoot } from '../ui/overlay';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { trackClient } from '../../api/circles';
import { useStartPactPath } from '../../lib/startPact';
import { CreateSheetShell } from './CreateSheetShell';

interface OpenOptions {
  from: 'nav' | 'circle' | 'home';
  /** When opened inside a Circle, what gets started belongs to it. */
  circleId?: string;
  /** Where it was opened from: the sheet grows out of this rectangle and settles back into it. */
  origin?: DOMRect;
}

const Ctx = createContext<{ open: (o: OpenOptions) => void; isOpen: boolean }>({ open: () => undefined, isOpen: false });

/** Opens the "What do you want to do?" sheet from anywhere: the bottom nav, a Circle, Home. */
export const useCreateSheet = () => useContext(Ctx);

export function CreateSheetProvider({ children }: { children: ReactNode }) {
  const startPath = useStartPactPath();
  const [state, setState] = useState<OpenOptions | null>(null);
  const { status } = useAuth();
  const navigate = useNavigate();
  const root = useOverlayRoot();
  const [flood, setFlood] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const open = useCallback(
    (o: OpenOptions) => {
      setState(o);
      if (status === 'signedIn') trackClient('universal_create_opened', { from: o.from });
    },
    [status],
  );
  const value = useMemo(() => ({ open, isOpen: state !== null }), [open, state]);
  const close = () => setState(null);
  const go = (path: string) => {
    close();
    navigate(path);
  };
  /** Starting a Pact is the heavy one: the sheet floods with the Pact's green, the form arrives out of it, and the green lifts. */
  const goPact = (path: string) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return go(path);
    setFlood(true);
    timers.current.push(
      window.setTimeout(() => go(path), 260),
      window.setTimeout(() => setFlood(false), 760),
    );
  };
  const circle = state?.circleId;
  const q = circle ? `?circle=${circle}` : '';

  return (
    <Ctx.Provider value={value}>
      {children}
      <CreateSheetShell
        open={state !== null}
        origin={state?.origin}
        onClose={close}
        choices={[
          { kind: 'ask', title: 'Ask', body: 'Get a quick decision', onSelect: () => go(`/app/asks/new${q}`) },
          { kind: 'plan', title: 'Plan', body: 'Figure out when and what', onSelect: () => go(`/app/plans/new${q}`) },
          { kind: 'split', title: 'Split', body: 'Sort out who owes what', onSelect: () => go(`/app/splits/new${q}`) },
          { kind: 'pact', title: 'Pact', body: 'Commit to making it happen', onSelect: () => goPact(startPath({ circleId: circle })) },
        ]}
      />
      {flood && root && createPortal(<div className={`csheet-flood ${root !== document.body ? 'csheet-flood--frame' : ''}`} aria-hidden />, root)}
    </Ctx.Provider>
  );
}

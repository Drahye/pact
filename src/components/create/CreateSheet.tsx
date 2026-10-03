import { CalendarClock, Handshake, MessagesSquare, Receipt } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { trackClient } from '../../api/circles';
import { Modal } from '../ui/Modal';
import './create-sheet.css';

interface OpenOptions {
  from: 'nav' | 'circle' | 'home';
  /** When opened inside a Circle, what gets started belongs to it. */
  circleId?: string;
}

const Ctx = createContext<{ open: (o: OpenOptions) => void }>({ open: () => undefined });

/** Opens the "What do you want to do?" sheet from anywhere: the bottom nav, a Circle, Home. */
export const useCreateSheet = () => useContext(Ctx);

export function CreateSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenOptions | null>(null);
  const { status } = useAuth();
  const navigate = useNavigate();

  const open = useCallback(
    (o: OpenOptions) => {
      setState(o);
      if (status === 'signedIn') trackClient('universal_create_opened', { from: o.from });
    },
    [status],
  );
  const value = useMemo(() => ({ open }), [open]);
  const close = () => setState(null);

  const startAsk = () => {
    const circle = state?.circleId;
    close();
    navigate(circle ? `/app/asks/new?circle=${circle}` : '/app/asks/new');
  };

  const startPlan = () => {
    const circle = state?.circleId;
    close();
    navigate(circle ? `/app/plans/new?circle=${circle}` : '/app/plans/new');
  };

  const startSplit = () => {
    const circle = state?.circleId;
    close();
    navigate(circle ? `/app/splits/new?circle=${circle}` : '/app/splits/new');
  };

  const startPact = () => {
    const circle = state?.circleId;
    close();
    navigate(circle ? `/app/create?circle=${circle}` : '/app/create');
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal open={state !== null} onClose={close} title="What do you want to do?">
        <ul className="create-sheet" aria-label="Things you can start">
          <Option icon={<MessagesSquare />} tint="sky" title="Ask the group" body="Make a quick decision." onClick={startAsk} />
          <Option icon={<CalendarClock />} tint="sun" title="Make a plan" body="Something you’re thinking of doing together." onClick={startPlan} />
          <Option icon={<Receipt />} tint="lilac" title="Split an expense" body="Work out who owes what." onClick={startSplit} />
          <Option icon={<Handshake />} tint="mint" title="Start a Pact" body="Everyone is ready to commit." onClick={startPact} />
        </ul>
      </Modal>
    </Ctx.Provider>
  );
}

function Option({ icon, tint, title, body, onClick }: { icon: ReactNode; tint: string; title: string; body: string; onClick?: () => void }) {
  const live = !!onClick;
  return (
    <li>
      <button type="button" className={`create-sheet__option ${live ? '' : 'is-soon'}`} onClick={onClick} aria-disabled={!live || undefined}>
        <span className={`create-sheet__icon tint--${tint}`} aria-hidden>
          {icon}
        </span>
        <span className="create-sheet__text">
          <span className="create-sheet__title">{title}</span>
          <span className="create-sheet__body">{body}</span>
        </span>
        {!live && <span className="create-sheet__soon">Coming next</span>}
      </button>
    </li>
  );
}

import { useNavigate } from 'react-router-dom';
import { HandoffChip } from '../../pages/app/auth/HandoffNote';
import { handoffWords, setHandoff, type Handoff } from '../../pages/app/auth/handoff';
import { setReturnTo } from '../../pages/app/auth/flow';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export type HandoffInput = Omit<Handoff, 'at'>;

/** Go and sign in, and come back to exactly this page: the return address and what the person was doing are kept for the way. */
export function useBeginSignIn() {
  const navigate = useNavigate();
  return (h: HandoffInput) => {
    setReturnTo(h.path);
    setHandoff(h);
    navigate('/app/auth/start');
  };
}

/**
 * Said before leaving for sign-in, in the words of what the person is doing: not "please authenticate" but "verify your email so your
 * RSVP stays with you". Their choice is shown with it, so it is clearly kept.
 */
export function HandoffSheet({ open, onClose, onContinue, h, cta = 'Continue' }: { open: boolean; onClose: () => void; onContinue: () => void; h: HandoffInput; cta?: string }) {
  const words = handoffWords({ ...h, at: 0 });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={words.title}
      description={words.line}
      footer={
        <>
          <Button fullWidth onClick={onContinue}>
            {cta}
          </Button>
          <Button fullWidth variant="ghost" onClick={onClose}>
            Not now
          </Button>
        </>
      }
    >
      <HandoffChip h={h} />
    </Modal>
  );
}

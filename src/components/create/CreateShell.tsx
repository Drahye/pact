import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Screen } from '../../pages/app/Screen';
import { TopBar } from '../ui/TopBar';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useOverlayRoot } from '../ui/overlay';
import { CompletionState, Hero, OBJECT_KINDS, type ObjectKind } from '../objects';
import { motion as speed, ease } from '../../tokens/tokens';
import './create-flow.css';

/**
 * The frame every create flow shares: which kind of thing is being made (its icon, its tint), how far along, and a step that slides in
 * from the side it belongs to. One decision per step, the next button always in the same place.
 *
 * Leaving: Back steps back (what was entered is kept). At the first step it leaves, straight away if nothing has been entered and
 * after one short question if something has. When the thing has been made, `done` resolves the screen into a quiet completion before
 * the caller moves on to the new object.
 */
export function CreateShell({
  kind,
  stepIndex,
  steps,
  stepKey,
  onBack,
  onLeave,
  dirty,
  keepNote,
  heading,
  sub,
  footer,
  context,
  done,
  children,
}: {
  kind: ObjectKind;
  stepIndex: number;
  steps: number;
  stepKey: string;
  /** Back, from any step after the first. */
  onBack: () => void;
  /** Leave the flow. */
  onLeave: () => void;
  /** Something has been entered that leaving would lose. */
  dirty?: boolean;
  /** When leaving does not lose it (a draft is kept), say so in the question. */
  keepNote?: string;
  heading: string;
  sub?: string;
  footer: ReactNode;
  /** What this is being made for, when it is already known: "in The Boys". */
  context?: ReactNode;
  /** The thing was made: shows its completion while the caller navigates on. */
  done?: { title: string; line?: string; strong?: boolean };
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const root = useOverlayRoot();
  const k = OBJECT_KINDS[kind];
  const [asking, setAsking] = useState(false);
  const dx = reduce ? 0 : 28;
  const back = () => (stepIndex > 0 ? onBack() : dirty ? setAsking(true) : onLeave());
  const inFrame = !!root && root !== document.body;
  return (
    <Screen topBar={<TopBar tone="transparent" leading={stepIndex === 0 ? 'close' : 'back'} onBack={back} />} footer={footer} className={`cf xhero xhero--lite tint--${k.tint}`}>
      <Hero tint={k.tint} className="xh--page xh--cf">
      <div className="cf__meta">
        <span className="cf__kind">
          <span className="cf__icon" aria-hidden>
            {k.icon}
          </span>
          New {k.noun.toLowerCase()}
        </span>
        {steps > 1 && (
          <span className="cf__steps">
            <span className="visually-hidden">
              Step {stepIndex + 1} of {steps}
            </span>
            <span className="cf__dots" aria-hidden>
              {Array.from({ length: steps }, (_, i) => (
                <i key={i} className={i < stepIndex ? 'is-past' : i === stepIndex ? 'is-now' : ''} />
              ))}
            </span>
          </span>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={stepKey} className="cf__headblock" initial={{ opacity: 0, x: dx }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dx }} transition={{ duration: speed.nav * 0.8, ease: ease.out }}>
          <h1 className="large-title cf__heading">{heading}</h1>
          {context && <p className="cf__context">{context}</p>}
          {sub && <p className="cf__sub">{sub}</p>}
        </motion.div>
      </AnimatePresence>
      </Hero>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={stepKey} className="ca cf__body" initial={{ opacity: 0, x: dx }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dx }} transition={{ duration: speed.nav * 0.8, ease: ease.out }}>
          {children}
        </motion.div>
      </AnimatePresence>

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title={`Leave this ${k.noun.toLowerCase()}?`}
        description={keepNote ?? 'What you’ve entered will be lost.'}
        footer={
          <>
            <Button fullWidth onClick={() => setAsking(false)}>
              Keep going
            </Button>
            <Button fullWidth variant="ghost" onClick={onLeave}>
              Leave
            </Button>
          </>
        }
      >
        <span />
      </Modal>

      {root &&
        createPortal(
          <AnimatePresence>
            {done && (
              <motion.div className={`cf-done tint--${k.tint} ${inFrame ? 'cf-done--frame' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0.01 : 0.22 }}>
                <CompletionState tint={k.tint} size={done.strong ? 'lg' : 'sm'} flourish={!!done.strong} title={done.title} line={done.line} />
              </motion.div>
            )}
          </AnimatePresence>,
          root,
        )}
    </Screen>
  );
}

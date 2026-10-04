import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ease, motion as speed, spring } from '../../tokens/tokens';
import { IconButton } from './IconButton';
import { useOverlayRoot } from './overlay';
import './modal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Bottom sheet on phones and inside the prototype; centred dialog on wide screens. */
export function Modal({ open, onClose, title, description, children, footer }: Props) {
  const root = useOverlayRoot();
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Parents usually pass a fresh onClose every render. Reading it through a ref keeps the effect (and its
  // focus handling) from re-running on every keystroke, which used to pull focus out of inputs while typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key !== 'Tab' || !panel.current) return;
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!root) return null;
  const inFrame = root !== document.body;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={`modal ${inFrame ? 'modal--frame' : ''}`}>
          <motion.div
            className="modal__backdrop"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : speed.state }}
          />
          <motion.div
            ref={panel}
            className="modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            // Rises with a soft spring from the bottom edge, where the create button sits; leaves quickly with an ease.
            initial={reduce ? { opacity: 0 } : { y: '100%', scale: 0.985 }}
            animate={reduce ? { opacity: 1 } : { y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { y: '100%', transition: { duration: speed.state, ease: ease.inOut } }}
            transition={reduce ? { duration: 0 } : spring.sheet}
            style={{ transformOrigin: '50% 100%' }}
          >
            <span className="modal__handle" aria-hidden />
            <header className="modal__header">
              <div>
                <h2 id={titleId} className="modal__title">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="modal__description">
                    {description}
                  </p>
                )}
              </div>
              <IconButton label="Close" icon={<X />} variant="ghost" onClick={onClose} />
            </header>
            <div className="modal__body">{children}</div>
            {footer && <footer className="modal__footer">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    root,
  );
}

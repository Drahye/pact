import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ease } from '../../tokens/tokens';
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

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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
  }, [open, onClose]);

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
            transition={{ duration: reduce ? 0 : 0.2 }}
          />
          <motion.div
            ref={panel}
            className="modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: reduce ? 0 : 0.42, ease: ease.out }}
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

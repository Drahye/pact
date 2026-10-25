import { WarningCircleIcon } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayRoot } from './overlay';
import './error-surfacer.css';

/** Every kind of error the app draws in place. They stay where they are; this only steps in when one cannot be seen. */
const ERRORS = '[role="alert"], .field__error, .notice--danger, .nd-error';

/** Is the first line of the element on screen and not under a bar, sheet or the edge of the phone? */
function seen(el: Element) {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const x = r.left + r.width / 2;
  const y = r.top + Math.min(r.height / 2, 12);
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const top = document.elementFromPoint(x, y);
  return !!top && (el.contains(top) || top.contains(el));
}

/**
 * An error belongs where it happened: next to the field or the button. When that place is out of sight (scrolled past, or tucked under the
 * bar), the message also appears at the top of the screen; tapping it takes you to the spot. It leaves by itself once the original is in view.
 */
export function ErrorSurfacer() {
  const root = useOverlayRoot();
  const [shown, setShown] = useState<{ el: Element; text: string } | null>(null);

  useEffect(() => {
    const tracked = new Map<Element, number>();
    const settle = 450; // a screen is still sliding in for a moment: do not judge it yet
    const look = () => {
      let hidden: { el: Element; text: string } | null = null;
      for (const [el, since] of tracked) {
        if (!el.isConnected) {
          tracked.delete(el);
          continue;
        }
        const text = el.textContent?.trim() ?? '';
        if (!text || performance.now() - since < settle) continue;
        if (!seen(el)) hidden = { el, text };
      }
      setShown((now) => (hidden?.el === now?.el && hidden?.text === now?.text ? now : hidden));
    };
    const add = (n: Node) => {
      if (!(n instanceof Element) || n.closest('.errtop')) return;
      const found = n.matches(ERRORS) ? [n] : [...n.querySelectorAll(ERRORS)];
      for (const el of found) if (!tracked.has(el)) tracked.set(el, performance.now());
    };
    const mo = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(add);
      window.setTimeout(look, settle + 30);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(() => tracked.size && look(), 300);
    const onMove = () => tracked.size && look();
    window.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove);
    return () => {
      mo.disconnect();
      window.clearInterval(timer);
      window.removeEventListener('scroll', onMove, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', onMove);
    };
  }, []);

  if (!root) return null;
  return createPortal(
    <AnimatePresence>
      {shown && (
        <motion.button
          key="errtop"
          type="button"
          className={`errtop ${root !== document.body ? 'errtop--frame' : ''}`}
          tabIndex={-1}
          aria-hidden
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
          onClick={() => shown.el.scrollIntoView({ block: 'center', behavior: 'smooth' })}
        >
          <WarningCircleIcon weight="fill" />
          <span className="errtop__text">{shown.text}</span>
          <span className="errtop__go">Show me</span>
        </motion.button>
      )}
    </AnimatePresence>,
    root,
  );
}

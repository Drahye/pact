import { useLayoutEffect, useRef } from 'react';

/**
 * Shrinks a single line of text until it fits the width of its parent, whatever the number,
 * the ring, or the person's text-size setting. CSS sizes it first (so there is no jump);
 * this only steps in when the OS "larger text" setting pushes it past the box.
 */
export function useFitText<T extends HTMLElement>(deps: unknown[], minPx = 14) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      el.style.fontSize = '';
      // Never taller than a share of the box either: at big text sizes a short number would otherwise swell into the ring.
      const cap = box.clientWidth * 0.3;
      if (parseFloat(getComputedStyle(el).fontSize) > cap && cap > minPx) el.style.fontSize = `${cap}px`;
      const avail = box.clientWidth * 0.94; // a little air: the ring curves away from the corners
      const need = el.scrollWidth;
      if (avail > 0 && need > avail + 0.5) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        el.style.fontSize = `${Math.max(minPx, Math.floor(((size * avail) / need) * 100) / 100 - 0.5)}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    // Figures animate (count up) so the width changes while it runs.
    const mo = new MutationObserver(fit);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

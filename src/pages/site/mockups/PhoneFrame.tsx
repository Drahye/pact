import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './phone.css';

/** The screen is always laid out at this size and scaled as one piece, so every device is pixel-identical. */
export const SCREEN_W = 360;
export const SCREEN_H = 740;
const BEZEL = 10;
const BODY_W = SCREEN_W + BEZEL * 2;
const BODY_H = SCREEN_H + BEZEL * 2;

interface Props {
  children: ReactNode;
  /** Described once for assistive tech; the screen contents are hidden from the reading order. */
  label: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A phone with a real-looking body and viewport. Its width comes from CSS (`--phone-w` or the
 * parent), and the screen inside scales to fit with a single transform, so type, rings and
 * spacing stay exactly as designed at any size.
 */
export function PhoneFrame({ children, label, className = '', style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setK(el.clientWidth / BODY_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={`phone3 ${className}`} style={{ aspectRatio: `${BODY_W} / ${BODY_H}`, ...style }} role="img" aria-label={label}>
      <div className="phone3__body" style={{ width: BODY_W, height: BODY_H, transform: `scale(${k})`, visibility: k ? 'visible' : 'hidden' }}>
        <div className="phone3__screen" style={{ width: SCREEN_W, height: SCREEN_H }} aria-hidden>
          <div className="phone3__island" />
          {children}
          <div className="phone3__home" />
        </div>
      </div>
    </div>
  );
}

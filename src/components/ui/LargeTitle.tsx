import { useEffect, useRef, type ReactNode } from 'react';
import { useScreenScroll } from '../../pages/app/Screen';

interface Props {
  children: ReactNode;
  /** Small line above the title, e.g. the date. */
  eyebrow?: ReactNode;
  /** Supporting line below the title. */
  subtitle?: ReactNode;
  className?: string;
}

/**
 * The expressive title at the top of a screen. When it scrolls behind the top bar, the bar
 * (see TopBar `collapse`) takes over with a compact title. It is the screen's only h1.
 */
export function LargeTitle({ children, eyebrow, subtitle, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { root, setCollapsed } = useScreenScroll();
  useEffect(() => {
    const el = ref.current;
    if (!el || !root || typeof IntersectionObserver === 'undefined') return;
    // The sticky bar is about 60px tall: the title counts as gone once it is behind it.
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { root, rootMargin: '-60px 0px 0px 0px', threshold: 0 });
    io.observe(el);
    return () => (io.disconnect(), setCollapsed(false));
  }, [root, setCollapsed]);
  return (
    <div ref={ref} className={`large-title-block ${className}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="large-title">{children}</h1>
      {subtitle && <p className="large-title-block__sub">{subtitle}</p>}
    </div>
  );
}

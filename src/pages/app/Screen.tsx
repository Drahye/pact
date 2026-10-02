import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface Props {
  topBar?: ReactNode;
  /** Sticky action area pinned above the home indicator. */
  footer?: ReactNode;
  tabBar?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'bg' | 'mint';
}

interface ScreenScroll {
  /** The content has moved under the top bar. */
  scrolled: boolean;
  /** The large title has scrolled out of view, so the bar should carry the title. */
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  root: HTMLElement | null;
}

const Ctx = createContext<ScreenScroll>({ scrolled: false, collapsed: false, setCollapsed: () => undefined, root: null });
export const useScreenScroll = () => useContext(Ctx);

/** One app screen: its own scroll container with sticky chrome. */
export function Screen({ topBar, footer, tabBar, children, className = '', tone = 'bg' }: Props) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // One observer decides "scrolled"; no scroll listeners, so there is nothing to jitter.
  useEffect(() => {
    if (!root || !sentinel.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { root, threshold: 0 });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [root]);

  const value = useMemo(() => ({ scrolled, collapsed, setCollapsed, root }), [scrolled, collapsed, root]);
  return (
    <Ctx.Provider value={value}>
      <div ref={setRoot} className={`screen screen--${tone} ${className}`} data-scrolled={scrolled || undefined}>
        {topBar}
        <div className="screen__content">{children}</div>
        {footer && <div className="screen__footer">{footer}</div>}
        {tabBar}
        <div ref={sentinel} className="screen__sentinel" aria-hidden />
      </div>
    </Ctx.Provider>
  );
}

import type { ReactNode } from 'react';

interface Props {
  topBar?: ReactNode;
  /** Sticky action area pinned above the home indicator. */
  footer?: ReactNode;
  tabBar?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'bg' | 'mint';
}

/** One app screen: its own scroll container with sticky chrome. */
export function Screen({ topBar, footer, tabBar, children, className = '', tone = 'bg' }: Props) {
  return (
    <div className={`screen screen--${tone} ${className}`}>
      {topBar}
      <div className="screen__content">{children}</div>
      {footer && <div className="screen__footer">{footer}</div>}
      {tabBar}
    </div>
  );
}

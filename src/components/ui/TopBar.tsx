import { ChevronLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScreenScroll } from '../../pages/app/Screen';
import { IconButton } from './IconButton';
import './nav.css';

interface Props {
  title?: string;
  /** `back` = chevron (push screens); `close` = X (modal screens). */
  leading?: 'back' | 'close' | 'none';
  /** Explicit destination; falls back to history. */
  backTo?: string;
  /** Takes over the back button, e.g. to step back inside a flow before leaving it. */
  onBack?: () => void;
  trailing?: ReactNode;
  tone?: 'bg' | 'transparent';
  /** The title shows only once the screen's LargeTitle has scrolled away (the large title is the h1). */
  collapse?: boolean;
}

/** In-app top navigation. */
export function TopBar({ title, leading = 'back', backTo, onBack, trailing, tone = 'bg', collapse }: Props) {
  const { scrolled, collapsed } = useScreenScroll();
  const navigate = useNavigate();
  const goBack = () => (onBack ? onBack() : backTo ? navigate(backTo) : navigate(-1));
  return (
    <header className={`topbar topbar--${tone}${scrolled ? ' is-scrolled' : ''}${collapse ? ' topbar--collapse' : ''}${collapse && collapsed ? ' is-collapsed' : ''}`}>
      <div className="topbar__side">
        {leading !== 'none' && (
          <IconButton
            label={leading === 'back' ? 'Back' : 'Close'}
            icon={leading === 'back' ? <ChevronLeft /> : <X />}
            variant="surface"
            onClick={goBack}
          />
        )}
      </div>
      {title && (
        // In collapse mode the large h1 names the screen for assistive tech; this copy is visual only.
        <p className="topbar__title" aria-hidden={collapse ? true : undefined}>
          {title}
        </p>
      )}
      <div className="topbar__side topbar__side--end">{trailing}</div>
    </header>
  );
}

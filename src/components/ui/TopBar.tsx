import { ChevronLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from './IconButton';
import './nav.css';

interface Props {
  title?: string;
  /** `back` = chevron (push screens); `close` = X (modal screens). */
  leading?: 'back' | 'close' | 'none';
  /** Explicit destination; falls back to history. */
  backTo?: string;
  trailing?: ReactNode;
  tone?: 'bg' | 'transparent';
}

/** In-app top navigation. */
export function TopBar({ title, leading = 'back', backTo, trailing, tone = 'bg' }: Props) {
  const navigate = useNavigate();
  const goBack = () => (backTo ? navigate(backTo) : navigate(-1));
  return (
    <header className={`topbar topbar--${tone}`}>
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
      {title && <p className="topbar__title">{title}</p>}
      <div className="topbar__side topbar__side--end">{trailing}</div>
    </header>
  );
}

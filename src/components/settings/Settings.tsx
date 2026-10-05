import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import '../app/app-ui.css';
import './settings.css';

/**
 * Settings, said calmly: a short heading, then plain rows with hairlines between them. No box around each group; the heading and the
 * rhythm do the grouping. `plain` is for a group whose content is its own control (a switch, a segmented control) rather than rows.
 */
export function SettingsGroup({ id, title, plain, children }: { id: string; title: string; plain?: boolean; children: ReactNode }) {
  return (
    <section className="st-group" aria-labelledby={id}>
      <h2 id={id} className="st-group__title">
        {title}
      </h2>
      {plain ? children : <div className="menu">{children}</div>}
    </section>
  );
}

interface RowProps {
  icon: ReactNode;
  tint?: string;
  title: string;
  sub?: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Replaces the chevron: a short value ("Verified"), or a small action. */
  end?: ReactNode;
}

/** One row: an icon, what it is, one line of where it stands, and that it goes somewhere. */
export function SettingsRow({ icon, tint = 'sky', title, sub, to, href, onClick, danger, disabled, end }: RowProps) {
  const body = (
    <>
      <span className={`menu__icon tint--${tint}`} aria-hidden>
        {icon}
      </span>
      <span className="menu__text">
        <span className="menu__title">{title}</span>
        {sub && <span className="menu__sub">{sub}</span>}
      </span>
      <span className="menu__end">{end ?? (to || href || onClick ? <ChevronRight aria-hidden /> : null)}</span>
    </>
  );
  const cls = `menu__row ${danger ? 'menu__row--danger' : ''}`;
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (href) return <a href={href} className={cls}>{body}</a>;
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {body}
    </button>
  );
}

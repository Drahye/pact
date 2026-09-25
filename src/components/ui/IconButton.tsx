import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './button.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  variant?: 'surface' | 'ghost' | 'inverse';
  to?: string;
}

/** 44×44 round control. Always carries an accessible label. */
export function IconButton({ label, icon, variant = 'surface', to, className = '', ...rest }: Props) {
  const cls = `icon-btn icon-btn--${variant} ${className}`;
  if (to) {
    return (
      <Link to={to} className={cls} aria-label={label} title={label}>
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} aria-label={label} title={label} {...rest}>
      {icon}
    </button>
  );
}

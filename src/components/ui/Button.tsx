import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './button.css';

/** primary: the one confident action (green). ink: the same weight in ink, for screens that already have green. secondary: tonal. tertiary (ghost): a text-level action. inverse: on a dark surface. */
export type ButtonVariant = 'primary' | 'ink' | 'secondary' | 'tertiary' | 'ghost' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
  className?: string;
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined; href?: undefined };
type LinkProps = BaseProps & { to: string; href?: undefined; onClick?: () => void; 'aria-label'?: string; /** Router state, e.g. where the person came from. */ state?: unknown };
type AnchorProps = BaseProps & { href: string; to?: undefined; onClick?: () => void; 'aria-label'?: string };

const classes = ({ variant = "primary", size = "lg", fullWidth, loading, className }: Partial<BaseProps>) =>
  ['btn', `btn--${variant === 'tertiary' ? 'ghost' : variant}`, `btn--${size}`, fullWidth && 'btn--full', loading && 'is-loading', className].filter(Boolean).join(' ');

function Content({ iconLeft, iconRight, children, loading }: BaseProps) {
  return (
    <>
      {loading && <span className="btn__spinner" aria-hidden />}
      <span className="btn__content">
        {iconLeft && <span className="btn__icon">{iconLeft}</span>}
        <span className="btn__label">{children}</span>
        {iconRight && <span className="btn__icon">{iconRight}</span>}
      </span>
    </>
  );
}

/** Primary action, secondary action, quiet action and on-ink action. Renders a Link when given `to`. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps | LinkProps | AnchorProps>(function Button(props, ref) {
  const { variant, size, fullWidth, loading, iconLeft, iconRight, children, className, ...rest } = props;
  const base = { variant, size, fullWidth, loading, className };
  const content = <Content {...{ iconLeft, iconRight, children, loading }} />;

  if ('to' in rest && rest.to) {
    const { to, ...linkRest } = rest as LinkProps;
    return (
      <Link to={to} className={classes(base)} {...linkRest}>
        {content}
      </Link>
    );
  }
  if ('href' in rest && rest.href) {
    return (
      <a className={classes(base)} {...(rest as AnchorProps)}>
        {content}
      </a>
    );
  }
  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      ref={ref}
      type={buttonRest.type ?? 'button'}
      className={classes(base)}
      aria-busy={loading || undefined}
      {...buttonRest}
      disabled={buttonRest.disabled || loading}
    >
      {content}
    </button>
  );
});

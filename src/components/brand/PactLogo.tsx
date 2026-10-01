import { markPaths, MARK } from './geometry';
import './pact-logo.css';

export interface PactLogoProps {
  /** Mark plus the PACT wordmark (default), or just the mark. */
  markOnly?: boolean;
  /** sm: navigation and headers, md: default, lg: auth and Welcome, xl: hero moments. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * The colour of the logo, chosen for the surface it sits on:
   * `auto` follows the surrounding text colour (default), `dark` is ink for light surfaces,
   * `light` is white for dark or photographic surfaces.
   */
  tone?: 'auto' | 'dark' | 'light';
  /** `mono` (default) is one colour. `multi` adds the accents, for expressive moments only. */
  color?: 'mono' | 'multi';
  /** Exact mark size in px, for icon-scale uses (overrides `size` for the mark). */
  markSize?: number;
  /** Hide it from screen readers when the context already says PACT (a header with the product name nearby). */
  decorative?: boolean;
  className?: string;
}

const paths = markPaths();

/**
 * The PACT logo: the segmented loop, optionally with the wordmark. One component for every surface.
 * The wordmark is real text, so it is announced as "PACT"; a mark on its own gets a label unless `decorative`.
 */
export function PactLogo({ markOnly = false, size = 'md', tone = 'auto', color = 'mono', markSize, decorative = false, className = '' }: PactLogoProps) {
  const labelled = markOnly && !decorative;
  return (
    <span
      className={`pact-logo pact-logo--${size} pact-logo--${tone} pact-logo--${color} ${markOnly ? 'pact-logo--mark' : ''} ${className}`}
      style={markSize ? ({ ['--mark' as string]: `${markSize}px` } as React.CSSProperties) : undefined}
      {...(labelled ? { role: 'img', 'aria-label': 'PACT' } : {})}
      {...(markOnly && decorative ? { 'aria-hidden': true } : {})}
    >
      <svg className="pact-logo__mark" viewBox={`0 0 ${MARK.viewBox} ${MARK.viewBox}`} aria-hidden focusable="false">
        {paths.map((d, i) => (
          <path key={i} className={`pact-logo__piece pact-logo__piece--${i + 1}`} d={d} fill="none" strokeWidth={MARK.stroke} strokeLinecap="round" />
        ))}
      </svg>
      {!markOnly && <span className="pact-logo__word">PACT</span>}
    </span>
  );
}

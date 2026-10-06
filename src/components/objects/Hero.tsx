import type { ReactNode } from 'react';
import type { CircleTint } from '../../../shared/contracts';
import { ObjectArt, type ArtKind } from './ObjectArt';

/**
 * The top of a screen: one saturated colour (the thing's own), its title set large on it, and an object that belongs to it. The screen's
 * body then rises over it as a Sheet. Colour comes from the nearest tint class, so a Circle, a Plan, an Ask all commit to their own.
 */
export function Hero({ tint, art, children, className = '' }: { tint?: CircleTint | string; art?: ArtKind; children: ReactNode; className?: string }) {
  return (
    <header className={`xh ${tint ? `tint--${tint}` : ''} ${art ? 'xh--art' : ''} ${className}`}>
      {art && <ObjectArt kind={art} className="xh__art" />}
      <div className="xh__body">{children}</div>
    </header>
  );
}

/** What rises over the hero: the body of the screen, on the page colour, with a rounded top edge. */
export function Sheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`xs ${className}`}>{children}</div>;
}

/** The top of a list or settings screen: its colour, its title large, one line under it. The page body follows on the page colour, rising over the hero's rounded edge. */
export function PageHero({ tint, title, subtitle }: { tint: string; title: string; subtitle?: string }) {
  return (
    <Hero tint={tint} className="xh--page">
      <h1 className="xh__title">{title}</h1>
      {subtitle && <p className="xh__meta">{subtitle}</p>}
    </Hero>
  );
}

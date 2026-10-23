import type { ReactNode } from 'react';
import type { CircleTint } from '../../../shared/contracts';
import { ObjectArt, type ArtKind } from './ObjectArt';

/**
 * The top of a screen: one saturated colour (the thing's own), its title set large on it, and an object that belongs to it. The screen's
 * body then rises over it as a Sheet. Colour comes from the nearest tint class, so a Circle, a Plan, an Ask all commit to their own. An optional photo sits
 * under the colour, so the people the thing is about are felt before anything is read.
 */
export function Hero({ tint, art, photo, backdrop, children, className = '' }: { tint?: CircleTint | string; art?: ArtKind; photo?: string; backdrop?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <header className={`xh ${tint ? `tint--${tint}` : ''} ${art ? 'xh--art' : ''} ${className}`}>
      {photo && <img className="xh__photo" src={photo} alt="" aria-hidden loading="lazy" decoding="async" />}
      {backdrop}
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
export function PageHero({ tint, title, subtitle, photo }: { tint: string; title: string; subtitle?: ReactNode; photo?: string }) {
  return (
    <Hero tint={tint} photo={photo} className="xh--page">
      <h1 className="xh__title">{title}</h1>
      {subtitle && <p className="xh__meta">{subtitle}</p>}
    </Hero>
  );
}

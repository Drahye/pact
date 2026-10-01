import type { CSSProperties } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { friendColor } from '../../../data/landing';
import './orbit.css';

interface Ring {
  /** Share of the orbit box this ring fills. */
  size: number;
  seconds: number;
  reverse?: boolean;
  dashed?: boolean;
  /** People sat on the ring (angle in degrees) and plain coloured dots. */
  faces?: { id: string; deg: number; px?: number }[];
  dots?: { color: string; deg: number; px: number }[];
}

const pos = (deg: number): CSSProperties => ({
  left: `${50 + 50 * Math.cos((deg * Math.PI) / 180)}%`,
  top: `${50 + 50 * Math.sin((deg * Math.PI) / 180)}%`,
});

/**
 * The round motif: rings with people and coin-coloured dots travelling around the thing the group is
 * making happen. Pure CSS transforms (one rotation per ring, faces counter-rotate to stay upright),
 * paused for reduced motion, and decorative: the phone beside it carries the meaning.
 */
export function Orbit({ rings, className = '' }: { rings: Ring[]; className?: string }) {
  return (
    <div className={`orbit ${className}`} aria-hidden>
      {rings.map((r, i) => (
        <div
          key={i}
          className={`orbit__ring ${r.dashed ? 'is-dashed' : ''} ${r.reverse ? 'is-reverse' : ''}`}
          style={{ width: `${r.size}%`, height: `${r.size}%`, ['--dur' as string]: `${r.seconds}s` }}
        >
          {r.faces?.map((f) => (
            <span key={f.id} className="orbit__pin" style={pos(f.deg)}>
              <span className="orbit__face" style={{ ['--c' as string]: friendColor[f.id], ['--s' as string]: `${f.px ?? 52}px` }}>
                <Avatar userId={f.id} size="lg" label={false} />
              </span>
            </span>
          ))}
          {r.dots?.map((d, j) => (
            <span key={j} className="orbit__pin" style={pos(d.deg)}>
              <span className="orbit__dot" style={{ background: d.color, width: d.px, height: d.px }} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

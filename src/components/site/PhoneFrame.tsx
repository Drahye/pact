import type { ReactNode } from 'react';
import './phone-frame.css';

interface Props {
  src: string; // snapshot name in /public/snapshots
  alt: string;
  priority?: boolean;
  /** Drawn over the screen (spotlights, callouts). Positioned in screen space. */
  overlay?: ReactNode;
  className?: string;
}

/** A device frame around a real snapshot of the PACT app. */
export function PhoneFrame({ src, alt, priority, overlay, className = '' }: Props) {
  return (
    <div className={`phone ${className}`}>
      <div className="phone__status" aria-hidden>
        <span>9:41</span>
        <span className="phone__island" />
        <span className="phone__icons" />
      </div>
      <div className="phone__screen">
        <img src={`/snapshots/${src}.webp`} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" width={390} height={844} draggable={false} />
        {overlay}
      </div>
    </div>
  );
}

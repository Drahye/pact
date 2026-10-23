import type { ReactNode } from 'react';

export const img = (name: string) => `/home-photos/${name}.jpg`;

/**
 * One depth layer. The outer box takes the scroll parallax (data-speed), the inner box takes the pointer parallax (data-depth),
 * and whatever is inside keeps its own entrance animation, so the three never fight over the same transform.
 */
export function Layer({ speed = 0, depth = 0, className = '', children }: { speed?: number; depth?: number; className?: string; children: ReactNode }) {
  return (
    <div className={`lp2-layer ${className}`} data-speed={speed}>
      <div className="lp2-depth" data-depth={depth}>
        {children}
      </div>
    </div>
  );
}

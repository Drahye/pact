import type { CircleTint } from '../../../shared/contracts';
import '../pact/category.css';
import './circle.css';

/** A Circle's face: its emoji on its colour. Decorative; the Circle's name always sits next to it. */
export function CircleBadge({ emoji, tint, size = 'md' }: { emoji: string; tint: CircleTint; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <span className={`circle-badge circle-badge--${size} tint--${tint}`} aria-hidden>
      {emoji}
    </span>
  );
}

import type { IconName, Tone } from './model';
import { iconFor } from './icons';

/** The state in words and an icon, tinted by tone: colour supports the label, it never replaces it. */
export function CommunicationStatusBadge({ label, icon, tone }: { label: string; icon: IconName; tone: Tone }) {
  return (
    <span className={`comm-badge comm-badge--${tone}`}>
      <span className="comm-badge__icon" aria-hidden>
        {iconFor(icon)}
      </span>
      {label}
    </span>
  );
}

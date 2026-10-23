import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { coverUrl } from '../../lib/covers';
import './home-start.css';

const MOMENTS = [
  { key: 'trip-beach', label: 'The trip' },
  { key: 'wedding-aso-ebi', label: 'The wedding' },
  { key: 'birthday-hats', label: 'The birthday' },
  { key: 'dinner-table', label: 'The long table' },
];

/** The occasions people start with, as photographs. Each one is one tap into starting something, so the first offer is the people and the day, not a form. */
export function MomentTiles({ onPick, to }: { onPick?: (e: MouseEvent<HTMLButtonElement>) => void; to?: string }) {
  return (
    <ul className="hm-start__moments" aria-label="Moments people start with">
      {MOMENTS.map((m) => (
        <li key={m.key}>
          {to ? (
            <Link to={to} className="hm-moment">
              <img src={coverUrl(m.key)} alt="" loading="lazy" decoding="async" />
              <span>{m.label}</span>
            </Link>
          ) : (
            <button type="button" className="hm-moment" onClick={onPick}>
              <img src={coverUrl(m.key)} alt="" loading="lazy" decoding="async" />
              <span>{m.label}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

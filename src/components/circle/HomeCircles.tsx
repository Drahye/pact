import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCircles } from '../../api/circles';
import { SectionHeading } from '../ui/SectionHeading';
import { CircleBadge } from './CircleBadge';
import './circle.css';

/** A small, quiet shelf on Home. Pacts that need someone still come first. */
export function HomeCircles() {
  const circles = useCircles();
  if (circles.isLoading || circles.error) return null;
  const items = (circles.data ?? []).slice(0, 4);

  if (!items.length) {
    return (
      <section className="screen-section" aria-labelledby="home-circles">
        <Link to="/app/circles/new" className="home-circles__cta">
          <span className="icon-btn icon-btn--surface" aria-hidden>
            <Plus />
          </span>
          <span>
            <strong id="home-circles">Your people, in one place</strong>
            <span>Create a Circle for the groups you plan things with.</span>
          </span>
        </Link>
      </section>
    );
  }
  return (
    <section className="screen-section" aria-labelledby="home-circles">
      <SectionHeading id="home-circles" title="Your Circles" action={{ label: 'See all', to: '/app/circles' }} />
      <ul className="home-circles" aria-label="Your Circles">
        {items.map((c) => (
          <li key={c.id}>
            <Link to={`/app/circles/${c.id}`} className="home-circles__item">
              <CircleBadge emoji={c.emoji} tint={c.tint} size="md" />
              <span className="home-circles__name">{c.name}</span>
              <span className="home-circles__count">{c.memberCount} {c.memberCount === 1 ? 'person' : 'people'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

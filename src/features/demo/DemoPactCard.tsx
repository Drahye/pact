import { ArrowRight, Check, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CategoryIcon } from '../../components/pact/category';
import { AvatarGroup } from '../../components/ui/AvatarGroup';
import { categoryLabel } from '../../lib/pact';
import type { DemoPact } from './fixtures';
import './demo.css';

/**
 * A sample completed Pact, shown as a card. It always says "Demo" in words and with an icon (never colour alone):
 * these are examples of how people use PACT, not real customers.
 */
export function DemoPactCard({ demo, from, headingLevel = 'h3', compact = false }: { demo: DemoPact; from: 'onboarding' | 'home'; headingLevel?: 'h2' | 'h3'; compact?: boolean }) {
  const Heading = headingLevel;
  const p = demo.pact;
  const people = p.members.length;
  return (
    <article className="demo-card">
      <header className="demo-card__head">
        <CategoryIcon category={demo.category} size="md" />
        <div className="demo-card__title">
          <Heading>{p.title}</Heading>
          <p>{categoryLabel[demo.category]}</p>
        </div>
        <span className="demo-badge">
          <FlaskConical aria-hidden />
          Demo · Completed
        </span>
      </header>
      <p className="demo-card__meta num">
        {people} people · {demo.goalLabel}
      </p>
      {compact ? (
        <p className="demo-card__summary">
          <Check aria-hidden strokeWidth={3} /> {demo.summary}
        </p>
      ) : (
        <>
          <ul className="demo-card__ticks" aria-label="What got done">
            {demo.milestones.map((m) => (
              <li key={m}>
                <Check aria-hidden strokeWidth={3} /> {m}
              </li>
            ))}
          </ul>
          <div className="demo-card__foot">
            <AvatarGroup userIds={p.members.map((m) => m.userId)} max={4} size="sm" total={people} />
            <Link to={`/app/demo/${demo.id}`} state={{ from }} className="demo-card__link">
              See how this Pact worked <ArrowRight aria-hidden />
            </Link>
          </div>
        </>
      )}
    </article>
  );
}

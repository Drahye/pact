import { Link } from 'react-router-dom';
import { useCreateSheet } from '../create/CreateSheet';
import { coverUrl } from '../../lib/covers';
import { OBJECT_KINDS, type ObjectKind } from '../objects';
import { Button } from '../ui/Button';
import { MomentTiles } from './MomentTiles';
import './home-start.css';

const WHAT: { kind: ObjectKind; title: string; body: string; photo: string; to: string }[] = [
  { kind: 'ask', title: 'Settle things in a tap', body: 'Quick questions, answered in seconds.', photo: 'other-park', to: '/app/asks/new' },
  { kind: 'plan', title: 'Plan with real dates', body: 'See who is in, and when.', photo: 'trip-road', to: '/app/plans/new' },
  { kind: 'split', title: 'Split what you spend', body: 'Know who has paid and who has not.', photo: 'gift-laugh', to: '/app/splits/new' },
  { kind: 'pact', title: 'Commit to the big things', body: 'Money, tasks and a deadline, together.', photo: 'fund-hug-women', to: '/app/create' },
];

/**
 * Home when there is nothing of yours yet, or nothing running. One composed first experience instead of five "nothing here" boxes:
 * what PACT is for, one way to begin, and what you can make. It shows nothing that did not happen: no sample activity, no counts.
 */
export function HomeStart({ variant }: { variant: 'new' | 'again' }) {
  const create = useCreateSheet();
  const open = (e: React.MouseEvent<HTMLButtonElement>) => create.open({ from: 'home', origin: e.currentTarget.getBoundingClientRect() });
  if (variant === 'again') {
    return (
      <section className="hm-again" aria-labelledby="hm-again-h">
        <h2 id="hm-again-h" className="t-section">
          You’ve made things happen before.
        </h2>
        <p className="t-support">Nothing is waiting on you. Who do you want to do life with next?</p>
        <Button size="md" variant="ink" onClick={open}>
          Start something
        </Button>
      </section>
    );
  }
  return (
    <section className="hm-start" aria-labelledby="hm-start-h">
      <h2 id="hm-start-h" className="t-page hm-start__title">
        Life is better when everyone shows up.
      </h2>
      <p className="t-body hm-start__lede">Pick a moment you want to happen with your people, or start a Circle first.</p>
      <MomentTiles onPick={open} />
      <div className="hm-start__actions">
        <Button size="lg" onClick={open}>
          Start something
        </Button>
        <Link to="/app/circles/new" className="act act--text">
          Start a Circle
        </Link>
      </div>
      <ul className="hm-start__kinds" aria-label="What you can make">
        {WHAT.map((w) => (
          <li key={w.kind} className={`tint--${OBJECT_KINDS[w.kind].tint}`}>
            <Link to={w.to} className="hm-kind">
              <img src={coverUrl(w.photo)} alt="" aria-hidden loading="lazy" decoding="async" />
              <span className="hm-kind__icon" aria-hidden>
                {OBJECT_KINDS[w.kind].icon}
              </span>
              <span className="hm-kind__text">
                <strong>{w.title}</strong>
                <span>{w.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/app/onboarding?replay=1" className="act act--text hm-start__intro">
        Watch the quick intro
      </Link>
    </section>
  );
}

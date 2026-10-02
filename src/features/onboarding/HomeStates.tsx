import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PactCard } from '../../components/pact/PactCard';
import { Button } from '../../components/ui/Button';
import { SectionHeading } from '../../components/ui/SectionHeading';
import type { Pact } from '../../data/types';
import { categoryLabel } from '../../lib/pact';
import { DemoPactCard } from '../demo/DemoPactCard';
import { DEMOS, DEMO_ORDER } from '../demo/fixtures';
import './home-states.css';

const STEPS = [
  ['Invite your people', 'One link, shared where your group already is.'],
  ['Everyone brings something', 'Money, a task, or both.'],
  ['See what’s done and what’s left', 'No chasing, no guessing.'],
  ['Finish it together', 'Pay for the plan from the Pact, then complete it.'],
];

/**
 * Home for someone with nothing started yet. Never a blank page: the two things to do, proof of how others use PACT (clearly
 * labelled samples), and a short reminder of how it works. Education lives here only until they have a Pact of their own.
 */
export function HomeFirstTime() {
  return (
    <div className="hs">
      <section className="hs__start" aria-labelledby="hs-ready">
        <h2 id="hs-ready" className="hs__title">
          Ready to make something happen together?
        </h2>
        <p className="hs__lede">A trip, a gift, a birthday, a shared bill. Start with one real plan.</p>
        <div className="hs__ctas">
          <Button to="/app/start" state={{ from: 'home' }} fullWidth iconRight={<ArrowRight />}>
            Start a Pact
          </Button>
          <Button to="/app/join-invite" variant="secondary" fullWidth>
            Join with invite
          </Button>
        </div>
      </section>

      <section className="screen-section" aria-labelledby="hs-proof">
        <SectionHeading id="hs-proof" title="See how people use PACT" />
        <p className="hs__sample">Sample Pacts, to show what’s possible. Not real customers.</p>
        <div className="list-stack">
          {DEMO_ORDER.map((id) => (
            <DemoPactCard key={id} demo={DEMOS[id]} from="home" />
          ))}
        </div>
      </section>

      <section className="screen-section" aria-labelledby="hs-how">
        <SectionHeading id="hs-how" title="How PACT works" />
        <ol className="hs__steps">
          {STEPS.map(([t, b], i) => (
            <li key={t}>
              <span className="hs__n num" aria-hidden>
                {i + 1}
              </span>
              <span>
                <strong>{t}</strong>
                <span>{b}</span>
              </span>
            </li>
          ))}
        </ol>
        <Link to="/app/onboarding?replay=1" className="hs__help">
          Watch the quick intro <ArrowRight aria-hidden />
        </Link>
      </section>
    </div>
  );
}

/**
 * Home for someone who has finished Pacts but has nothing running. They are not new: no intro, no demos. Their own history
 * first, then an easy way to go again.
 */
export function HomeRepeat({ finished }: { finished: Pact[] }) {
  const last = finished[0];
  return (
    <div className="hs">
      <section className="hs__start" aria-labelledby="hs-again">
        <h2 id="hs-again" className="hs__title">
          {finished.length ? 'You’ve made things happen before.' : 'Ready for your next plan?'}
        </h2>
        <p className="hs__lede">{finished.length ? 'Nothing is running right now. Start the next one, or join someone else’s.' : 'Nothing is running right now.'}</p>
        <div className="hs__ctas">
          <Button to="/app/start" state={{ from: 'home' }} fullWidth iconRight={<ArrowRight />}>
            Create another Pact
          </Button>
          <Button to="/app/join-invite" variant="secondary" fullWidth>
            Join with invite
          </Button>
        </div>
      </section>

      {last && (
        <Link to={`/app/start?category=${last.category}`} state={{ from: 'home' }} className="hs__repeat">
          <span className="hs__repeat-icon" aria-hidden>
            <RotateCcw />
          </span>
          <span>
            <strong>Do another {categoryLabel[last.category].toLowerCase()}</strong>
            <span>Start the same kind of plan with a fresh name and date.</span>
          </span>
          <ArrowRight aria-hidden />
        </Link>
      )}

      {finished.length > 0 && (
        <section className="screen-section" aria-labelledby="hs-done">
          <SectionHeading id="hs-done" title="Your completed Pacts" />
          <div className="list-stack">
            {finished.slice(0, 3).map((p) => (
              <PactCard key={p.id} pact={p} to={`/app/pact/${p.id}`} />
            ))}
          </div>
          <p className="hs__proud">
            <Check aria-hidden strokeWidth={3} /> {finished.length} finished together
          </p>
        </section>
      )}
    </div>
  );
}

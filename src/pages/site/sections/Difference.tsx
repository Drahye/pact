import { ArrowRight, CircleDot, Coins, Compass, Link2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Reveal } from '../../../components/site/Reveal';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { ExecutionMock, type MockPart } from '../mockups/Mockups';

const points: { part: MockPart; icon: typeof Coins; title: string; body: string }[] = [
  { part: 'bring', icon: Coins, title: 'Everyone brings something', body: 'Money, tasks, or both. Taking a task counts as showing up.' },
  { part: 'next', icon: Compass, title: 'Know what needs to happen next', body: 'PACT shows what still needs attention, so nobody has to ask.' },
  { part: 'use', icon: CircleDot, title: 'Use the money for the plan', body: 'Once funded, the group can pay for what the Pact was created for, straight from the Pact.' },
  { part: 'context', icon: Link2, title: 'Keep the plan attached to the action', body: 'Tasks, payments, updates and completion all stay in context, in one place.' },
];

/** Funded is not the finish line: the execution layer, with the points lighting the part of the screen they describe. */
export function Difference() {
  const [lit, setLit] = useState<MockPart | null>(null);
  return (
    <section id="difference" className="section diff" aria-labelledby="diff-title">
      <div className="container diff__grid">
        <div className="diff__copy">
          <Reveal>
            <SectionHeading
              variant="site"
              id="diff-title"
              eyebrow="What makes PACT different"
              title="Funded is not finished."
              description="Pooled money, bill splitting and crowdfunding all stop when the pot is full. PACT keeps going until the plan is done."
            />
          </Reveal>
          <ul className="diff__points" onMouseLeave={() => setLit(null)}>
            {points.map(({ part, icon: Icon, title, body }, i) => (
              <Reveal as="li" key={part} delay={0.06 * i} y={16}>
                <button
                  type="button"
                  className={`diff__point ${lit === part ? 'is-on' : ''}`}
                  onMouseEnter={() => setLit(part)}
                  onFocus={() => setLit(part)}
                  onBlur={() => setLit(null)}
                  onClick={() => setLit(lit === part ? null : part)}
                  aria-pressed={lit === part}
                >
                  <span className="diff__icon" aria-hidden>
                    <Icon />
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <span>{body}</span>
                  </span>
                </button>
              </Reveal>
            ))}
          </ul>
          <Button to="/app" variant="secondary" iconRight={<ArrowRight />} className="diff__cta">
            Start a Pact
          </Button>
        </div>
        <Reveal className="diff__visual" delay={0.1} y={36}>
          <span className="diff__orb diff__orb--a" aria-hidden />
          <span className="diff__orb diff__orb--b" aria-hidden />
          <span className="diff__orb diff__orb--c" aria-hidden />
          <ExecutionMock lit={lit} />
        </Reveal>
      </div>
    </section>
  );
}

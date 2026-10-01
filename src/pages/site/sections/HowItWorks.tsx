import { Reveal } from '../../../components/site/Reveal';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { CompleteMock, InviteMock, MoveMock, StartMock } from '../mockups/Mockups';

const steps = [
  { tint: 'sun', title: 'Start the plan', body: 'Create a Pact for a trip, gift, event or shared expense. Name it, set the goal and the date.', Mock: StartMock },
  { tint: 'sky', title: 'Bring your people in', body: 'Share one link. Everyone can contribute money, effort, or both.', Mock: InviteMock },
  { tint: 'coral', title: 'Move it forward', body: 'Track progress, pay for what the plan needs, and see what still needs attention.', Mock: MoveMock },
  { tint: 'lilac', title: 'Complete it', body: 'Finish the plan, add the memory, and close the loop.', Mock: CompleteMock },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="section how" aria-labelledby="how-title">
      <div className="container">
        <Reveal>
          <SectionHeading variant="site" id="how-title" eyebrow="How it works" title="From “we should” to done, in four steps." />
        </Reveal>
        <ol className="how__steps">
          {steps.map(({ tint, title, body, Mock }, i) => (
            <Reveal as="li" key={title} className={`how__step how__step--${tint}`} delay={i * 0.08} y={28}>
              <div className="how__stage">
                <Mock />
              </div>
              <p className="how__n num" aria-hidden>
                {i + 1}
              </p>
              <h3 className="how__title">{title}</h3>
              <p className="how__body">{body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

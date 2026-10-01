import { Check, X } from 'lucide-react';
import { Reveal } from '../../../components/site/Reveal';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { GroupChatMock, PactSnapshotMock } from '../mockups/Mockups';

const without = ['Money lives in transfers and screenshots', 'Tasks get buried in the chat', 'One person chases everyone', 'Nobody knows what is left'];
const withPact = ['Everyone sees the plan and the progress', 'People bring money, effort, or both', 'The money can be used for the plan', 'The group gets to the finish'];

/** The problem, shown rather than described: the same plan in the group chat and in PACT. */
export function WhyPact() {
  return (
    <section id="why" className="section why" aria-labelledby="why-title">
      <div className="container">
        <Reveal>
          <SectionHeading
            variant="site"
            align="center"
            id="why-title"
            eyebrow="Why PACT exists"
            title="Keep the group chat. Put the plan in PACT."
            description="Chats are great for talking. They are terrible at knowing who has paid, who is doing what, and what is left."
          />
        </Reveal>
        <div className="why__grid">
          <Reveal className="why__side why__side--without" y={28}>
            <div className="why__mock why__mock--chat">
              <GroupChatMock />
            </div>
            <h3 className="why__label">Without PACT</h3>
            <ul className="why__list">
              {without.map((t) => (
                <li key={t}>
                  <span className="why__mark why__mark--no" aria-hidden>
                    <X />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="why__side why__side--with" delay={0.12} y={28}>
            <div className="why__mock">
              <PactSnapshotMock />
            </div>
            <h3 className="why__label">With PACT</h3>
            <ul className="why__list">
              {withPact.map((t) => (
                <li key={t}>
                  <span className="why__mark why__mark--yes" aria-hidden>
                    <Check strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

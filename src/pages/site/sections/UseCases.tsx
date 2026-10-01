import { Gift, Heart, House, PartyPopper, Plane, type LucideIcon } from 'lucide-react';
import { Reveal } from '../../../components/site/Reveal';
import { SectionHeading } from '../../../components/ui/SectionHeading';

const cases: { tint: string; icon: LucideIcon; title: string; line: string; example: string }[] = [
  { tint: 'sky', icon: Plane, title: 'Trips', line: 'Flights, stays and who books what.', example: 'Zanzibar weekend · 6 friends' },
  { tint: 'coral', icon: Gift, title: 'Birthdays and gifts', line: 'One gift, everyone in, nobody chasing.', example: 'Sarah’s Birthday · 8 people' },
  { tint: 'pink', icon: Heart, title: 'Weddings', line: 'Aso ebi, food, the venue. Shared costs and shared jobs.', example: 'Wedding contributions · 24 guests' },
  { tint: 'mint', icon: House, title: 'Moving and shared expenses', line: 'Rent, furniture, bills. Everyone sees what is paid.', example: 'New flat setup · 4 housemates' },
  { tint: 'sun', icon: PartyPopper, title: 'Group events and dinners', line: 'Owambe, team dinners, match day. Pay the vendors from the Pact.', example: 'Team dinner · 12 people' },
];

/** Relatable situations, not categories: each one says what the group actually does. */
export function UseCases() {
  return (
    <section id="plans" className="section cases" aria-labelledby="cases-title">
      <div className="container">
        <Reveal>
          <SectionHeading variant="site" id="cases-title" eyebrow="Real plans" title="If your group is planning it, PACT fits." />
        </Reveal>
        <ul className="cases__grid">
          {cases.map(({ tint, icon: Icon, title, line, example }, i) => (
            <Reveal as="li" key={title} className={`case case--${tint}`} delay={(i % 3) * 0.07} y={24}>
              <span className="case__icon" aria-hidden>
                <Icon />
              </span>
              <h3 className="case__title">{title}</h3>
              <p className="case__line">{line}</p>
              <p className="case__example">{example}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

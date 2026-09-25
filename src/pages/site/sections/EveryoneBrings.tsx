import { Check, CircleDot } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { getUser } from '../../../data/users';
import { formatNaira } from '../../../lib/format';

/** Money is one way to show up. A task is another. The same Pact holds both. */
export function EveryoneBrings() {
  const maya = getUser('maya');
  const tolu = getUser('tolu');
  const abraham = getUser('abraham');
  return (
    <section className="section brings" aria-labelledby="brings-title">
      <div className="container">
        <SectionHeading
          id="brings-title"
          variant="site"
          align="center"
          eyebrow="Showing up"
          title="Everyone brings something."
          description="Not everyone can put in money, and not everything needs money. Someone books the table, someone picks up the cake."
        />
        <div className="brings__grid">
          <article className="brings__card brings__card--money">
            <p className="brings__kind">Money</p>
            <div className="brings__visual" aria-hidden>
              <Avatar userId="maya" size="lg" label={false} accent />
              <p>
                <strong>{maya.name}</strong> added <strong className="num brings__amount" style={{ ['--c' as string]: maya.color }}>{formatNaira(45_000)}</strong>
              </p>
            </div>
            <p className="brings__copy">Contribute from your wallet or pay straight in. Everyone sees it land.</p>
          </article>
          <article className="brings__card brings__card--task">
            <p className="brings__kind">A task</p>
            <div className="brings__visual brings__visual--task" aria-hidden>
              <span className="brings__status">
                <CircleDot />
              </span>
              <span className="brings__task">
                <strong>Pick up the cake</strong>
                <small>In progress</small>
              </span>
              <Avatar userId="tolu" size="sm" label={false} accent />
            </div>
            <p className="brings__copy">{tolu.name} is handling the cake. Taking a task counts as showing up.</p>
          </article>
          <article className="brings__card brings__card--both">
            <p className="brings__kind">Both</p>
            <div className="brings__visual" aria-hidden>
              <Avatar userId="abraham" size="lg" label={false} accent />
              <p>
                <strong className="num brings__amount" style={{ ['--c' as string]: abraham.color }}>{formatNaira(40_000)}</strong>
                <span className="brings__plus">+</span>
                <span className="brings__done">
                  <Check /> Buy the gift
                </span>
              </p>
            </div>
            <p className="brings__copy">Put in money and take something off the list.</p>
          </article>
        </div>
        <p className="brings__later">Not sure yet? Say you’re in and confirm later.</p>
      </div>
    </section>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import { Cake, PartyPopper, Plane } from 'lucide-react';
import { useState } from 'react';
import { PactPanel } from '../../../components/pact/PactPanel';
import { Reveal } from '../../../components/site/Reveal';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { Segmented } from '../../../components/ui/Segmented';
import { scenarios, type Scenario } from '../../../data/scenarios';
import { formatNaira } from '../../../lib/format';
import { categoryLabel } from '../../../lib/pact';

const icons = { trip: <Plane />, gift: <Cake />, event: <PartyPopper /> };
const roundTo = (n: number, step: number) => Math.ceil(n / step) * step;

export function Scenarios() {
  const [id, setId] = useState<Scenario['id']>('trip');
  const sc = scenarios.find((x) => x.id === id)!;
  const each = roundTo(sc.target / sc.memberIds.length, 1000);

  return (
    <section id="plans" className={`section scenarios scenarios--${id}`} aria-labelledby="scenarios-title">
      <div className="container scenarios__grid">
        <div className="scenarios__intro">
          <Reveal>
            <SectionHeading
              variant="site"
              id="scenarios-title"
              eyebrow="Built for real plans"
              title="Start with what you’re planning."
              description="Trips, gifts, events, shared bills. The Pact stays the same simple object. Only the goal changes."
            />
          </Reveal>

          <Reveal delay={0.1} className="scenarios__choices-wrap">
            <div className="scenarios__choices" role="radiogroup" aria-label="Choose a plan">
              {scenarios.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={x.id === id}
                  className={`scenario ${x.id === id ? 'is-active' : ''}`}
                  onClick={() => setId(x.id)}
                  onKeyDown={(e) => {
                    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
                    e.preventDefault();
                    const i = scenarios.findIndex((s) => s.id === id);
                    const next = scenarios[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + scenarios.length) % scenarios.length];
                    setId(next.id);
                    (e.currentTarget.parentElement?.children[scenarios.indexOf(next)] as HTMLElement)?.focus();
                  }}
                  tabIndex={x.id === id ? 0 : -1}
                >
                  <span className="scenario__icon" aria-hidden>
                    {icons[x.id]}
                  </span>
                  <span className="scenario__text">
                    <span className="scenario__label">{x.label}</span>
                    <span className="scenario__line">{x.line}</span>
                  </span>
                </button>
              ))}
            </div>
            <Segmented
              label="Choose a plan"
              className="scenarios__segmented"
              size="lg"
              value={id}
              onChange={setId}
              options={scenarios.map((x) => ({ value: x.id, label: x.label }))}
            />
          </Reveal>
        </div>

        <Reveal delay={0.15} className="scenarios__stage" y={32}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={sc.id}
              className="scenarios__line"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              {sc.line}
            </motion.p>
          </AnimatePresence>
          <PactPanel
            size="md"
            title={sc.title}
            eyebrow={`${categoryLabel[sc.category]} · ${sc.memberIds.length} people`}
            raised={sc.raised}
            target={sc.target}
            daysLeft={sc.daysLeft}
            memberIds={sc.memberIds}
            memberLabel={`${sc.memberIds.length} people`}
            footer={
              <p className="scenarios__split">
                Split evenly, that’s about <strong className="num">{formatNaira(each)}</strong> each.
              </p>
            }
          />
        </Reveal>
      </div>
    </section>
  );
}
